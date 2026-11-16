"""同尺寸分组：对齐后两两相似度 + 组内平均脸 / 方差图。只读分析。

对齐：以 A 为参考，对 B 做尺度 s 与平移 (dx,dy) 网格搜索，
在中心区域上最大化 Pearson 相关，取最优值作为相似度。
"""
import itertools
import pathlib

import cv2
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[1]
DIR = ROOT / "Log/Circle8/output/v3-fixed10"
CW, CH = 384, 512
BANDS = [("额顶 0-15", 0.00, 0.15), ("眉眼 15-35", 0.15, 0.35),
         ("鼻 35-55", 0.35, 0.55), ("口 55-72", 0.55, 0.72),
         ("下巴 72-90", 0.72, 0.90), ("画面底 90-100", 0.90, 1.00)]


def load(p):
    img = cv2.imread(str(p))
    img = cv2.resize(img, (CW, CH), interpolation=cv2.INTER_AREA)
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    return img, cv2.GaussianBlur(g.astype(np.float32), (0, 0), 1.2)


def warp(img, s, dx, dy, size):
    w, h = size
    M = np.array([[s, 0, dx * w / CW], [0, s, dy * h / CH]], np.float32)
    return cv2.warpAffine(img, M, (w, h), flags=cv2.INTER_LINEAR,
                          borderMode=cv2.BORDER_REPLICATE)


def ncc(a, b, mask):
    x, y = a[mask], b[mask]
    x = x - x.mean()
    y = y - y.mean()
    d = np.sqrt((x * x).sum() * (y * y).sum())
    return float((x * y).sum() / d) if d else 0.0


def mask_of(size, inset=0.08):
    w, h = size
    m = np.zeros((h, w), bool)
    m[int(h * inset):int(h * (1 - inset)), int(w * inset):int(w * (1 - inset))] = True
    return m


def best(ref, mov):
    """粗搜（192x256）→ 精修（全尺寸），返回 (s, dx, dy, ncc)。"""
    sw, sh = CW // 2, CH // 2
    r2 = cv2.resize(ref, (sw, sh), interpolation=cv2.INTER_AREA)
    m2 = cv2.resize(mov, (sw, sh), interpolation=cv2.INTER_AREA)
    mk2 = mask_of((sw, sh))
    bestv, bestp = -2.0, (1.0, 0.0, 0.0)
    for s in np.arange(0.94, 1.061, 0.02):
        for dx in range(-8, 9, 4):
            for dy in range(-8, 9, 4):
                v = ncc(r2, warp(m2, s, dx, dy, (sw, sh)), mk2)
                if v > bestv:
                    bestv, bestp = v, (s, dx, dy)
    s0, dx0, dy0 = bestp
    mk = mask_of((CW, CH))
    for s in np.arange(s0 - 0.02, s0 + 0.021, 0.01):
        for dx in range(int(dx0) - 3, int(dx0) + 4):
            for dy in range(int(dy0) - 3, int(dy0) + 4):
                v = ncc(ref, warp(mov, s, dx, dy, (CW, CH)), mk)
                if v > bestv:
                    bestv, bestp = v, (s, dx, dy)
    return bestp[0], bestp[1], bestp[2], bestv


def band_ncc(ref, wmov):
    out = []
    for name, a, b in BANDS:
        y0, y1 = int(CH * a), int(CH * b)
        mk = np.zeros((CH, CW), bool)
        mk[y0:y1, int(CW * 0.10):int(CW * 0.90)] = True
        out.append((name, ncc(ref, wmov, mk)))
    return out


groups = {}
for f in sorted(p for p in DIR.glob("portrait-*.png") if "-grid" not in p.name):
    h, w = cv2.imread(str(f)).shape[:2]
    groups.setdefault((w, h), []).append(f)

report = []
means = {}
for size, items in sorted(groups.items()):
    tag = f"{size[0]}x{size[1]}"
    gray = [load(f) for f in items]
    ref = gray[0][1]
    tags = [f.stem.split("-")[-1] for f in items]
    report.append(f"\n=== {tag}  {tags}")

    raw = []
    pair = []
    band_acc = {n: [] for n, _, _ in BANDS}
    warped = []
    for i, j in itertools.combinations(range(len(items)), 2):
        a, b = gray[i][1], gray[j][1]
        mk = mask_of((CW, CH))
        raw.append(ncc(a, b, mk))
        s, dx, dy, v = best(a, b)
        pair.append(v)
        for n, bv in band_ncc(a, warp(b, s, dx, dy, (CW, CH))):
            band_acc[n].append(bv)
        report.append(f"  {tags[i]} vs {tags[j]}: 对齐后 {v:+.3f}  (s={s:.2f} dx={dx:+d} dy={dy:+d})  未对齐 {raw[-1]:+.3f}")
    if pair:
        p = np.array(pair)
        report.append(f"  → 对齐后均值 {p.mean():+.3f}  最低 {p.min():+.3f}  最高 {p.max():+.3f}")
        report.append(f"  → 未对齐均值 {np.mean(raw):+.3f}")
        report.append("  → 分带相似度：" + "  ".join(
            f"{n} {np.mean(v):+.3f}" for n, v in band_acc.items() if v))

        # 组内平均脸与离散度：全部对齐到 0 号再平均
        base = gray[0][1]
        warped = [gray[0][0]]
        for j in range(1, len(items)):
            s2, dx2, dy2, _v2 = best(base, gray[j][1])
            warped.append(warp(gray[j][0], s2, dx2, dy2, (CW, CH)))
        acc = np.zeros((CH, CW, 3), np.float64)
        for w_ in warped:
            acc += w_.astype(np.float64)
        acc /= len(warped)
        var = np.zeros((CH, CW), np.float64)
        for w_ in warped:
            var += np.abs(w_.astype(np.float64) - acc).mean(axis=2)
        var /= len(warped)
        mean_img = acc.astype(np.uint8)
        cv2.imwrite(str(DIR / f"group-{tag}-mean.png"), mean_img)
        heat = cv2.applyColorMap((np.clip(var / max(var.max(), 1e-6), 0, 1) * 255
                                  ).astype(np.uint8), cv2.COLORMAP_INFERNO)
        cv2.imwrite(str(DIR / f"group-{tag}-var.png"), heat)
        report.append(f"  → 组内平均偏差 {var.mean():.1f}/255，最大热点 {var.max():.1f}/255")
        means[tag] = mean_img
        report.append(f"  → 已存 group-{tag}-mean.png / -var.png")

# 跨组对照
if len(means) == 2:
    (t1, m1), (t2, m2) = sorted(means.items())
    g1 = cv2.cvtColor(m1, cv2.COLOR_BGR2GRAY).astype(np.float32)
    g2 = cv2.cvtColor(m2, cv2.COLOR_BGR2GRAY).astype(np.float32)
    s, dx, dy, v = best(g1, g2)
    report.append(f"\n=== 跨组：{t1} 平均脸 vs {t2} 平均脸  对齐后 {v:+.3f} (s={s:.2f} dx={dx:+d} dy={dy:+d})")
    diff = cv2.absdiff(m1, warp(m2, s, dx, dy, (CW, CH)))
    cv2.imwrite(str(DIR / "group-cross-diff.png"), diff)

text = "\n".join(report)
print(text)
(DIR / "similarity.txt").write_text(text + "\n", encoding="utf-8")
