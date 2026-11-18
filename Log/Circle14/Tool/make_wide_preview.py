"""Circle14 wide 链总览：起始帧 + 关键帧（裁掉左右黑边 122px）横排。"""
import sys
from pathlib import Path

import cv2
from PIL import Image, ImageDraw

sys.stdout.reconfigure(encoding="utf-8")
HERE = Path(__file__).resolve().parents[1]
CHAIN = HERE / "i2v-boat-poling-wide"
TAG = "wide-216f-r1"
BAR = 122
PANELS = [("start", None), ("f0", 0), ("f60", 60), ("f120", 120), ("f160", 160), ("f200", 200), ("f215", 215)]
HEIGHT = 260

cap = cv2.VideoCapture(str(CHAIN / "video" / (TAG + ".mp4")))
frames = {}
for _, idx in PANELS:
    if idx is None:
        continue
    cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
    ok, fr = cap.read()
    if ok:
        frames[idx] = fr[:, BAR:fr.shape[1] - BAR]
cap.release()

start = cv2.imread(str(CHAIN / "start-frame.jpg"))
panels = []
for label, idx in PANELS:
    img = start if idx is None else frames.get(idx)
    if img is None:
        continue
    h, w = img.shape[:2]
    img = cv2.resize(img, (int(w * HEIGHT / h), HEIGHT))
    panels.append((label, img))

pad = 8
total_w = sum(p.shape[1] for _, p in panels) + pad * (len(panels) + 1)
canvas = Image.new("RGB", (total_w, HEIGHT + 30 + pad * 2), (12, 12, 12))
draw = ImageDraw.Draw(canvas)
x = pad
for label, p in panels:
    canvas.paste(Image.fromarray(cv2.cvtColor(p, cv2.COLOR_BGR2RGB)), (x, 28))
    draw.text((x + 4, 8), label, fill=(255, 255, 255))
    x += p.shape[1] + pad

out = CHAIN / "preview.png"
canvas.save(out)
print("OUT", out, canvas.size)
