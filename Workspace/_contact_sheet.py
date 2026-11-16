"""把目录里的 portrait-*.png 拼成一张总览图。参数：目录名 [单张宽] [列数]。"""
import pathlib
import sys

from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parents[1]
DIR = ROOT / "Log/Circle8/output" / (sys.argv[1] if len(sys.argv) > 1 else "v3-fixed10")
W = int(sys.argv[2]) if len(sys.argv) > 2 else 340
COLS = int(sys.argv[3]) if len(sys.argv) > 3 else 5

files = sorted(p for p in DIR.glob("portrait-*.png") if "-grid" not in p.name)
items = []
for f in files:
    im = Image.open(f).convert("RGB")
    h = round(im.height * W / im.width)
    items.append((f.stem.replace("portrait-", ""), im.resize((W, h), Image.LANCZOS), im.size))

rowh = max(i.height for _, i, _ in items)
rows = (len(items) + COLS - 1) // COLS
sheet = Image.new("RGB", (COLS * W, rows * rowh), (24, 24, 24))
d = ImageDraw.Draw(sheet)
for k, (tag, im, size) in enumerate(items):
    x, y = (k % COLS) * W, (k // COLS) * rowh
    sheet.paste(im, (x, y))
    d.rectangle([x, y, x + 58, y + 20], fill=(0, 0, 0))
    d.text((x + 4, y + 4), tag, fill=(0, 255, 255))
    print(tag, size)

sizes = {}
for _, _, s in items:
    sizes[s] = sizes.get(s, 0) + 1
print("尺寸分布", sizes)
sheet.save(DIR / "sheet.png")
print("SHEET", DIR / "sheet.png", sheet.size)
