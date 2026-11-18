"""源段 vs 生成段 同时间点对照（每行上源下生成）。用法: python compare.py"""
import sys
from pathlib import Path

import cv2
from PIL import Image, ImageDraw

sys.stdout.reconfigure(encoding="utf-8")
HERE = Path(__file__).resolve().parent
SRC = HERE.parent / "src-video" / "first10s.mp4"
SEGS = {"s1": (0.0, 4.4), "s2": (4.4, 8.4), "s3": (8.4, 10.0)}
TW, TH, GAP, HDR = 320, 180, 16, 16


def grab(cap, t):
    cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000.0)
    ok, f = cap.read()
    return cv2.resize(f, (TW, TH)) if ok else None


def make(tag):
    a, b = SEGS[tag]
    dur = b - a
    gcap = cv2.VideoCapture(str(HERE / "trim" / (tag + ".mp4")))
    scap = cv2.VideoCapture(str(SRC))
    cols = 4
    sheet = Image.new("RGB", (TW * cols, (TH + HDR) * 2 + 26), (18, 18, 18))
    d = ImageDraw.Draw(sheet)
    for i in range(cols):
        t = dur * i / (cols - 1) * 0.98
        for row, cap, label in ((0, scap, "源 t=%.1f" % t), (1, gcap, "生成 t=%.1f" % t)):
            f = grab(cap, a + t) if row == 0 else grab(cap, t)
            if f is None:
                continue
            y = row * (TH + HDR) + HDR
            sheet.paste(Image.fromarray(cv2.cvtColor(f, cv2.COLOR_BGR2RGB)), (i * TW, y))
            d.text((i * TW + 4, y - 14), label, fill=(210, 210, 210))
    d.text((4, (TH + HDR) * 2 + HDR + 4),
           "%s  上=源片同段   下=重绘   段长 %.1fs" % (tag.upper(), dur), fill=(230, 200, 120))
    scap.release(); gcap.release()
    out = HERE / "trim" / (tag + "-vs-src.png")
    sheet.save(out)
    print(out.name, sheet.size)


if __name__ == "__main__":
    for t in (sys.argv[1:] or ["s1", "s2", "s3"]):
        make(t)
