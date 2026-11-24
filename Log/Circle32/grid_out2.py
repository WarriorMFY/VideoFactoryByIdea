# -*- coding: utf-8 -*-
"""A4 out_2 百分比标尺（K3 构图取值用）"""
import os
import sys
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import crop_a4 as m

RUN = r"Log/Circle32/anchors/runs/A4-airlock"
OUT = r"Log/Circle32/inspect"

o2 = Image.open(os.path.join(RUN, "out_2.png")).convert("RGB")
W, H = o2.size
print("out_2 size", W, H)
m.grid(o2, 0.1).resize((W // 2, H // 2), Image.LANCZOS).save(
    os.path.join(OUT, "A4-out2-grid.png"))
print("saved", os.path.join(OUT, "A4-out2-grid.png"))
