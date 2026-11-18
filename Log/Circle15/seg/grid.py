"""给每个产出一条 2x3 带时间戳的抽帧网格，便于人眼判读。用法: python grid.py [s1 s2 s3]"""
import sys
from pathlib import Path

import cv2
from PIL import Image, ImageDraw

sys.stdout.reconfigure(encoding="utf-8")
HERE = Path(__file__).resolve().parent
TW, TH, GAP = 420, 236, 18


def make(tag):
    mp4 = HERE / "out" / (tag + ".mp4")
    cap = cv2.VideoCapture(str(mp4))
    fps, n = cap.get(cv2.CAP_PROP_FPS), int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    dur = (n - 1) / fps
    sheet = Image.new("RGB", (TW * 3, (TH + GAP) * 2), (18, 18, 18))
    for i in range(6):
        t = dur * i / 5.0
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(round(t * fps)))
        ok, f = cap.read()
        if not ok:
            break
        im = Image.fromarray(cv2.cvtColor(cv2.resize(f, (TW, TH)), cv2.COLOR_BGR2RGB))
        x, y = (i % 3) * TW, (i // 3) * (TH + GAP)
        sheet.paste(im, (x, y + GAP))
        ImageDraw.Draw(sheet).text((x + 4, y + 3), "%.2fs  f%d" % (t, int(round(t * fps))),
                                   fill=(220, 220, 120))
    cap.release()
    out = HERE / "out" / (tag + "-grid.png")
    sheet.save(out)
    print(out.name, sheet.size)


if __name__ == "__main__":
    for t in (sys.argv[1:] or ["s1", "s2", "s3"]):
        if (HERE / "out" / (t + ".mp4")).exists():
            make(t)
        else:
            print("[%s] 还没有产物" % t)
