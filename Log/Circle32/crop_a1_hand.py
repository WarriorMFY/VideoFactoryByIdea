"""从 A1 角色锚裁出握夹板的手，做 K1c 的手部结构参考（零积分）。"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent
src = ROOT / "anchors/runs/A1-engineer/out.png"
im = Image.open(src)
print("A1", im.size)
box = (560, 440, 800, 690)
crop = im.crop(box)
crop = crop.resize((crop.width * 3, crop.height * 3), Image.LANCZOS)
dst = ROOT / "anchors/A1-hand.png"
crop.save(dst)
print(dst.name, crop.size)
