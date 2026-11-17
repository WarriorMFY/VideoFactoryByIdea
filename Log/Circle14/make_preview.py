"""Circle14 预览图：S2 空镜失败样本 + 三镜切分三段各取一帧。

用法：python Log/Circle14/make_preview.py
输出：Log/Circle14/preview.png（4 格横排）
"""
import sys
from pathlib import Path

import cv2
from PIL import Image, ImageDraw, ImageFont, ImageOps

sys.stdout.reconfigure(encoding="utf-8")
HERE = Path(__file__).resolve().parent
CARD = HERE / "文生视频" / "terrain-huangfeng-valley"

GOOD = (46, 160, 67)
BAD = (200, 60, 60)
FONT = "C:/Windows/Fonts/msyh.ttc"

CELL = (480, 270)
BAR = 58


def grab(mp4, t):
    cap = cv2.VideoCapture(str(mp4))
    cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
    ok, f = cap.read()
    cap.release()
    if not ok:
        raise SystemExit("抽帧失败: %s @%.1fs" % (mp4.name, t))
    im = Image.fromarray(cv2.cvtColor(f, cv2.COLOR_BGR2RGB))
    return ImageOps.fit(im, CELL, method=Image.LANCZOS)


cells = [
    (grab(CARD / "S2" / "01-s2-fox-crane.mp4", 4.0),
     "S2 覆盖表（设定语言）· 5s", "0.5/2＝25%｜林地空镜，运镜锁失效", BAD),
    (grab(CARD / "camseq" / "01-camseq-9s.mp4", 1.0),
     "三镜切分 · 段1 远景 · 0–5.58s", "尺度 3/3｜三层山脊＋雪线＋谷底田畴", GOOD),
    (grab(CARD / "camseq" / "01-camseq-9s.mp4", 6.5),
     "三镜切分 · 段2 近景 · 5.58–7.58s", "水系 2/2｜潭心泉眼翻泡＋岸边药垄", GOOD),
    (grab(CARD / "camseq" / "01-camseq-9s.mp4", 8.3),
     "三镜切分 · 段3 近景 · 7.58–9.42s", "动物 2/2｜狐伏卧抬头＋鹤石上振翅", GOOD),
]

w, h = CELL
canvas = Image.new("RGB", (w * len(cells), BAR + h), (24, 24, 24))
d = ImageDraw.Draw(canvas)
title = ImageFont.truetype(FONT, 19)
sub = ImageFont.truetype(FONT, 17)
for i, (im, t1, t2, color) in enumerate(cells):
    x = i * w
    canvas.paste(im, (x, BAR))
    d.text((x + 10, 9), t1, font=title, fill=(255, 255, 255))
    d.text((x + 10, 33), t2, font=sub, fill=color)

out = HERE / "preview.png"
canvas.save(out)
print("OUT", out.relative_to(HERE), canvas.size)
