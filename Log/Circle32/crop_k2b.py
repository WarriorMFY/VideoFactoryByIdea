"""K2b 细节：脚踩线、夹板、背带、后脑（4x）。"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "inspect"

CROPS = {
    "K2b-out1-feet": ("frames/runs/K2b/out_1.png", (500, 880, 760, 1060)),
    "K2b-out1-clip": ("frames/runs/K2b/out_1.png", (440, 500, 620, 680)),
    "K2b-out1-back": ("frames/runs/K2b/out_1.png", (500, 280, 790, 580)),
    "K2b-out1-head": ("frames/runs/K2b/out_1.png", (560, 200, 730, 380)),
}

for name, (rel, box) in CROPS.items():
    im = Image.open(ROOT / rel)
    crop = im.crop(box)
    crop = crop.resize((crop.width * 4, crop.height * 4), Image.LANCZOS)
    dst = OUT / f"{name}.png"
    crop.save(dst)
    print(dst.name, crop.size)
