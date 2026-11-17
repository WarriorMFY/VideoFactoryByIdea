"""帧差扫描：找出硬切点（相邻帧平均绝对差的前若干峰）。"""
import sys
from pathlib import Path

import cv2
import numpy as np

sys.stdout.reconfigure(encoding="utf-8")
src = Path(sys.argv[1])
cap = cv2.VideoCapture(str(src))
fps = cap.get(cv2.CAP_PROP_FPS) or 24.0
n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
prev = None
diffs = []
i = 0
size = None
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

print("FPS %.3f FRAMES %d DUR %.2fs SIZE %s" % (fps, n, n / fps, size))
top = sorted(diffs, key=lambda x: -x[1])[:8]
print("TOP_DIFFS")
for idx, d in top:
    print("  f%-4d t=%.2fs  d=%5.1f" % (idx, idx / fps, d))
med = float(np.median([d for _, d in diffs]))
print("MEDIAN_DIFF %.2f" % med)
print("PEAKS_OVER_3X")
for idx, d in diffs:
    if d > med * 3 and d > 8:
        print("  f%-4d t=%.2fs  d=%5.1f" % (idx, idx / fps, d))
