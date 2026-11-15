"""Circle4 L4 抽帧：全片 0.5s 导航拼图 + 关键时间点原尺寸单帧。"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "Tool" / "_deps"))
import cv2
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
VIDEO = sys.argv[1] if len(sys.argv) > 1 else str(ROOT / "Log" / "Circle4" / "output" / "l4-app-480p-5s.mp4")
OUT = ROOT / "Log" / "Circle4" / "output"

cap = cv2.VideoCapture(VIDEO)
fps = cap.get(cv2.CAP_PROP_FPS)
n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
dur = n / fps if fps else 0
W = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
H = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
print("FPS", fps, "FRAMES", n, "DUR", round(dur, 2), "SIZE", W, H)


def grab(t):
    cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
    ok, fr = cap.read()
    if not ok:
        return None
    return Image.fromarray(cv2.cvtColor(fr, cv2.COLOR_BGR2RGB))


def stamp(im, t):
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, 80, 20], fill=(0, 0, 0))
    d.text((4, 4), "%.2fs" % t, fill=(255, 255, 0))
    return im


# 导航拼图：0.5s 间隔
times = [round(i * 0.5, 2) for i in range(int(dur / 0.5) + 1) if i * 0.5 <= dur]
thumbs = []
for t in times:
    im = grab(t)
    if im is None:
        continue
    th = im.resize((320, int(320 * H / W)), Image.LANCZOS)
    thumbs.append(stamp(th, t))
cols = 4
rows = (len(thumbs) + cols - 1) // cols
tw, thh = thumbs[0].size
sheet = Image.new("RGB", (cols * tw, rows * thh), (30, 30, 30))
for i, im in enumerate(thumbs):
    sheet.paste(im, ((i % cols) * tw, (i // cols) * thh))
TAG = Path(VIDEO).stem
sheet.save(OUT / ("_%s_sheet.png" % TAG))
print("sheet", sheet.size, len(thumbs), "frames")

# 关键单帧
for t in [0.0, 1.0, 2.0, 3.0, 4.0, round(max(dur - 0.1, 0), 2)]:
    im = grab(t)
    if im is not None:
        im.save(OUT / ("_%s_f%.1f.png" % (TAG, t)))
print("key frames saved")
