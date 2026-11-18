"""Circle14 视频判读：帧数/时长、帧差切点、逐帧位移、拼条与指定帧导出。

用法：
  python Log/Circle14/Tool/analyze.py <mp4> [--at 0,31,62,93,123] [--strip 12]
输出：<stem>-strip.png、<stem>-cuts/（切点邻帧）、<stem>-at/（指定帧）
"""
import argparse
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw

sys.stdout.reconfigure(encoding="utf-8")
W, H = 320, 180


def gray(frame):
    return cv2.cvtColor(cv2.resize(frame, (W, H)), cv2.COLOR_BGR2GRAY)


def save_frame(frame, out: Path, label: str):
    out.mkdir(parents=True, exist_ok=True)
    im = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, 200, 20], fill=(0, 0, 0))
    d.text((6, 5), label, fill=(255, 255, 255))
    im.save(out / (label.replace(" ", "_").replace("=", "") + ".png"))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--at", default="", help="逗号分隔的帧号，导出单帧")
    ap.add_argument("--strip", type=int, default=12)
    a = ap.parse_args()

    src = Path(a.video)
    cap = cv2.VideoCapture(str(src))
    fps = cap.get(cv2.CAP_PROP_FPS) or 24.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    frames = []
    while True:
        ok, fr = cap.read()
        if not ok:
            break
        frames.append(fr)
    cap.release()
    if not frames:
        raise SystemExit("读不到帧")
    n = len(frames)
    size = (frames[0].shape[1], frames[0].shape[0])
    print("FPS %.3f FRAMES %d DUR %.2fs SIZE %s" % (fps, n, n / fps, size))

    grays = [gray(f) for f in frames]
    diffs = []
    for i in range(1, n):
        diffs.append((i, float(np.abs(grays[i].astype(np.int16) - grays[i - 1].astype(np.int16)).mean())))
    med = float(np.median([d for _, d in diffs]))
    print("MEDIAN_DIFF %.2f" % med)
    print("TOP_DIFFS")
    for idx, d in sorted(diffs, key=lambda x: -x[1])[:10]:
        print("  f%-4d t=%.2fs  d=%5.1f" % (idx, idx / fps, d))
    cuts = [(i, d) for i, d in diffs if d > max(med * 3, 8)]
    print("CUTS_OVER_3X", [(i, round(d, 1)) for i, d in cuts])

    # 逐帧平移（相位相关）：判断段内是否静止/横移
    shifts = []
    win = cv2.createHanningWindow((W, H), cv2.CV_32F)
    for i in range(1, n):
        (dx, dy), resp = cv2.phaseCorrelate(grays[i - 1].astype(np.float32), grays[i].astype(np.float32), win)
        shifts.append((i, dx, dy, resp))
    print("BINS_10F  idx  mean|d| px  max  resp")
    for b in range(0, n - 1, 10):
        chunk = shifts[b:b + 10]
        mag = [abs(x[1]) + abs(x[2]) for x in chunk]
        print("  %3d-%3d  %6.2f  %6.2f  %5.2f" % (
            chunk[0][0], chunk[-1][0], float(np.mean(mag)), float(np.max(mag)),
            float(np.mean([c[3] for c in chunk]))))

    # 切点邻帧
    for idx, d in cuts:
        for j in (idx - 2, idx - 1, idx, idx + 1, idx + 2):
            if 0 <= j < n:
                save_frame(frames[j], src.parent / (src.stem + "-cuts"),
                           "f{} t{:.2f}s".format(j, j / fps))

    # 指定帧
    if a.at.strip():
        for j in [int(x) for x in a.at.split(",") if x.strip()]:
            if 0 <= j < n:
                save_frame(frames[j], src.parent / (src.stem + "-at"),
                           "f{} t{:.2f}s".format(j, j / fps))

    # 拼条
    k = max(2, a.strip)
    idxs = [int(round(i * (n - 1) / (k - 1))) for i in range(k)]
    w, h = size
    canvas = Image.new("RGB", (w * k, h + 26), (18, 18, 18))
    draw = ImageDraw.Draw(canvas)
    for pos, j in enumerate(idxs):
        canvas.paste(Image.fromarray(cv2.cvtColor(frames[j], cv2.COLOR_BGR2RGB)), (pos * w, 26))
        draw.text((pos * w + 6, 6), "f{} {:.2f}s".format(j, j / fps), fill=(255, 255, 255))
    out = src.parent / (src.stem + "-strip.png")
    canvas.save(out)
    print("STRIP", out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
