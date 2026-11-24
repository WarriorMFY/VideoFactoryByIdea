# -*- coding: utf-8 -*-
"""K3b 双联画拆版：定位中线、切左右面板、出 16:9 可用的中景裁切"""
import os
import numpy as np
from PIL import Image, ImageDraw

RUN = r"Log/Circle32/frames/runs/K3b"
OUT = r"Log/Circle32/inspect"
os.makedirs(OUT, exist_ok=True)


def divider_x(img):
    """中线是一条近白的竖线：按列求亮度均值，取中段峰值"""
    a = np.asarray(img.convert("L")).astype(np.float32)
    W = a.shape[1]
    col = a.mean(axis=0)
    lo, hi = int(W * 0.40), int(W * 0.60)
    x = lo + int(np.argmax(col[lo:hi]))
    print("divider cand", x, "col_mean", round(float(col[x]), 1),
          "neighbors", round(float(col[x - 20]), 1), round(float(col[x + 20]), 1))
    return x


def split(img, x, tag):
    left = img.crop((0, 0, x - 4, img.height))
    right = img.crop((x + 4, 0, img.width, img.height))
    for name, im in (("L", left), ("R", right)):
        p = os.path.join(OUT, f"K3b-{tag}-{name}.png")
        im.save(p)
        print("panel", name, im.size, "->", p)
    return left, right


def to169(img, y0, tag, name):
    """按 16:9 从面板上裁一条横带（宽度不缩放）"""
    w = img.width
    h = int(round(w * 9 / 16))
    y0 = max(0, min(y0, img.height - h))
    c = img.crop((0, y0, w, y0 + h))
    p = os.path.join(OUT, f"K3b-{tag}-{name}.png")
    c.save(p)
    print("16:9", c.size, "y0", y0, "->", p)
    return c


def main():
    for tag in ("out1", "out2"):
        img = Image.open(os.path.join(RUN, f"{tag[:3]}_{tag[3]}.png")).convert("RGB")
        print("==", tag, img.size)
        x = divider_x(img)
        L, R = split(img, x, tag)
        # 面板高度 1088、宽约 950；16:9 高 ≈ 534
        # 取“门顶 + 灯 + 人上半身到胯”：从上沿留 50
        to169(L, 50, tag, "L-169")
        to169(R, 50, tag, "R-169")


if __name__ == "__main__":
    main()
