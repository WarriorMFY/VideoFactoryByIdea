"""帧差扫描：找硬切点（相邻帧平均绝对差的峰）。

用法：
  python diff.py <video.mp4> [--k 3.0] [--min 8] [--top 8]

输出：
  FPS/FRAMES/DUR/SIZE、TOP_DIFFS、MEDIAN_DIFF、PEAKS_OVER_?x
"""
import argparse
import sys

import cv2
import numpy as np

sys.stdout.reconfigure(encoding="utf-8")


def main():
    ap = argparse.ArgumentParser(description="帧差找切点")
    ap.add_argument("video")
    ap.add_argument("--k", type=float, default=3.0, help="峰阈值＝中位数×k")
    ap.add_argument("--min", type=float, default=8.0, help="峰绝对下限")
    ap.add_argument("--top", type=int, default=8)
    a = ap.parse_args()

    cap = cv2.VideoCapture(a.video)
    if not cap.isOpened():
        raise SystemExit("打不开视频：" + a.video)
    fps = cap.get(cv2.CAP_PROP_FPS) or 24.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    prev = None
    diffs = []
    size = None
    i = 0
    while True:
        ok, fr = cap.read()
        if not ok:
            break
        size = (fr.shape[1], fr.shape[0])
        g = cv2.cvtColor(cv2.resize(fr, (320, 180)), cv2.COLOR_BGR2GRAY).astype(np.int16)
        if prev is not None:
            diffs.append((i, float(np.abs(g - prev).mean())))
        prev = g
        i += 1
    cap.release()

    if not diffs:
        raise SystemExit("有效帧不足：" + a.video)
    print("FPS %.3f FRAMES %d DUR %.2fs SIZE %s" % (fps, total, total / fps, size))
    print("TOP_DIFFS")
    for idx, d in sorted(diffs, key=lambda x: -x[1])[:a.top]:
        print("  f%-4d t=%.2fs  d=%5.1f" % (idx, idx / fps, d))
    med = float(np.median([d for _, d in diffs]))
    print("MEDIAN_DIFF %.2f" % med)
    print("PEAKS_OVER_%gx" % a.k)
    for idx, d in diffs:
        if d > med * a.k and d > a.min:
            print("  f%-4d t=%.2fs  d=%5.1f" % (idx, idx / fps, d))
    return 0


if __name__ == "__main__":
    sys.exit(main())
