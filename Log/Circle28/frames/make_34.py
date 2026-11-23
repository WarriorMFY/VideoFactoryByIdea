# -*- coding: utf-8 -*-
"""把 2:3 关键帧居中裁成 3:4（保宽裁高），供 i2v 3:4 通道用。"""
from pathlib import Path

from PIL import Image

C = Path(r"d:\Data\QoderWorkArea\CardVideoMethod\Log\Circle28")
pairs = [
    (C / "frames/K1-locked.png", C / "frames/K1-locked-34.png"),
    (C / "frames/K2-locked.png", C / "frames/K2-locked-34.png"),
]

for src, dst in pairs:
    im = Image.open(src)
    w, h = im.size
    target_h = round(w * 4 / 3)
    top = (h - target_h) // 2
    im.crop((0, top, w, top + target_h)).save(dst)
    print(f"{src.name} {im.size} -> {Image.open(dst).size} (裁掉上下各 {top}px)")
