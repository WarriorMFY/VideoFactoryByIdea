# -*- coding: utf-8 -*-
"""A4-airlock 场景锚检查：门口百分比标尺 + 灯/门缝/顶部轨道细节裁切 + 缝宽实测"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFont

RUN = r"Log/Circle32/anchors/runs/A4-airlock"
OUT = r"Log/Circle32/inspect"
os.makedirs(OUT, exist_ok=True)


def load(p):
    return Image.open(p).convert("RGB")


def grid(img, step=0.1):
    """画百分比标尺"""
    im = img.copy()
    d = ImageDraw.Draw(im)
    W, H = im.size
    try:
        font = ImageFont.truetype("arial.ttf", 34)
    except Exception:
        font = ImageFont.load_default()
    for i in range(1, 10):
        x = int(W * i * step)
        y = int(H * i * step)
        d.line([(x, 0), (x, H)], fill=(0, 255, 255), width=2)
        d.line([(0, y), (W, y)], fill=(0, 255, 255), width=2)
        d.text((x + 6, 8), f"{i*10}", fill=(0, 255, 255), font=font)
        d.text((8, y + 2), f"{i*10}", fill=(0, 255, 255), font=font)
    return im


def crop6(img, box, name):
    c = img.crop(box)
    c = c.resize((c.width * 6, c.height * 6), Image.LANCZOS)
    p = os.path.join(OUT, name)
    c.save(p)
    print("saved", p, c.size)


def seam_profile(img, yfrac=0.55, x0=880, x1=1060, tag=""):
    """门缝横截亮度剖面：亮-暗-亮 即关门；中间若出现一段明显亮带=有缝（可透光/透气）"""
    a = np.asarray(img.convert("L")).astype(np.float32)
    H, W = a.shape
    y = int(H * yfrac)
    row = a[y, x0:x1]
    print(f"--- {tag} seam profile y={y} x=[{x0},{x1}) ---")
    print("min", row.min(), "max", row.max(), "mean", round(float(row.mean()), 1))
    # 找暗轴（缝线）
    dark = np.where(row < row.mean() - 25)[0]
    if len(dark):
        print("dark cols(rel):", dark.min(), "-", dark.max(),
              "=> abs", x0 + dark.min(), "-", x0 + dark.max(),
              "width_px", dark.max() - dark.min() + 1)
    # 打印抽样值
    samp = [(x0 + i, int(row[i])) for i in range(0, x1 - x0, 6)]
    print("samples:", samp)


def door_edges(img, yfrac=0.45, tag=""):
    """在某一高度横扫，找门的左右外框（亮白门板被深色门框包住）"""
    a = np.asarray(img.convert("L")).astype(np.float32)
    H, W = a.shape
    y = int(H * yfrac)
    row = a[y]
    # 门板接近纯白，阈值取 200
    bright = row > 205
    # 只在中段找最长的连续亮段
    best = (0, 0, 0)
    i = 0
    while i < W:
        if bright[i]:
            j = i
            while j < W and bright[j]:
                j += 1
            if j - i > best[2]:
                best = (i, j - 1, j - i)
            i = j
        else:
            i += 1
    print(f"--- {tag} door@y={y} longest bright run x=[{best[0]},{best[1]}] w={best[2]} "
          f"= {best[2]/W*100:.1f}% of frame ---")
    return best


def main():
    o1 = load(os.path.join(RUN, "out_1.png"))
    o2 = load(os.path.join(RUN, "out_2.png"))
    W, H = o1.size
    print("out_1 size", W, H)

    grid(o1, 0.1).resize((W // 2, H // 2), Image.LANCZOS).save(os.path.join(OUT, "A4-out1-grid.png"))
    print("saved", os.path.join(OUT, "A4-out1-grid.png"))

    # 灯：左右各看一次
    crop6(o1, (470, 215, 600, 360), "A4-out1-lampL.png")
    crop6(o1, (1360, 200, 1500, 360), "A4-out1-lampR.png")
    crop6(o2, (1320, 150, 1480, 360), "A4-out2-lampR.png")
    # 门缝中央
    crop6(o1, (900, 180, 1040, 860), "A4-out1-seam.png")
    crop6(o2, (900, 180, 1060, 900), "A4-out2-seam.png")
    # 顶部轨道
    crop6(o1, (620, 120, 1330, 210), "A4-out1-track.png")

    door_edges(o1, 0.45, "out_1")
    door_edges(o2, 0.45, "out_2")
    seam_profile(o1, 0.55, 880, 1060, "out_1")
    seam_profile(o2, 0.55, 880, 1060, "out_2")


if __name__ == "__main__":
    main()
