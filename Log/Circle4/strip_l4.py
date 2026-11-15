"""按指定时间点抽帧并拼成一张高清对照图，用于 L4 逐帧判读。

用法：python strip_l4.py <video> <tag> [t1,t2,...]
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "Tool" / "_deps"))
import cv2
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "Log" / "Circle4" / "output"
TIMES = [0.0, 0.6, 1.2, 1.8, 2.4, 2.9, 3.2, 3.5, 3.8, 4.2, 4.6, 5.1]


def main(argv):
    video, tag = argv[1], argv[2]
    times = [float(x) for x in argv[3].split(",")] if len(argv) > 3 else TIMES
    cap = cv2.VideoCapture(video)
    H = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    W = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    tiles = []
    for t in times:
        cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
        ok, fr = cap.read()
        if not ok:
            continue
        im = Image.fromarray(cv2.cvtColor(fr, cv2.COLOR_BGR2RGB)).resize((W * 2 // 2, H), Image.LANCZOS)
        d = ImageDraw.Draw(im)
        d.rectangle([0, 0, 92, 22], fill=(0, 0, 0))
        d.text((5, 5), "%.2fs" % t, fill=(255, 255, 0))
        tiles.append(im)
    cap.release()
    cols = 4
    rows = (len(tiles) + cols - 1) // cols
    tw, th = tiles[0].size
    sh = Image.new("RGB", (cols * tw, rows * th), (20, 20, 20))
    for i, im in enumerate(tiles):
        sh.paste(im, ((i % cols) * tw, (i // cols) * th))
    p = OUT / ("_%s_strip.png" % tag)
    sh.save(p)
    print("STRIP", p, sh.size)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
