"""检查 A2 能否直接当镜 2 走廊锚：裁掉底部控制台，看剩余构图（零积分）。"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent
src = Image.open(ROOT / "anchors" / "runs" / "A2-indoor" / "out.png")
print("src", src.size)

# 目标 16:9：保留走廊纵深、气闸、地面黄黑线，切掉控制台面板
box = (360, 0, 1408, 590)
crop = src.crop(box)
print("crop", crop.size, round(crop.size[0] / crop.size[1], 3))
dst = ROOT / "inspect" / "A2-corridor-crop.png"
crop.save(dst)
print(dst.name)
