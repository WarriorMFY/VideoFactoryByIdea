"""中间景别体检：半身(h1/h2)、七分身(s1/s2) 与六条特写(r*) 的横向对齐。

与 measure2 的差别：
  1) 眼位守卫放宽到「瞳距 ≥ 画幅 4.5%、眼框 ≥ 14px」，否则中间景别一帧都测不到；
  2) 与样张比对时做**分辨率对齐**——先把样张缩到与视频同一瞳距，再算 NCC，
     否则 640×832 的小脸上采样到 100px 瞳距，会把模糊当相似（虚高）。

用法：python Log/Circle10/runway/measure_mid.py
"""
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(ROOT / "Log" / "Circle10"))
sys.path.insert(0, str(ROOT / "Tool" / "_deps"))
sys.path.insert(0, str(ROOT / "Tool" / "_deps_cv4"))
import cv2
import numpy as np
from consistency import EYE, FACE, IPD, WIN, eye_pair, align, crop, score

OUT = HERE / "output"
RAG = ROOT / "RAG" / "portraits" / "figure-symmetric-cartographer"
GROUPS = {"半身": ["h1", "h2"], "七分身": ["s1", "s2"], "特写": ["r1-a", "r1-b", "r2", "r3", "r4", "r5"]}


def pair_px(pair, scale=1.0):
    return tuple(tuple(int(v * scale) for v in box) for box in pair)


def ipd_of(pair):
    (x1, y1, w1, h1), (x2, y2, w2, h2) = pair
    return float(np.hypot(x2 + w2 / 2 - x1 - w1 / 2, y2 + h2 / 2 - y1 - h1 / 2))


def load_still(p):
    im = cv2.imread(str(p))
    pr = eye_pair(cv2.cvtColor(im, cv2.COLOR_BGR2GRAY))
    return im, pr


def resized_ref(im, pr, target_ipd):
    """把样张缩放到目标瞳距，返回对齐裁切。"""
    s = target_ipd / ipd_of(pr)
    small = cv2.resize(im, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
    pr2 = pair_px(pr, s)
    return crop(align(small, pr2), pr2)


def sample(path, n=12):
    cap = cv2.VideoCapture(str(path))
    fps = cap.get(cv2.CAP_PROP_FPS)
    W = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)); H = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    idxs = np.linspace(0, 123, n).astype(int)
    out, fhs = [], []
    for j in idxs:
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(j))
        ok, fr = cap.read()
        if not ok:
            continue
        g = cv2.cvtColor(fr, cv2.COLOR_BGR2GRAY)
        faces = FACE.detectMultiScale(g, 1.08, 4, minSize=(24, 24))
        if len(faces):
            fhs.append(max(faces, key=lambda r: r[2] * r[3])[3] / H)
        pr = eye_pair(g)
        if pr is None:
            continue
        ipd = ipd_of(pr)
        if ipd < 0.045 * W:
            continue
        ew = min(b[2] for b in pr)
        if ew < 14:
            continue
        out.append({"t": j / fps, "ipd_px": ipd, "ipd_frac": ipd / W,
                    "crop": crop(align(fr, pr), pr)})
    cap.release()
    return out, fhs, W, H


def main():
    S880, P880 = load_still(RAG / "01-pass-880x1184.png")
    S1086, P1086 = load_still(RAG / "02-pass-1086x1448.png")
    data = {}
    print("%-6s %6s %8s %8s %8s" % ("片", "可测帧", "瞳距px", "瞳距/幅", "脸高比"))
    for g, tags in GROUPS.items():
        for t in tags:
            p = OUT / f"{t}.mp4"
            if not p.exists():
                print("%-6s 缺文件" % t)
                continue
            rows, fhs, W, H = sample(p)
            data[t] = {"rows": rows, "W": W, "H": H}
            ip = np.median([r["ipd_px"] for r in rows]) if rows else 0
            print("%-6s %6d %8.1f %8.3f %8s" % (
                t, len(rows), ip, ip / W if W else 0,
                "%.3f" % np.median(fhs) if fhs else "—"))

    tags = [t for t in data if data[t]["rows"]]
    print("\n=== 片间 NCC（同尺度对齐，×100）===")
    print("%-6s" % "" + "".join("%-7s" % t for t in tags))
    for a in tags:
        row = "%-6s" % a
        for b in tags:
            ca = data[a]["rows"][len(data[a]["rows"]) // 2]["crop"]
            cb = data[b]["rows"][len(data[b]["rows"]) // 2]["crop"]
            row += "%-7.0f" % (score(ca, cb) * 100) if a != b else "%-7s" % "100"
        print(row)

    print("\n=== 对样张（分辨率对齐后）===")
    for t in tags:
        r = data[t]["rows"][len(data[t]["rows"]) // 2]
        ip = np.median([x["ipd_px"] for x in data[t]["rows"]])
        n80 = score(r["crop"], resized_ref(S880, P880, ip))
        n86 = score(r["crop"], resized_ref(S1086, P1086, ip))
        print("%-6s 对880 %.3f  对1086 %.3f   (样张缩放到瞳距 %.0fpx)" % (t, n80, n86, ip))

    print("\n=== 组内平均 ===")
    for g, ts in GROUPS.items():
        ts = [t for t in ts if t in data and data[t]["rows"]]
        if len(ts) < 2:
            continue
        vals = [score(data[a]["rows"][len(data[a]["rows"]) // 2]["crop"],
                      data[b]["rows"][len(data[b]["rows"]) // 2]["crop"])
                for i, a in enumerate(ts) for b in ts[i + 1:]]
        print("%-5s n=%d mean %.3f" % (g, len(vals), np.mean(vals)))

    # 联络表
    tiles = []
    for t in tags:
        r = data[t]["rows"][len(data[t]["rows"]) // 2]
        im = r["crop"].copy()
        cv2.putText(im, t, (8, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 255, 255), 2, cv2.LINE_AA)
        tiles.append(im)
    if tiles:
        while len(tiles) % 5:
            tiles.append(np.full_like(tiles[0], 255))
        cv2.imwrite(str(OUT / "_mid_aligned.png"),
                    np.vstack([np.hstack(tiles[i:i + 5]) for i in range(0, len(tiles), 5)]))
        print("\nSHEET", OUT / "_mid_aligned.png")


if __name__ == "__main__":
    main()
