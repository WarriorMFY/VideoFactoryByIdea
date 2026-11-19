"""抽帧拼条：等间隔取 N 帧横向拼成一条，仅作导航，不用于判分。

用法：
  python sheet.py <video.mp4> [N=5] [--out <png>]

输出：
  默认 <video 同目录>/<stem>-strip.png
"""
import argparse
import sys
from pathlib import Path

import cv2
from PIL import Image, ImageDraw

sys.stdout.reconfigure(encoding="utf-8")


def main():
    ap = argparse.ArgumentParser(description="抽帧拼条")
    ap.add_argument("video")
    ap.add_argument("n", nargs="?", type=int, default=5)
    ap.add_argument("--out")
    a = ap.parse_args()

    src = Path(a.video)
    if not src.exists():
        raise SystemExit("视频不存在：" + str(src))
    if a.n < 2:
        raise SystemExit("N 至少为 2")

    cap = cv2.VideoCapture(str(src))
    fps = cap.get(cv2.CAP_PROP_FPS) or 24.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    idx = [int(round(i * (total - 1) / (a.n - 1))) for i in range(a.n)]

    frames = []
    for i in idx:
        cap.set(cv2.CAP_PROP_POS_FRAMES, i)
        ok, frame = cap.read()
        if not ok:
            continue
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        frames.append((i, round(i / fps, 2), Image.fromarray(rgb)))
    cap.release()
    if not frames:
        raise SystemExit("抽帧失败")

    w, h = frames[0][2].size
    canvas = Image.new("RGB", (w * len(frames), h + 28), (20, 20, 20))
    draw = ImageDraw.Draw(canvas)
    for k, (i, t, im) in enumerate(frames):
        canvas.paste(im, (k * w, 28))
        draw.text((k * w + 8, 8), "f{}  {}s".format(i, t), fill=(255, 255, 255))

    out = Path(a.out) if a.out else src.parent / (src.stem + "-strip.png")
    if not out.is_absolute():
        out = Path.cwd() / out
    out.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out)
    print("FRAMES", [t for _, t, _ in frames], "dur", round(total / fps, 2), "size", (w, h))
    print("OUT", out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
