"""Circle5 视频体检：指标 + 0.5s 导航拼图 + 12 点细抽帧图。

指标口径沿用 Circle4：240x136 灰度、相邻帧 |Δ| 均值，按 0.5s 分箱。

用法：python Log/Circle5/analyze_dual.py <video> <tag>
输出：Log/Circle5/output/_<tag>_sheet.png、_<tag>_strip.png、Log/Circle5/dual.json
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "Tool" / "_deps"))
import cv2
import numpy as np
from PIL import Image, ImageDraw

OUTDIR = ROOT / "Log" / "Circle5" / "output"
REC = ROOT / "Log" / "Circle5" / "dual.json"
TIMES = [0.0, 0.6, 1.2, 1.8, 2.4, 2.9, 3.2, 3.5, 3.8, 4.2, 4.6, 5.1]


def energy(video):
    cap = cv2.VideoCapture(str(video))
    fps = cap.get(cv2.CAP_PROP_FPS) or 0
    n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    W = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    H = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    prev, series = None, []
    while True:
        ok, fr = cap.read()
        if not ok:
            break
        g = cv2.cvtColor(cv2.resize(fr, (240, 136)), cv2.COLOR_BGR2GRAY).astype(np.float32)
        if prev is not None:
            series.append(float(np.abs(g - prev).mean()))
        prev = g
    cap.release()
    e = np.array(series) if series else np.zeros(1)
    peak_i = int(e.argmax())
    return {
        "fps": round(fps, 2), "frames": n, "width": W, "height": H,
        "duration": round(n / fps, 2) if fps else None,
        "mean": round(float(e.mean()), 2),
        "peak": round(float(e.max()), 2),
        "peak_t": round((peak_i + 1) / fps, 2) if fps else None,
    }


def grab(video, t):
    cap = cv2.VideoCapture(str(video))
    cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
    ok, fr = cap.read()
    cap.release()
    if not ok:
        return None
    return Image.fromarray(cv2.cvtColor(fr, cv2.COLOR_BGR2RGB))


def grid(imgs, labels, cols, dst, tile_w=320):
    ims = [(im, lb) for im, lb in zip(imgs, labels) if im is not None]
    if not ims:
        return None
    w0, h0 = ims[0][0].size
    tw = tile_w
    th = int(h0 * tw / w0)
    rows = (len(ims) + cols - 1) // cols
    canvas = Image.new("RGB", (cols * tw, rows * (th + 18)), (20, 20, 20))
    d = ImageDraw.Draw(canvas)
    for i, (im, lb) in enumerate(ims):
        r, c = divmod(i, cols)
        canvas.paste(im.resize((tw, th)), (c * tw, r * (th + 18) + 18))
        d.text((c * tw + 4, r * (th + 18) + 3), lb, fill=(255, 230, 120))
    canvas.save(dst)
    return dst


def main(argv):
    video = Path(argv[1]).resolve()
    tag = argv[2]
    m = energy(video)
    m["video"] = str(video.relative_to(ROOT)).replace("\\", "/")
    OUTDIR.mkdir(parents=True, exist_ok=True)

    # 0.5s 导航拼图
    times = [round(i * 0.5, 1) for i in range(int(m["duration"] / 0.5) + 1)]
    imgs = [grab(video, t) for t in times]
    p1 = OUTDIR / f"_{tag}_sheet.png"
    grid(imgs, [f"{t:.1f}s" for t in times], 4, p1)

    # 12 点细抽帧
    imgs2 = [grab(video, t) for t in TIMES]
    p2 = OUTDIR / f"_{tag}_strip.png"
    grid(imgs2, [f"{t:.1f}s" for t in TIMES], 4, p2, tile_w=420)

    m["sheet"] = str(p1.relative_to(ROOT)).replace("\\", "/")
    m["strip"] = str(p2.relative_to(ROOT)).replace("\\", "/")

    rec = json.loads(REC.read_text(encoding="utf-8")) if REC.exists() else {}
    rec[tag] = m
    REC.write_text(json.dumps(rec, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(json.dumps(m, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
