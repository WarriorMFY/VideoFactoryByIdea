"""Circle13 预览图：同一条地貌卡按「行数 × 时长」裁切后的画面容量对照。

用法：python Log/Circle13/make_preview.py
输出：Log/Circle13/preview.png
"""
import sys
from pathlib import Path

import cv2
from PIL import Image, ImageDraw, ImageFont, ImageOps

sys.stdout.reconfigure(encoding="utf-8")
HERE = Path(__file__).resolve().parent
V = HERE / "文生视频"
OUT = HERE / "preview.png"

CELL_W, CELL_H, PAD, GAP, LABEL_H, ROW_GAP = 440, 249, 24, 12, 26, 30
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
        (fit(grab(V / "terrain-huangfeng-valley-near-shore" / "v1" / "a1.mp4", 60)),
         "A1v1 · 2 行 5s · 75%（药垄有；泉眼只剩溪面）", BAD),
        (fit(grab(V / "terrain-huangfeng-valley-near-shore" / "v2" / "a1v2.mp4", 60)),
         "A1v2 · 2 行 5s · 100%（潭加回：泉眼上涌＋气泡）", GOOD),
        (fit(grab(V / "terrain-huangfeng-valley-under-maple" / "v1" / "a2.mp4", 40)),
         "A2 · 2 行 5s · 100%（狐伏卧 鹤振翅 盘根）", GOOD),
        (fit(grab(V / "terrain-huangfeng-valley-near-3row" / "v1" / "c3.mp4", 60)),
         "C3 · 3 行 5s · 100%（泉眼＋药垄＋盘根同框）", GOOD),
        (fit(grab(V / "terrain-huangfeng-valley-near-full" / "v1" / "b9.mp4", 130)),
         "B9 · 4 行 9s · 75%（盘根丢；景别掉到中远景）", MID),
    ]
    cols = 3
    rows = (len(cells) + cols - 1) // cols
    width = PAD * 2 + cols * CELL_W + (cols - 1) * GAP
    height = PAD + 66 + rows * (CELL_H + LABEL_H) + (rows - 1) * ROW_GAP + PAD
    canvas = Image.new("RGB", (width, height), BG)
    d = ImageDraw.Draw(canvas)
    d.text((PAD, PAD), "Circle13 · 一张地貌卡能装几行：2/3 行满分，4 行两条路都只有 75%",
           font=font(27, True), fill=FG)
    d.text((PAD, PAD + 38),
           "同一镜头卡、同一通道：2 行 100%、3 行 100%、4 行 5s=9s=75%；9s 只换来更广的视野，景别被撑远",
           font=font(17), fill=DIM)
    y0 = PAD + 66
    for i, (im, label, tone) in enumerate(cells):
        r, c = divmod(i, cols)
        x = PAD + c * (CELL_W + GAP)
        y = y0 + r * (CELL_H + LABEL_H + ROW_GAP)
        canvas.paste(im, (x, y))
        d.text((x + 2, y + CELL_H + 6), label, font=font(15), fill=tone)
    canvas.save(OUT)
    print("OUT", OUT, canvas.size)
    return 0


if __name__ == "__main__":
    sys.exit(main())
