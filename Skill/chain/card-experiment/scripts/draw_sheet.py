"""抽帧拼图：把视频均分成 N 格，标上时间戳，只作段落导航。

用法：
    python draw_sheet.py <video.mp4>
    python draw_sheet.py <video.mp4> -o sheet.png --cols 4 --rows 4
    python draw_sheet.py <video.mp4> --cols 6 --rows 3 --cell 640

注意：抽帧结果不得用于判定动作是否发生。5 秒视频抽 16 格，间隔 0.32 秒，
盾撞、刺入这类 0.1–0.2 秒级事件必然落在两格之间。判定必须通看全片。

依赖：opencv-python、pillow
"""

import argparse
import sys
from pathlib import Path

import cv2
from PIL import Image, ImageDraw

sys.stdout.reconfigure(encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("-o", "--out")
    ap.add_argument("--cols", type=int, default=4)
    ap.add_argument("--rows", type=int, default=4)
    ap.add_argument("--cell", type=int, default=520, help="单格宽度，默认 520px")
    a = ap.parse_args()

    src = Path(a.video)
    out = Path(a.out) if a.out else src.with_name(src.stem + "-sheet.png")

    cap = cv2.VideoCapture(str(src))
    if not cap.isOpened():
        sys.exit("打不开视频：" + str(src))
    fps = cap.get(cv2.CAP_PROP_FPS) or 24
    n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    dur = n / fps
    print("FPS", round(fps, 2), "FRAMES", n, "DUR", round(dur, 2))

    count = a.cols * a.rows
    frames = []
    for i in range(count):
        t = dur * (i + 0.5) / count
        cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000.0)
        ok, fr = cap.read()
        if not ok:
            print("MISS", i, round(t, 2))
            continue
        frames.append((t, Image.fromarray(cv2.cvtColor(fr, cv2.COLOR_BGR2RGB))))
    cap.release()

    if not frames:
        sys.exit("没有抽到任何帧")

    w, h = frames[0][1].size
    cw = a.cell
    ch = int(h * cw / w)
    sheet = Image.new("RGB", (cw * a.cols, ch * a.rows), "black")
    d = ImageDraw.Draw(sheet)
    for idx, (t, img) in enumerate(frames):
        x, y = (idx % a.cols) * cw, (idx // a.cols) * ch
        sheet.paste(img.resize((cw, ch), Image.LANCZOS), (x, y))
        d.rectangle([x, y, x + 92, y + 20], fill="black")
        d.text((x + 6, y + 6), "t=%.2fs" % t, fill="yellow")

    sheet.save(out)
    print("SAVED", out, sheet.size)


if __name__ == "__main__":
    main()
