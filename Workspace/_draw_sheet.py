import sys
from pathlib import Path

import cv2
from PIL import Image, ImageDraw

sys.stdout.reconfigure(encoding="utf-8")

src = Path("Log/Circle2/output/l4-v2.mp4")
out = Path("Log/Circle2/output/l4-v2-sheet.png")
COLS, ROWS = 4, 4

cap = cv2.VideoCapture(str(src))
fps = cap.get(cv2.CAP_PROP_FPS) or 24
n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
dur = n / fps
print("FPS", round(fps, 2), "FRAMES", n, "DUR", round(dur, 2))

frames = []
count = COLS * ROWS
for i in range(count):
    t = dur * (i + 0.5) / count
    cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000.0)
    ok, fr = cap.read()
    if not ok:
        print("MISS", i, round(t, 2))
        continue
    frames.append((t, Image.fromarray(cv2.cvtColor(fr, cv2.COLOR_BGR2RGB))))
cap.release()

if not frames:
    sys.exit("no frame")

w, h = frames[0][1].size
cw = 520
ch = int(h * cw / w)
sheet = Image.new("RGB", (cw * COLS, ch * ROWS), "black")
d = ImageDraw.Draw(sheet)
for idx, (t, img) in enumerate(frames):
    x, y = (idx % COLS) * cw, (idx // COLS) * ch
    sheet.paste(img.resize((cw, ch), Image.LANCZOS), (x, y))
    d.rectangle([x, y, x + 92, y + 20], fill="black")
    d.text((x + 6, y + 6), "t=%.2fs" % t, fill="yellow")
sheet.save(out)
print("SAVED", out, sheet.size)