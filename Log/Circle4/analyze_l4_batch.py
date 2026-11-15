"""L4 批量体检：同一 prompt 多轮生成，逐轮出基础指标 + 帧间差分能量曲线 + 0.5s 导航拼图。

指标口径与 Circle4 前序一致：240x136 灰度、相邻帧 |Δ| 均值，按 0.5s 分箱。

用法：python analyze_l4_batch.py output/l4-cs5-b1.mp4 output/l4-cs5-b2.mp4 ...
输出：stdout 摘要 + Log/Circle4/l4_batch.json
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "Tool" / "_deps"))
import cv2
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
OUTDIR = ROOT / "Log" / "Circle4" / "output"
REC = ROOT / "Log" / "Circle4" / "l4_batch.json"


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
    bins = {}
    for i, v in enumerate(e):
        k = "%.1f-%.1f" % (i / fps, (i + 1) / fps) if fps else str(i)
        key = "%.1f" % (int((i / fps) * 2) / 2) if fps else "0"
        bins.setdefault(key, []).append(v)
    out_bins = {}
    for k in sorted(bins, key=float):
        lo = float(k)
        out_bins["%.1f-%.1f" % (lo, lo + 0.5)] = round(float(np.mean(bins[k])), 2)
    peak_i = int(e.argmax())
    return {
        "fps": fps,
        "frames": n,
        "duration": round(n / fps, 2) if fps else 0,
        "size": f"{W}x{H}",
        "energy_mean": round(float(e.mean()), 2),
        "energy_peak": round(float(e.max()), 2),
        "peak_at": "%.2fs" % (peak_i / fps) if fps else "",
        "energy_bins": out_bins,
        "curve": [round(v, 2) for v in e.tolist()],
    }


def sheet(video, dur, tag, step=0.5):
    cap = cv2.VideoCapture(str(video))
    W = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    H = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    thumbs = []
    t = 0.0
    while t <= dur + 1e-6:
        cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
        ok, fr = cap.read()
        if ok:
            im = Image.fromarray(cv2.cvtColor(fr, cv2.COLOR_BGR2RGB))
            th = im.resize((320, int(320 * H / W)), Image.LANCZOS)
            d = ImageDraw.Draw(th)
            d.rectangle([0, 0, 80, 20], fill=(0, 0, 0))
            d.text((4, 4), "%.2fs" % t, fill=(255, 255, 0))
            thumbs.append(th)
        t = round(t + step, 2)
    cap.release()
    if not thumbs:
        return None
    cols = 4
    rows = (len(thumbs) + cols - 1) // cols
    tw, th = thumbs[0].size
    sh = Image.new("RGB", (cols * tw, rows * th), (30, 30, 30))
    for i, im in enumerate(thumbs):
        sh.paste(im, ((i % cols) * tw, (i // cols) * th))
    p = OUTDIR / ("_%s_sheet.png" % tag)
    sh.save(p)
    return p


def main(argv):
    vids = [Path(a) for a in argv[1:]]
    recs = []
    for v in vids:
        if not v.exists():
            print("MISS", v)
            continue
        v = v.resolve()
        m = energy(v)
        tag = v.stem
        p = sheet(v, m["duration"], tag)
        m["video"] = str(v.relative_to(ROOT)).replace("\\", "/")
        m["sheet"] = str(p.relative_to(ROOT)).replace("\\", "/") if p else None
        recs.append(m)
        print("=" * 62)
        print(f"{v.name}  {m['size']}  {m['fps']}fps  {m['frames']}帧  {m['duration']}s")
        print(f"  能量 mean={m['energy_mean']} peak={m['energy_peak']}@{m['peak_at']}")
        print("  bins " + " ".join(f"{k}:{val}" for k, val in m["energy_bins"].items()))
    REC.write_text(json.dumps(recs, ensure_ascii=False, indent=2), encoding="utf-8")
    print("REC", REC)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
