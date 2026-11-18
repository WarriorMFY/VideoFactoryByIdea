"""Circle14 gun-biu 链口型检查：固定人脸框裁切，按帧序拼网格，看“biu”的唇形。"""
import sys
from pathlib import Path

import cv2
from PIL import Image, ImageDraw

sys.stdout.reconfigure(encoding="utf-8")
HERE = Path(__file__).resolve().parents[1]
CHAIN = HERE / "i2v-gun-biu"
TAG = "gun-biu-r1"

X0, Y0, X1, Y1 = 160, 320, 350, 510
FRAMES = list(range(0, 124, 8))
SCALE = 2.0
COLS = 4

cap = cv2.VideoCapture(str(CHAIN / "video" / (TAG + ".mp4")))
tiles = []
for idx in FRAMES:
    cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
    ok, fr = cap.read()
    if not ok:
        continue
    crop = fr[Y0:Y1, X0:X1]
    crop = cv2.resize(crop, None, fx=SCALE, fy=SCALE, interpolation=cv2.INTER_CUBIC)
    img = Image.fromarray(cv2.cvtColor(crop, cv2.COLOR_BGR2RGB))
    cv2.imwrite(str(CHAIN / "video" / (TAG + "_face_%03d.png" % idx)), crop)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, 78, 26], fill=(0, 0, 0))
    d.text((6, 5), "f%d" % idx, fill=(255, 255, 0))
    tiles.append(img)
cap.release()

if not tiles:
    raise SystemExit("no frames")

w, h = tiles[0].size
rows = (len(tiles) + COLS - 1) // COLS
sheet = Image.new("RGB", (w * COLS, h * rows), (16, 16, 16))
for i, t in enumerate(tiles):
    sheet.paste(t, ((i % COLS) * w, (i // COLS) * h))
out = CHAIN / "mouth-sheet.png"
sheet.save(out)
print("TILES", len(tiles))
print("OUT", out, sheet.size)
