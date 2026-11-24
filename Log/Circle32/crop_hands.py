"""把 K1 两张的手部裁出来放大，便于人眼检查手指/腕部关系。零积分。"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "inspect"
OUT.mkdir(exist_ok=True)

CROPS = {
    "K1-out1-right-5x": ("frames/runs/K1/out_1.png", (950, 640, 1170, 830)),
    "K1-out2-right-5x": ("frames/runs/K1/out_2.png", (850, 590, 1080, 790)),
}

for name, (rel, box) in CROPS.items():
    im = Image.open(ROOT / rel)
    crop = im.crop(box)
    crop = crop.resize((crop.width * 5, crop.height * 5), Image.LANCZOS)
    dst = OUT / f"{name}.png"
    crop.save(dst)
    print(f"{dst.name}  {crop.width}x{crop.height}")
