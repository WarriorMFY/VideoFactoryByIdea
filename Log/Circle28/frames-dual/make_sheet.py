# -*- coding: utf-8 -*-
"""四联对比：K1-locked | K2b 单图(漂移) | K2c 双图 out_1 | K2c 双图 out_2"""
from pathlib import Path
from PIL import Image, ImageDraw

C = Path(r"d:\Data\QoderWorkArea\CardVideoMethod\Log\Circle28")
items = [
    ("K1-locked (anchor)", C / "frames/K1-locked.png"),
    ("K2b single (DRIFT, void)", C / "frames/runs/K2b-近景抬头/out_1.png"),
    ("K2c dual out_1 (OK)", C / "frames-dual/runs/K2c-双图抬头/out_1.png"),
    ("K2c dual out_2 (OK)", C / "frames-dual/runs/K2c-双图抬头/out_2.png"),
]
H = 900
imgs = []
for label, p in items:
    im = Image.open(p).convert("RGB")
    w = round(im.width * H / im.height)
    imgs.append((label, im.resize((w, H), Image.LANCZOS)))

gap = 10
total_w = sum(im.width for _, im in imgs) + gap * (len(imgs) - 1)
canvas = Image.new("RGB", (total_w, H + 40), (22, 22, 26))
draw = ImageDraw.Draw(canvas)
x = 0
for label, im in imgs:
    canvas.paste(im, (x, 40))
    draw.text((x + 6, 12), label, fill=(235, 235, 235))
    x += im.width + gap

out = C / "frames-dual" / "K2-compare.png"
canvas.save(out)
print(out, canvas.size)
