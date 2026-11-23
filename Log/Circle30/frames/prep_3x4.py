"""Circle30 现场器材：把锁定的 2:3 关键帧裁成 3:4 首帧（供 H3 i2v）。
裁切参数记在这里，不进成片素材（成片不二次裁）。
"""
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
# 上沿保留量，避免切头；其余从底部切
TOPS = {"K1": 60, "K2": 40}

for name, top in TOPS.items():
    src = HERE / f"{name}-locked.png"
    im = Image.open(src)
    w, h = im.size
    nh = round(w * 4 / 3)
    if nh > h:
        nh = h
    y0 = min(top, h - nh)
    out = HERE / f"{name}-3x4.png"
    im.crop((0, y0, w, y0 + nh)).save(out)
    print(f"{name}: {w}x{h} -> {w}x{nh} (top {y0}, bottom {h - y0 - nh})")
