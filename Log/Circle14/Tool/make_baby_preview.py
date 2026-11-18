"""Circle14 baby 链总览：起始帧 + 关键帧（回头、两次张口、收口）横排。"""
import sys
from pathlib import Path

import cv2
from PIL import Image, ImageDraw, ImageFont

sys.stdout.reconfigure(encoding="utf-8")
HERE = Path(__file__).resolve().parents[1]
CHAIN = HERE / "i2v-baby-mama"
TAG = "baby-mama-r1"
PANELS = [("start", None), ("f0", 0), ("f20", 20), ("f56", 56), ("f80", 80), ("f96", 96), ("f120", 120)]
HEIGHT = 320
CAPTIONS = {
    "start": "start",
    "f0": "f0 turn",
    "f20": "f20 face",
    "f56": "f56 mouth-1",
    "f80": "f80 close",
    "f96": "f96 mouth-2",
    "f120": "f120 end",
}

cap = cv2.VideoCapture(str(CHAIN / "video" / (TAG + ".mp4")))
frames = {}
for _, idx in PANELS:
    if idx is None:
        continue
    cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
    ok, fr = cap.read()
    if ok:
        frames[idx] = fr
cap.release()

panels = []
for label, idx in PANELS:
    img = cv2.imread(str(CHAIN / "start-frame.jpg")) if idx is None else frames.get(idx)
    if img is None:
        continue
    h, w = img.shape[:2]
    nw = int(round(w * HEIGHT / h))
    img = cv2.resize(img, (nw, HEIGHT), interpolation=cv2.INTER_AREA)
    panels.append((CAPTIONS[label], img))

try:
    font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 16)
except OSError:
    font = ImageFont.load_default()

pad = 6
total_w = sum(p.shape[1] for _, p in panels) + pad * (len(panels) + 1)
sheet = Image.new("RGB", (total_w, HEIGHT + 30 + pad * 2), (16, 16, 16))
d = ImageDraw.Draw(sheet)
x = pad
for cap_text, img in panels:
    sheet.paste(Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB)), (x, pad))
    d.text((x + 4, HEIGHT + pad + 4), cap_text, fill=(255, 255, 0), font=font)
    x += img.shape[1] + pad

out = CHAIN / "preview.png"
sheet.save(out)
print("PANELS", [c for c, _ in panels])
print("OUT", out, sheet.size)
