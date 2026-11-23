# -*- coding: utf-8 -*-
"""拼图：K1 anchor + K2 两张，横排对比"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw

BASE = Path(__file__).parent
items = [
    ("K1 out_1 (anchor)", BASE / "runs/K1-中景提灯/out_1.png"),
    ("K2 out_1", BASE / "runs/K2-近景望雨2/out_1.png"),
    ("K2 out_2", BASE / "runs/K2-近景望雨2/out_2.png"),
]

imgs = []
for label, p in items:
    im = Image.open(p).convert("RGB")
    imgs.append((label, im))

h = max(im.height for _, im in imgs)
total_w = sum(im.width for _, im in imgs) + 12 * (len(imgs) - 1)
canvas = Image.new("RGB", (total_w, h + 40), (24, 24, 28))
draw = ImageDraw.Draw(canvas)
x = 0
for label, im in imgs:
    canvas.paste(im, (x, 40))
    draw.text((x + 8, 12), label, fill=(230, 230, 230))
    x += im.width + 12

out = BASE / "K2-compare.png"
canvas.save(out)
print(out, canvas.size)
