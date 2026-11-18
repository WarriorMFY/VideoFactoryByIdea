"""Circle14 gun-biu 链总览：起始帧（按 9:16 居中裁剪对齐）+ 关键帧横排。"""
import sys
from pathlib import Path

import cv2
from PIL import Image, ImageDraw, ImageFont

sys.stdout.reconfigure(encoding="utf-8")
HERE = Path(__file__).resolve().parents[1]
CHAIN = HERE / "i2v-gun-biu"
TAG = "gun-biu-r1"
PANELS = [("start", None), ("f0", 0), ("f16", 16), ("f40", 40), ("f72", 72), ("f80", 80), ("f120", 120)]
HEIGHT = 400
CAPTIONS = {
    "start": "start(9:16 crop)",
    "f0": "f0 rifle",
    "f16": "f16 shrink",
    "f40": "f40 aim",
    "f72": "f72 purse",
    "f80": "f80 laugh",
    "f120": "f120 wink",
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

start = cv2.imread(str(CHAIN / "start-frame.jpg"))
sh, sw = start.shape[:2]
out_h, out_w = frames[0].shape[:2]
crop_h = int(round(sw * out_h / out_w))
top = max(0, (sh - crop_h) // 2)
start = start[top:top + crop_h, :]

panels = []
for label, idx in PANELS:
    img = start if idx is None else frames.get(idx)
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
sheet = Image.new("RGB", (total_w, HEIGHT + 32 + pad * 2), (16, 16, 16))
d = ImageDraw.Draw(sheet)
x = pad
for cap_text, img in panels:
    sheet.paste(Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB)), (x, pad))
    d.text((x + 4, HEIGHT + pad + 6), cap_text, fill=(255, 255, 0), font=font)
    x += img.shape[1] + pad

out = CHAIN / "preview.png"
sheet.save(out)
print("PANELS", [c for c, _ in panels])
print("OUT", out, sheet.size)
