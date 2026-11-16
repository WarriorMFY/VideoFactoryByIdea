"""副实验 C 体检：首帧固定（1086），看「同一张肖像」在各景别下是否还是同一张脸。

做法：逐帧取全脸框高当景别标尺，取可信眼位做眼位对齐；把**源图缩到该帧瞳距**再算 NCC，
避免小脸上采样造成的虚高。分档：全身 <0.10 / 七分身 0.10–0.18 / 半身 0.18–0.30 / 胸像 ≥0.30。

用法：python Log/Circle10/i2v/measure_scale.py
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
from consistency import FACE, eye_pair, align, crop, score

OUT = HERE / "output"
SRC = ROOT / "RAG/portraits/figure-symmetric-cartographer/02-pass-1086x1448.png"
BANDS = [(0.0, 0.10, "全身"), (0.10, 0.18, "七分身"), (0.18, 0.30, "半身"), (0.30, 9.9, "胸像/特写")]
VIDEOS = {"c1b": OUT / "c1b.mp4", "c2b": OUT / "c2b.mp4"}


def ipd_of(pair):
    (x1, y1, w1, h1), (x2, y2, w2, h2) = pair
    return float(np.hypot(x2 + w2 / 2 - x1 - w1 / 2, y2 + h2 / 2 - y1 - h1 / 2))


def load_src():
    im = cv2.imread(str(SRC))
    pr = eye_pair(cv2.cvtColor(im, cv2.COLOR_BGR2GRAY))
    return im, pr, ipd_of(pr)


def ref_at(im, pr, ipd_src, target_ipd):
    s = target_ipd / ipd_src
    small = cv2.resize(im, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
    pr2 = tuple(tuple(int(v * s) for v in b) for b in pr)
    return crop(align(small, pr2), pr2)


def scan(path, im, pr, ipd_src):
    cap = cv2.VideoCapture(str(path))
    fps = cap.get(cv2.CAP_PROP_FPS)
    W = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)); H = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    rows, i = [], 0
    while True:
        ok, fr = cap.read()
        if not ok:
            break
        g = cv2.cvtColor(fr, cv2.COLOR_BGR2GRAY)
        faces = FACE.detectMultiScale(g, 1.08, 4, minSize=(24, 24))
        fh = max(faces, key=lambda r: r[2] * r[3])[3] / H if len(faces) else 0.0
        row = {"t": i / fps, "fh": fh}
        pair = eye_pair(g)
        if pair is not None:
            ip = ipd_of(pair)
            if ip >= 0.05 * W and min(b[2] for b in pair) >= 14:
                row["ipd"] = ip
                c = crop(align(fr, pair), pair)
                row["ncc"] = score(c, ref_at(im, pr, ipd_src, ip))
                row["crop"] = c
        rows.append(row)
        i += 1
    cap.release()
    return rows, fps, W, H


def main():
    im, pr, ipd_src = load_src()
    print("源图 1086：%dx%d  瞳距 %.0fpx" % (im.shape[1], im.shape[0], ipd_src))
    for tag, path in VIDEOS.items():
        if not path.exists():
            print(f"\n{tag} 缺文件")
            continue
        rows, fps, W, H = scan(path, im, pr, ipd_src)
        print(f"\n===== {tag} =====")
        print(f"{W}×{H}  {len(rows)} 帧  fps {fps:.1f}")
        print("脸框高/画幅：0s %.3f → 末帧 %.3f" % (rows[0]["fh"], rows[-1]["fh"]))
        print("\n%-9s %4s %8s %8s %9s %9s" % ("景别", "帧", "脸高比", "瞳距px", "对源图NCC", "可测比"))
        for lo, hi, label in BANDS:
            sub = [r for r in rows if lo <= r["fh"] < hi]
            if not sub:
                print("%-9s %4d   —" % (label, 0))
                continue
            got = [r for r in sub if "ncc" in r]
            print("%-9s %4d %8.3f %8s %9s %8.0f%%" % (
                label, len(sub), np.mean([r["fh"] for r in sub]),
                "%.0f" % np.mean([r["ipd"] for r in got]) if got else "—",
                "%.3f" % np.mean([r["ncc"] for r in got]) if got else "—",
                100 * len(got) / len(sub)))
        for t in (0.0, 1.0, 2.0, 3.0, 4.0, 5.0):
            r = min(rows, key=lambda r: abs(r["t"] - t))
            print("   t=%.0fs 脸高 %.3f  %s" % (
                r["t"], r["fh"],
                ("对源图 %.3f 瞳距 %.0f" % (r["ncc"], r["ipd"])) if "ncc" in r else "不可测"))

        # 逐档裁剪拼图
        tiles = []
        for lo, hi, label in BANDS:
            sub = [r for r in rows if lo <= r["fh"] < hi and "crop" in r]
            if not sub:
                continue
            im2 = sub[len(sub) // 2]["crop"].copy()
            cv2.putText(im2, f"{label} {sub[len(sub) // 2]['t']:.1f}s", (8, 26),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2, cv2.LINE_AA)
            tiles.append(im2)
        if tiles:
            cv2.imwrite(str(OUT / f"_{tag}_bands.png"), np.hstack(tiles))
            print("BANDS", OUT / f"_{tag}_bands.png")


if __name__ == "__main__":
    main()
