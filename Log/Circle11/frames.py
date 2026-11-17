"""抽帧拼图：视频 → 等间隔 N 帧横向拼条（不依赖 ffmpeg）。

用法：python Log/Circle11/frames.py output/v3-a.mp4 5
输出：output/<stem>-strip.png
"""
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

sys.stdout.reconfigure(encoding="utf-8")
HERE = Path(__file__).resolve().parent

src = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "output" / "v3-a.mp4"
if not src.is_absolute():
    src = HERE / src
n = int(sys.argv[2]) if len(sys.argv) > 2 else 5

cap = cv2.VideoCapture(str(src))
fps = cap.get(cv2.CAP_PROP_FPS) or 24.0
total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
dur = total / fps
idx = [int(round(i * (total - 1) / (n - 1))) for i in range(n)]

frames = []
for i in idx:
    cap.set(cv2.CAP_PROP_POS_FRAMES, i)
    ok, frame = cap.read()
    if not ok:
        continue
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    im = Image.fromarray(rgb)
    frames.append((i, round(i / fps, 2), im))
cap.release()

if not frames:
    raise SystemExit("抽帧失败")

w, h = frames[0][2].size
canvas = Image.new("RGB", (w * len(frames), h + 28), (20, 20, 20))
from PIL import ImageDraw  # noqa: E402
d = ImageDraw.Draw(canvas)
for k, (i, t, im) in enumerate(frames):
    canvas.paste(im, (k * w, 28))
    d.text((k * w + 8, 8), "f{}  {}s".format(i, t), fill=(255, 255, 255))
out = src.parent / (src.stem + "-strip.png")
canvas.save(out)
print("FRAMES", [t for _, t, _ in frames], "dur", round(dur, 2), "size", (w, h))
print("OUT", out)
