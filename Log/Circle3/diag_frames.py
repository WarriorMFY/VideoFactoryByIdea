"""Circle3 L4 视频密集抽帧：0.25s 间隔全片导航 + 关键段原尺寸单帧"""
import cv2
import numpy as np
from PIL import Image, ImageDraw

VIDEO = r"F:\AgentWorkArea\WorkBuddy\CardStudio\Log\Circle3\output\l4-card-verbatim.mp4"
OUTDIR = r"C:\Users\59784\AppData\Local\Temp"

cap = cv2.VideoCapture(VIDEO)
fps = cap.get(cv2.CAP_PROP_FPS)
n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
print("FPS", fps, "FRAMES", n, "DUR", n / fps)
W = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
H = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
print("SIZE", W, H)


def grab(t):
    cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
    ok, fr = cap.read()
    if not ok:
        return None
    return Image.fromarray(cv2.cvtColor(fr, cv2.COLOR_BGR2RGB))


def stamp(im, t):
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, 78, 20], fill=(0, 0, 0))
    d.text((4, 4), "%.2fs" % t, fill=(255, 255, 0))
    return im


# 1) 全片 0.25s 间隔导航拼图
times = [round(i * 0.25, 2) for i in range(21)]
cells = []
for t in times:
    im = grab(t)
    if im is None:
        continue
    im = im.resize((400, 225))
    cells.append((t, stamp(im, t)))
cols = 5
rows = (len(cells) + cols - 1) // cols
sheet = Image.new("RGB", (400 * cols, 225 * rows), (25, 25, 25))
for i, (t, im) in enumerate(cells):
    sheet.paste(im, ((i % cols) * 400, (i // cols) * 225))
p1 = OUTDIR + r"\c3_dense.png"
sheet.save(p1)
print("SAVED", p1, sheet.size)

# 2) 关键段原尺寸单帧（1.5s - 3.75s，每 0.25s）
keys = [round(1.5 + i * 0.25, 2) for i in range(10)]
for t in keys:
    im = grab(t)
    if im is not None:
        im.save(OUTDIR + ("\\c3_f_%04d.png" % int(t * 100)))
stamp(im, t) if im is not None else None
print("SAVED singles", len(keys))

# 3) 关键段上半身放大拼图：裁每帧中央偏上区域，2 倍放大
crops = []
for t in keys:
    im = grab(t)
    if im is None:
        continue
    # 双人上半身：横向取中间 70%，纵向取上部 65%
    box = (int(W * 0.15), int(H * 0.05), int(W * 0.85), int(H * 0.70))
    c = im.crop(box).resize((560, 360))
    crops.append(stamp(c, t))
cols2 = 2
rows2 = (len(crops) + cols2 - 1) // cols2
sheet2 = Image.new("RGB", (560 * cols2, 360 * rows2), (25, 25, 25))
for i, im in enumerate(crops):
    sheet2.paste(im, ((i % cols2) * 560, (i // cols2) * 360))
p2 = OUTDIR + r"\c3_contact.png"
sheet2.save(p2)
print("SAVED", p2, sheet2.size)
