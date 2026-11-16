"""Circle10 肖像一致性体检 v3：眼位对齐 + 身份相似 + 眼部比例 + 构图合规。

方法：Haar 眼级联取双眼框（全脸级联在极紧景别下大面积漏检，眼级联反而稳），
以双眼中心连线做旋转与尺度归一（瞳孔距固定 100px），再取固定窗口算 NCC。
跨片与片内用同一套对齐，两者之差即「同人不同片」的损失。

用法：python Log/Circle10/consistency.py
"""
import itertools
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "Tool" / "_deps"))
sys.path.insert(0, str(ROOT / "Tool" / "_deps_cv4"))  # cv2 5.0 无 CascadeClassifier
import cv2
import numpy as np

OUT = ROOT / "Log" / "Circle10" / "output"
VIDEOS = {"a": OUT / "v1-a.mp4", "b": OUT / "v1-b.mp4"}
EYE = cv2.CascadeClassifier(str(ROOT / "Tool/_deps/cv2/data/haarcascade_eye.xml"))
FACE = cv2.CascadeClassifier(str(ROOT / "Tool/_deps/cv2/data/haarcascade_frontalface_default.xml"))
IPD = 100.0          # 归一到 100px
WIN = (300, 380)     # 对齐全脸窗口
TS = [0.0, 1.0, 2.0, 3.0, 4.0, 5.0]


def eye_pair(gray):
    h, w = gray.shape
    boxes = EYE.detectMultiScale(gray[:int(h * 0.62)], 1.05, 6, minSize=(int(w * 0.06), int(w * 0.06)))
    boxes = [b for b in boxes if b[2] < w * 0.45]
    if len(boxes) < 2:
        return None
    best = None
    for b1, b2 in itertools.combinations(boxes, 2):
        x1, y1, w1, h1 = b1
        x2, y2, w2, h2 = b2
        if x1 > x2:
            (x1, y1, w1, h1), (x2, y2, w2, h2) = (x2, y2, w2, h2), (x1, y1, w1, h1)
        c1 = (x1 + w1 / 2, y1 + h1 / 2)
        c2 = (x2 + w2 / 2, y2 + h2 / 2)
        dy = abs(c1[1] - c2[1])
        size_ratio = min(w1, w2) / max(w1, w2)
        if size_ratio < 0.7 or dy > (c2[0] - c1[0]) * 0.35:
            continue
        score = size_ratio - dy / w * 4
        if best is None or score > best[0]:
            best = (score, (x1, y1, w1, h1), (x2, y2, w2, h2))
    if best is None:
        return None
    return best[1], best[2]


def align(img, pair):
    (x1, y1, w1, h1), (x2, y2, w2, h2) = pair
    c1 = np.array([x1 + w1 / 2, y1 + h1 / 2], np.float32)
    c2 = np.array([x2 + w2 / 2, y2 + h2 / 2], np.float32)
    ipd = float(np.hypot(*(c2 - c1)))
    ang = np.degrees(np.arctan2(c2[1] - c1[1], c2[0] - c1[0]))
    M = cv2.getRotationMatrix2D(((c1 + c2) / 2).tolist(), ang, IPD / ipd)
    return cv2.warpAffine(img, M, (img.shape[1], img.shape[0]), flags=cv2.INTER_CUBIC)


def crop(aligned, pair):
    (x1, y1, w1, h1), (x2, y2, w2, h2) = pair
    cx = (x1 + w1 / 2 + x2 + w2 / 2) / 2
    cy = (y1 + h1 / 2 + y2 + h2 / 2) / 2
    x0 = int(cx - 1.5 * IPD); y0 = int(cy - 1.0 * IPD)
    x1_ = int(cx + 1.5 * IPD); y1_ = int(cy + 2.8 * IPD)
    pad_x0, pad_y0 = max(0, -x0), max(0, -y0)
    x0, y0 = max(0, x0), max(0, y0)
    x1_ = min(aligned.shape[1], x1_); y1_ = min(aligned.shape[0], y1_)
    sub = aligned[y0:y1_, x0:x1_]
    sub = np.pad(sub, ((pad_y0, 0), (pad_x0, 0), (0, 0)), mode="edge") if (pad_x0 or pad_y0) else sub
    return cv2.resize(sub, WIN, interpolation=cv2.INTER_AREA)


def ncc(a, b, inset=0.08):
    h, w = a.shape
    m = np.zeros((h, w), bool)
    m[int(h * inset):int(h * (1 - inset)), int(w * inset):int(w * (1 - inset))] = True
    x, y = a[m].astype(np.float32), b[m].astype(np.float32)
    x -= x.mean(); y -= y.mean()
    d = np.sqrt((x * x).sum() * (y * y).sum())
    return float((x * y).sum() / d) if d else 0.0


def score(ref, mov, rng=6):
    rg = cv2.GaussianBlur(cv2.cvtColor(ref, cv2.COLOR_BGR2GRAY).astype(np.float32), (0, 0), 1.2)
    mg = cv2.GaussianBlur(cv2.cvtColor(mov, cv2.COLOR_BGR2GRAY).astype(np.float32), (0, 0), 1.2)
    best = -1.0
    for dx in range(-rng, rng + 1, 2):
        for dy in range(-rng, rng + 1, 2):
            M = np.array([[1, 0, dx], [0, 1, dy]], np.float32)
            w = cv2.warpAffine(mg, M, (WIN[0], WIN[1]), flags=cv2.INTER_LINEAR,
                               borderMode=cv2.BORDER_REPLICATE)
            best = max(best, ncc(rg, w))
    return best


def main():
    rec = {}
    for k, path in VIDEOS.items():
        cap = cv2.VideoCapture(str(path))
        fps = cap.get(cv2.CAP_PROP_FPS)
        W = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)); H = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        rows, i = [], 0
        while True:
            ok, fr = cap.read()
            if not ok:
                break
            t = i / fps
            g = cv2.cvtColor(fr, cv2.COLOR_BGR2GRAY)
            pair = eye_pair(g)
            if pair is not None:
                al = align(fr, pair)
                (x1, y1, w1, h1), (x2, y2, w2, h2) = pair
                c1 = np.array([x1 + w1 / 2, y1 + h1 / 2]); c2 = np.array([x2 + w2 / 2, y2 + h2 / 2])
                ipd = float(np.hypot(*(c2 - c1)))
                inner = float(c2[0] - (x1 + w1))  # 内眦近似
                faces = FACE.detectMultiScale(g, 1.05, 3, minSize=(80, 80))
                fw = max(faces, key=lambda r: r[2] * r[3])[2] / W if len(faces) else None
                rows.append({"t": t, "ipd_px": ipd, "ipd_frac": ipd / W,
                             "eye_w": (w1 + w2) / 2 / ipd, "inner_ratio": inner / ipd,
                             "yaw": float(np.degrees(np.arctan2(c2[1] - c1[1], c2[0] - c1[0]))),
                             "face_w": fw, "crop": crop(al, pair)})
            else:
                rows.append({"t": t, "fail": True})
            i += 1
        cap.release()
        good = [r for r in rows if "crop" in r]
        rec[k] = {"good": good, "fps": fps, "size": (W, H), "n": len(rows)}
        print(f"\n=== {k} ===  {W}×{H}  {len(rows)} 帧  fps {fps:.1f}  眼位检出 {len(good)}/{len(rows)}")
        if not good:
            continue
        for key, label, fmt in (("ipd_frac", "瞳孔距/画幅宽", "%.3f"),
                                ("eye_w", "眼裂宽/瞳孔距", "%.3f"),
                                ("inner_ratio", "内眦距/瞳孔距", "%.3f"),
                                ("yaw", "眼线倾角(度)", "%+.1f")):
            v = np.array([r[key] for r in good])
            print("  %-14s mean %s  min %s  max %s  极差 %s" %
                  (label, fmt % v.mean(), fmt % v.min(), fmt % v.max(), fmt % (v.max() - v.min())))
        fw = [r["face_w"] for r in good if r["face_w"]]
        if fw:
            print("  脸宽(全脸级联)/画幅  mean %.3f  n=%d" % (np.mean(fw), len(fw)))
        for t in TS:
            n = min(good, key=lambda r: abs(r["t"] - t))
            print("   t=%.0fs 瞳孔距 %.3f 眼裂 %.3f 内眦 %.3f 倾角 %+.1f" %
                  (t, n["ipd_frac"], n["eye_w"], n["inner_ratio"], n["yaw"]))

    def at(k, t):
        return min(rec[k]["good"], key=lambda r: abs(r["t"] - t))

    print("\n=== 身份相似：眼位对齐后 NCC ===")
    print("  样本对                  NCC")
    pairs = []
    for t in TS:
        pairs.append(("跨片 a%.0f-b%.0f" % (t, t), at("a", t), at("b", t)))
    for t1, t2 in [(3.0, 5.0), (4.0, 5.0)]:
        pairs.append(("片内 a%.0f-a%.0f" % (t1, t2), at("a", t1), at("a", t2)))
        pairs.append(("片内 b%.0f-b%.0f" % (t1, t2), at("b", t1), at("b", t2)))
    cross, within = [], []
    for name, x, y in pairs:
        s = score(x["crop"], y["crop"])
        print("  %-20s %.3f" % (name, s))
        (cross if name.startswith("跨片") else within).append(s)
    print("  跨片 mean %.3f (n=%d)   片内 mean %.3f (n=%d)   差 %.3f" %
          (np.mean(cross), len(cross), np.mean(within), len(within), np.mean(within) - np.mean(cross)))

    tiles = []
    for t in TS:
        for k in ("a", "b"):
            im = at(k, t)["crop"].copy()
            cv2.putText(im, f"{k} {t:.0f}s", (8, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.7,
                        (0, 255, 255), 2, cv2.LINE_AA)
            tiles.append(im)
    sheet = np.vstack([np.hstack(tiles[i:i + 6]) for i in range(0, len(tiles), 6)])
    p = OUT / "_a-vs-b_eye-aligned.png"
    cv2.imwrite(str(p), sheet)
    print("\nSHEET", p, sheet.shape)

    # 叠差图：a3 与 b3 的平均脸与差分
    a3 = at("a", 3.0)["crop"]; b3 = at("b", 3.0)["crop"]
    diff = cv2.absdiff(a3, b3)
    cv2.imwrite(str(OUT / "_diff-a3-b3.png"), np.hstack([a3, b3, diff]))


if __name__ == "__main__":
    main()
