"""L4 局部放大抽帧：裁出主体区域后放大，用于判读接触部位 / 离地 / 触地。

用法：python crop_l4.py <video> <tag> <t1,t2,...> [x0,y0,x1,y1] [scale]
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "Tool" / "_deps"))
import cv2
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "Log" / "Circle4" / "output"


def main(argv):
    video, tag = argv[1], argv[2]
    times = [float(x) for x in argv[3].split(",")]
    box = tuple(int(x) for x in argv[4].split(",")) if len(argv) > 4 and argv[4] else (170, 40, 790, 430)
    scale = float(argv[5]) if len(argv) > 5 else 2.0
    cap = cv2.VideoCapture(video)
    tiles = []
    for t in times:
        cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
        ok, fr = cap.read()
        if not ok:
            continue
        x0, y0, x1, y1 = box
        im = Image.fromarray(cv2.cvtColor(fr[y0:y1, x0:x1], cv2.COLOR_BGR2RGB))
        im = im.resize((int(im.width * scale), int(im.height * scale)), Image.LANCZOS)
        d = ImageDraw.Draw(im)
        d.rectangle([0, 0, 96, 26], fill=(0, 0, 0))
        d.text((6, 6), "%.2fs" % t, fill=(255, 255, 0))
        tiles.append(im)
    cap.release()
    if not tiles:
        print("no frames")
        return 1
    cols = 2 if len(tiles) <= 4 else 3
    rows = (len(tiles) + cols - 1) // cols
    tw, th = tiles[0].size
    sh = Image.new("RGB", (cols * tw, rows * th), (20, 20, 20))
    for i, im in enumerate(tiles):
        sh.paste(im, ((i % cols) * tw, (i // cols) * th))
    p = OUT / ("_%s_zoom.png" % tag)
    sh.save(p)
    print("ZOOM", p, sh.size)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
