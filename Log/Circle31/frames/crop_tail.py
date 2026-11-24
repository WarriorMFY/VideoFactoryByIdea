"""镜 4 尾帧：从 K4 全身图裁上半身（含抬起的右手），16:9 放大到 1024×576。零积分。"""
from PIL import Image

SRC = r"Log\Circle31\frames\runs\K4\out_2.png"
DST = r"Log\Circle31\frames\K4-tail.png"


def main():
    im = Image.open(SRC).convert("RGB")
    w, h = im.size
    bh = int(h * 0.62)
    bw = int(bh * 16 / 9)
    x0 = int(w * 0.28)
    y0 = 0
    box = (x0, y0, min(x0 + bw, w), y0 + bh)
    crop = im.crop(box).resize((1024, 576), Image.LANCZOS)
    crop.save(DST)
    print("box", box, "->", DST, crop.size)


if __name__ == "__main__":
    main()
