"""K1d 两张的手部裁切（5x），检查指节与接触。"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "inspect"
OUT.mkdir(exist_ok=True)

CROPS = {
    "K1d-out1-hand": ("frames/runs/K1d/out_1.png", (1080, 700, 1290, 850)),
    "K1d-out2-hand": ("frames/runs/K1d/out_2.png", (1060, 660, 1270, 810)),
}

for name, (rel, box) in CROPS.items():
    im = Image.open(ROOT / rel)
    crop = im.crop(box).resize(((box[2] - box[0]) * 5, (box[3] - box[1]) * 5), Image.LANCZOS)
    dst = OUT / f"{name}.png"
    crop.save(dst)
    print(dst.name, crop.size)
