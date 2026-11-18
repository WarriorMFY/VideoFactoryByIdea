"""Circle14 总览图：两条视频的拼条上下叠放，标注请求切点与实际切点。"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.stdout.reconfigure(encoding="utf-8")
HERE = Path(__file__).resolve().parents[1]

ROWS = [
    ("v1 req f31/62/93  ->  act f50/86/105", HERE / "terrain-huangfeng-valley-near-full/chain-01-frames-quarter/video/f31-62-93-strip.png"),
    ("v2 req f20/50/80  ->  act f49/72/99", HERE / "terrain-huangfeng-valley-near-full/chain-02-frames-frontload/video/f20-50-80-strip.png"),
    ("r2 same prompt as v1  ->  act f41-46(whip)/78/99", HERE / "terrain-huangfeng-valley-near-full/chain-01-frames-quarter/video/f31-62-93-r2-strip.png"),
]
WIDTH = 1920
PAD = 30

images = []
for label, path in ROWS:
    im = Image.open(path).convert("RGB")
    h = int(im.height * WIDTH / im.width)
    images.append((label, im.resize((WIDTH, h))))

total_h = sum(im.height + PAD for _, im in images) + PAD
canvas = Image.new("RGB", (WIDTH, total_h), (12, 12, 12))
draw = ImageDraw.Draw(canvas)
y = PAD // 2
for label, im in images:
    draw.text((10, y), label, fill=(255, 255, 255))
    y += 22
    canvas.paste(im, (0, y))
    y += im.height + PAD - 22

out = HERE / "preview.png"
canvas.save(out)
print("OUT", out, canvas.size)
