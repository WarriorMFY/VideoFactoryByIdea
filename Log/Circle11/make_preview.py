"""Circle11 预览图：文生图 6 样本 + 文生视频 2 条各 3 帧，拼一张总览。

用法：python Log/Circle11/make_preview.py
输出：Log/Circle11/preview.png
"""
import sys
from pathlib import Path

import cv2
from PIL import Image, ImageDraw, ImageFont, ImageOps

sys.stdout.reconfigure(encoding="utf-8")
HERE = Path(__file__).resolve().parent
CARD = "terrain-huangfeng-valley"
IMG = HERE / "文生图" / CARD
VID = HERE / "文生视频" / CARD
OUT = HERE / "preview.png"

CELL_W, CELL_H, PAD, GAP, LABEL_H = 460, 259, 24, 12, 26
COLS = 3
BG = (18, 20, 24)
FG = (236, 238, 242)
DIM = (150, 156, 166)
ACCENT = (240, 190, 90)
GOOD = (126, 211, 152)
MID = (238, 200, 110)
BAD = (232, 128, 110)

FONT = "C:/Windows/Fonts/msyh.ttc"
FONT_B = "C:/Windows/Fonts/msyhbd.ttc"


def font(size, bold=False):
    for p in ((FONT_B, FONT) if bold else (FONT,)):
        try:
            return ImageFont.truetype(p, size)
        except OSError:
            continue
    return ImageFont.load_default()


def fit(im):
    return ImageOps.fit(im.convert("RGB"), (CELL_W, CELL_H), Image.LANCZOS)


def tone(score):
    v = float(score.rstrip("%"))
    return GOOD if v >= 100 else (BAD if v < 70 else MID)


def video_frames(path, n=3):
    cap = cv2.VideoCapture(str(path))
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 24.0
    out = []
    for k in range(n):
        idx = int(round((k + 1) * (total - 1) / (n + 1)))
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ok, fr = cap.read()
        if not ok:
            continue
        out.append(Image.fromarray(cv2.cvtColor(fr, cv2.COLOR_BGR2RGB)))
    cap.release()
    return out, round(total / fps, 1)


def main():
    img_cells = []
    for ver, marks in (("v1", [("01-a.png", "v1-a", "71%"), ("02-b.png", "v1-b", "71%"),
                               ("03-c.png", "v1-c", "79%")]),
                       ("v2", [("01-d.png", "v2-d", "93%")]),
                       ("v3", [("01-e.png", "v3-e", "100%"), ("02-f.png", "v3-f", "100%")])):
        for fn, tag, score in marks:
            p = IMG / ver / fn
            if p.exists():
                img_cells.append((fit(Image.open(p)), "{} · {}".format(tag, score), score))

    vid_cells = []
    for fn, tag, score in (("01-v3-a.mp4", "v3-a", "50%"), ("02-v3-b.mp4", "v3-b", "57%")):
        p = VID / fn
        if not p.exists():
            continue
        frames, dur = video_frames(p, 3)
        for k, fr in enumerate(frames):
            vid_cells.append((fit(fr), "{} · {} · {}s f{}".format(tag, score, dur, k + 1), score))

    rows_img = (len(img_cells) + COLS - 1) // COLS
    rows_vid = (len(vid_cells) + COLS - 1) // COLS
    row_h = CELL_H + LABEL_H + GAP
    width = PAD * 2 + COLS * CELL_W + (COLS - 1) * GAP
    height = PAD + 56 + 40 + rows_img * row_h + 28 + 40 + rows_vid * row_h + PAD

    canvas = Image.new("RGB", (width, height), BG)
    d = ImageDraw.Draw(canvas)
    d.text((PAD, PAD), "Circle11 · 地貌卡 terrain-huangfeng-valley", font=font(30, True), fill=FG)
    d.text((PAD, PAD + 38), "8 任务 · 109.15 积分 · 图段 100% / 视频段 50–57%",
           font=font(17), fill=DIM)

    y = PAD + 56 + 40
    d.text((PAD, y - 34), "文生图　G-2.0 · 16:9／1k · 6 样本", font=font(20, True), fill=ACCENT)
    for i, (im, label, score) in enumerate(img_cells):
        r, c = divmod(i, COLS)
        x = PAD + c * (CELL_W + GAP)
        yy = y + r * row_h
        canvas.paste(im, (x, yy))
        d.text((x + 2, yy + CELL_H + 6), label, font=font(16), fill=tone(score))

    y = y + rows_img * row_h + 28
    d.text((PAD, y - 34), "文生视频　MiniMax H3 · 16:9／480P · 2 样本（各 3 帧）", font=font(20, True), fill=ACCENT)
    for i, (im, label, score) in enumerate(vid_cells):
        r, c = divmod(i, COLS)
        x = PAD + c * (CELL_W + GAP)
        yy = y + r * row_h
        canvas.paste(im, (x, yy))
        d.text((x + 2, yy + CELL_H + 6), label, font=font(16), fill=tone(score))

    canvas.save(OUT)
    print("OUT", OUT, canvas.size)
    print("IMG_CELLS", len(img_cells), "VID_CELLS", len(vid_cells))
    return 0


if __name__ == "__main__":
    sys.exit(main())
