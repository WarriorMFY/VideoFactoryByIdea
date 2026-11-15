"""按指定时间点抽帧拼图（列数可调），用于判断连续运动 / 是否跳变。

用法：
  python Log/Circle5/frames_at.py <video> <tag> 0.3,0.5,0.7 --cols 3
  python Log/Circle5/frames_at.py <video> <tag> 2.4,2.5,2.6 --cols 3 --crop 0,0,960,544 --zoom 1.5
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "Tool" / "_deps"))
import cv2
from PIL import Image, ImageDraw


def opt(name, default):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


def main():
    vid = Path(sys.argv[1]).resolve()
    tag = sys.argv[2]
    ts = [float(x) for x in sys.argv[3].split(",")]
    cols = int(opt("--cols", "3"))
    crop = opt("--crop", "")
    zoom = float(opt("--zoom", "1"))
    tw = int(opt("--tw", "420"))

    cap = cv2.VideoCapture(str(vid))
    imgs = []
    for t in ts:
        cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
        ok, fr = cap.read()
        if not ok:
            continue
        if crop:
            x, y, w, h = [int(v) for v in crop.split(",")]
            fr = fr[y:y + h, x:x + w]
        im = Image.fromarray(cv2.cvtColor(fr, cv2.COLOR_BGR2RGB))
        if zoom != 1:
            im = im.resize((int(im.width * zoom), int(im.height * zoom)), Image.LANCZOS)
        imgs.append((im, "%.2fs" % t))
    cap.release()
    assert imgs, "无帧"

    rows = (len(imgs) + cols - 1) // cols
    th = int(imgs[0][0].height * tw / imgs[0][0].width)
    canvas = Image.new("RGB", (cols * tw, rows * (th + 20)), (18, 18, 18))
    d = ImageDraw.Draw(canvas)
    for i, (im, lb) in enumerate(imgs):
        r, c = divmod(i, cols)
        canvas.paste(im.resize((tw, th)), (c * tw, r * (th + 20) + 20))
        d.text((c * tw + 4, r * (th + 20) + 4), lb, fill=(255, 225, 110))
    out = ROOT / "Log" / "Circle5" / "output" / ("_%s_at.png" % tag)
    canvas.save(out)
    print("SAVED", out, canvas.size, "n=", len(imgs))


if __name__ == "__main__":
    main()
