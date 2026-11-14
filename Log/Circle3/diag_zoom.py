"""Circle3 L4 关键帧单帧放大：确认剑的位置、持握与颈部接触"""
import cv2
from PIL import Image, ImageDraw

VIDEO = r"F:\AgentWorkArea\WorkBuddy\CardStudio\Log\Circle3\output\l4-card-verbatim.mp4"
OUT = r"C:\Users\59784\AppData\Local\Temp"
cap = cv2.VideoCapture(VIDEO)
W = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
H = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))


def frame(t):
    cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
    ok, fr = cap.read()
    if not ok:
        return None
    return Image.fromarray(cv2.cvtColor(fr, cv2.COLOR_BGR2RGB))


# 双人上半身区域，放大 2 倍
box = (int(W * 0.18), int(H * 0.02), int(W * 0.92), int(H * 0.78))
for t in (2.50, 2.75, 3.00, 3.25, 4.00, 4.25, 4.50):
    im = frame(t)
    if im is None:
        continue
    z = im.crop(box).resize((1120, 640))
    d = ImageDraw.Draw(z)
    d.rectangle([0, 0, 90, 24], fill=(0, 0, 0))
    d.text((5, 5), "%.2fs" % t, fill=(255, 255, 0))
    p = OUT + ("\\c3_zoom_%04d.png" % int(t * 100))
    z.save(p)
    print("SAVED", p)
