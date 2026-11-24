"""K2 细节：脸、拿夹板的手、踩线的前脚（4x），检查结构。"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "inspect"

CROPS = {
    "K2-out1-face": ("frames/runs/K2/out_1.png", (540, 190, 760, 400)),
    "K2-out1-hand": ("frames/runs/K2/out_1.png", (660, 450, 840, 640)),
    "K2-out1-feet": ("frames/runs/K2/out_1.png", (440, 860, 800, 1030)),
    "K2-out2-hand": ("frames/runs/K2/out_2.png", (640, 400, 830, 600)),
}

for name, (rel, box) in CROPS.items():
    im = Image.open(ROOT / rel)
    crop = im.crop(box)
    crop = crop.resize((crop.width * 4, crop.height * 4), Image.LANCZOS)
    dst = OUT / f"{name}.png"
    crop.save(dst)
    print(dst.name, crop.size)
