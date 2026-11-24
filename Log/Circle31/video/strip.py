"""抽帧拼条：每 run 取 4 帧（0.1/1.7/3.4/5.0s）拼成一行，附时间标注。零积分。"""
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
FF = ROOT.parents[2] / "Tool" / "ffmpeg.py"
TIMES = [0.1, 1.6, 3.2, 4.7]


def shot(video: Path, t: float, out: Path):
    subprocess.run([sys.executable, str(FF), "-y", "-ss", str(t), "-i", str(video),
                    "-frames:v", "1", str(out)], check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def main():
    for run in sorted((ROOT / "runs").iterdir()):
        video = run / "out.mp4"
        if not video.exists():
            continue
        tmp = run / "_tmp"
        tmp.mkdir(exist_ok=True)
        imgs = []
        for i, t in enumerate(TIMES):
            p = tmp / f"f{i}.png"
            shot(video, t, p)
            imgs.append((t, Image.open(p).convert("RGB")))
        w, h = imgs[0][1].size
        tw = w // 2
        th = int(h * tw / w)
        canvas = Image.new("RGB", (tw * len(imgs), th + 24), (12, 12, 12))
        d = ImageDraw.Draw(canvas)
        for i, (t, im) in enumerate(imgs):
            canvas.paste(im.resize((tw, th), Image.LANCZOS), (i * tw, 24))
            d.text((i * tw + 6, 6), f"{t:.1f}s", fill=(240, 220, 180))
        canvas.save(run / "strip.png")
        print(f"{run.name}: {w}x{h} -> strip {canvas.size}")


if __name__ == "__main__":
    main()
