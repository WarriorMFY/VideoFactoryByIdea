"""副实验 B · 全部样本的两两对齐矩阵（只比近景段，走秀段不可测）。

对每条片：找最大跳变点 → 取近景段内均匀 5 帧 → 眼位对齐裁切。
两片之间的相似度 = 5×5 配对的 NCC 均值。参照两张入库样张同样进入矩阵。

用法：python Log/Circle10/runway/measure_all.py
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
RAG = ROOT / "RAG" / "portraits" / "figure-symmetric-cartographer"


def still_crop(p):
    im = cv2.imread(str(p))
    pr = eye_pair(cv2.cvtColor(im, cv2.COLOR_BGR2GRAY))
    return crop(align(im, pr), pr) if pr else None


def load(path):
    cap = cv2.VideoCapture(str(path))
    fps = cap.get(cv2.CAP_PROP_FPS)
    W = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)); H = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    frames, diffs, i, prev = [], [], 0, None
    while True:
        ok, fr = cap.read()
        if not ok:
            break
        g = cv2.cvtColor(fr, cv2.COLOR_BGR2GRAY)
        diffs.append(float(np.abs(g.astype(np.float32) - prev).mean()) if prev is not None else 0.0)
        prev = g.astype(np.float32)
        frames.append(fr)
        i += 1
    cap.release()
    return frames, fps, W, H, np.array(diffs)


def pick(frames, fps, diffs, n=5):
    cut = int(diffs.argmax())
    seg = frames[cut:]
    if len(seg) < n:
        seg = frames[-n:]
    idx = np.linspace(0, len(seg) - 1, n).astype(int)
    out = []
    for j in idx:
        fr = seg[j]
        pr = eye_pair(cv2.cvtColor(fr, cv2.COLOR_BGR2GRAY))
        if pr is None:
            continue
        out.append(crop(align(fr, pr), pr))
    return out, cut / fps, frames[0]


def main():
    vids = sorted(OUT.glob("r*.mp4"))
    vids = [v for v in vids if not v.name.startswith("_")]
    S, meta = {}, {}
    S["880"] = [still_crop(RAG / "01-pass-880x1184.png")]
    S["1086"] = [still_crop(RAG / "02-pass-1086x1448.png")]
    for p in vids:
        frames, fps, W, H, diffs = load(p)
        crops, cut_t, first = pick(frames, fps, diffs)
        tag = p.stem
        S[tag] = crops
        meta[tag] = (cut_t, diffs.max(), len(frames))
        print("%-5s 切点 %.2fs  峰值差分 %.1f  帧数 %d  近景可测 %d/5" %
              (tag, cut_t, diffs.max(), len(frames), len(crops)))

    keys = [k for k in S if S[k]]
    print("\n=== 近景段两两 NCC ×100 ===")
    print("%-6s" % "" + "".join("%-7s" % k for k in keys))
    M = {}
    for a in keys:
        row = "%-6s" % a
        for b in keys:
            if a == b:
                v = 1.0
            else:
                v = float(np.mean([[score(x, y) for y in S[b]] for x in S[a]]))
            M[(a, b)] = v
            row += "%-7.0f" % (v * 100)
        print(row)

    print("\n=== 对样张 ===")
    for k in keys:
        if k in ("880", "1086"):
            continue
        print("%-5s 对880 %.3f  对1086 %.3f" % (k, M[(k, "880")], M[(k, "1086")]))

    print("\n=== 五条互比（不含样张）===")
    vs = [k for k in keys if k not in ("880", "1086")]
    vals = [M[(a, b)] for i, a in enumerate(vs) for b in vs[i + 1:]]
    if vals:
        v = np.array(vals)
        print("n=%d  mean %.3f  min %.3f  max %.3f" % (len(v), v.mean(), v.min(), v.max()))
        for a in vs:
            print("  %-5s 与其余平均 %.3f" % (a, np.mean([M[(a, b)] for b in vs if b != a])))


if __name__ == "__main__":
    main()
