"""Circle12 预览图：同 prompt 图片 vs 视频 v1（静态写法） vs v2（动态写法）。

用法：python Log/Circle12/make_preview.py
输出：Log/Circle12/preview-p1.png
"""
import sys
from pathlib import Path

import cv2
from PIL import Image, ImageDraw, ImageFont, ImageOps

sys.stdout.reconfigure(encoding="utf-8")
HERE = Path(__file__).resolve().parent
CARD = "terrain-huangfeng-valley-near"
IMG = HERE / CARD / "chain-01-precheck" / "image" / "near-precheck.png"
V1 = HERE / CARD / "chain-02-near-a" / "video" / "near-a.mp4"
V2 = HERE / CARD / "chain-03-near-b" / "video" / "near-b.mp4"
V3 = HERE / CARD / "chain-04-near-c" / "video" / "near-c.mp4"
OUT = HERE / "preview-p1.png"

CELL_W, CELL_H, PAD, GAP, LABEL_H = 460, 259, 24, 12, 28
BG, FG, DIM = (18, 20, 24), (236, 238, 242), (150, 156, 166)
GOOD, MID, BAD, ACCENT = (126, 211, 152), (238, 200, 110), (232, 128, 110), (240, 190, 90)


def font(size, bold=False):
    for p in ("C:/Windows/Fonts/msyhbd.ttc", "C:/Windows/Fonts/msyh.ttc"):
        try:
            return ImageFont.truetype(p, size)
        except OSError:
            continue
    return ImageFont.load_default()


def fit(im):
    return ImageOps.fit(im.convert("RGB"), (CELL_W, CELL_H), Image.LANCZOS)


def grab(path, idx):
    cap = cv2.VideoCapture(str(path))
    cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
    ok, fr = cap.read()
    cap.release()
    if not ok:
        raise SystemExit("抽帧失败 %s %s" % (path.name, idx))
    return Image.fromarray(cv2.cvtColor(fr, cv2.COLOR_BGR2RGB))


def main():
    cells = [
        (fit(Image.open(IMG)), "图片通道 · 62.5%（药田有 巨树有 动物无 泉眼无）", MID),
        (fit(grab(V1, 120)), "视频 v1 静态写法 · 37.5%（药田无 巨树无 动物无）", BAD),
        (fit(grab(V2, 60)), "视频 v2 动态写法 · 75%（泉眼 狐鹤 盘根有；药田无）", GOOD),
        (fit(grab(V3, 60)), "视频 v3 药田换词 · 75%（药垄 泉眼 狐鹤有；盘根被挤掉）", GOOD),
    ]
    width = PAD * 2 + len(cells) * CELL_W + (len(cells) - 1) * GAP
    height = PAD + 66 + CELL_H + LABEL_H + PAD
    canvas = Image.new("RGB", (width, height), BG)
    d = ImageDraw.Draw(canvas)
    d.text((PAD, PAD), "Circle12 · 地貌卡近景 × 镜头卡：写法三版对照", font=font(28, True), fill=FG)
    d.text((PAD, PAD + 38),
           "镜头五元组 3/3 条全中（零位移）；改成动态写法 37.5%→75%；换词只换元素不增总量，仍 75%",
           font=font(17), fill=DIM)
    y = PAD + 66
    for i, (im, label, tone) in enumerate(cells):
        x = PAD + i * (CELL_W + GAP)
        canvas.paste(im, (x, y))
        d.text((x + 2, y + CELL_H + 6), label, font=font(15), fill=tone)
    canvas.save(OUT)
    print("OUT", OUT, canvas.size)
    return 0


if __name__ == "__main__":
    sys.exit(main())
