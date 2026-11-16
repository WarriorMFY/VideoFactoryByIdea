"""在图上叠加 10% 网格，用于目测脸部占比与裁切位置（不依赖关键点模型）。"""
import pathlib
import sys

from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "Log/Circle8/output"


def grid(src):
    img = Image.open(src).convert("RGB")
    w, h = img.size
    d = ImageDraw.Draw(img)
    lw = max(1, w // 400)
    for i in range(1, 10):
        x, y = int(w * i / 10), int(h * i / 10)
        d.line([(x, 0), (x, h)], fill=(0, 220, 255), width=lw)
        d.line([(0, y), (w, y)], fill=(0, 220, 255), width=lw)
        d.text((x + 3, 3), str(i * 10), fill=(0, 220, 255))
        d.text((3, y + 2), str(i * 10), fill=(0, 220, 255))
    dst = src.with_name(src.stem + "-grid.png")
    img.save(dst)
    print("GRID", dst.name, img.size)


for name in sys.argv[1:]:
    grid(OUT / name)