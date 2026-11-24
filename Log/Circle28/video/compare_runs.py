# -*- coding: utf-8 -*-
"""Circle28 现场器材：同首帧两条抽卡（S1-v1 / S1-v2）逐帧比对。

判据：ncc 越高越像。若两版几乎同一条，说明换 prompt 没换来任何变化，
锁便宜的那条即可，"运动由首帧主导"也由此坐实。
"""
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent  # Log/Circle28
A = ROOT / "video" / "runs" / "S1-v1" / "out.mp4"
B = ROOT / "video" / "runs" / "S1-v2" / "out.mp4"


def ncc(a, b):
    a = a.astype(np.float32).ravel()
    b = b.astype(np.float32).ravel()
    a -= a.mean()
    b -= b.mean()
    return float((a @ b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9))


def main():
    caps = [cv2.VideoCapture(str(p)) for p in (A, B)]
    totals = [int(c.get(cv2.CAP_PROP_FRAME_COUNT)) for c in caps]
    fps = caps[0].get(cv2.CAP_PROP_FPS) or 24
    n = min(totals)
    idxs = [round(i * (n - 1) / 7) for i in range(8)]
    print(f"frames {totals[0]} vs {totals[1]}  fps {fps:.2f}")
    print(f"{'f':>4} {'t(s)':>6} {'ncc':>7} {'mad':>6}")
    vals = []
    for i in idxs:
        frames = []
        for c in caps:
            c.set(cv2.CAP_PROP_POS_FRAMES, i)
            ok, fr = c.read()
            if not ok:
                break
            frames.append(cv2.cvtColor(fr, cv2.COLOR_BGR2GRAY))
        if len(frames) < 2:
            continue
        v = ncc(frames[0], frames[1])
        mad = float(np.abs(frames[0].astype(np.int16) - frames[1].astype(np.int16)).mean())
        vals.append(v)
        print(f"{i:>4} {i/fps:>6.2f} {v:>7.4f} {mad:>6.2f}")
    for c in caps:
        c.release()
    print(f"mean_ncc={np.mean(vals):.4f}  min={np.min(vals):.4f}  max={np.max(vals):.4f}")


if __name__ == "__main__":
    sys.exit(main())
