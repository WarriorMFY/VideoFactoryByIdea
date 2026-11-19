"""src.mp4 → 段表 + 锚帧。

判据不在这里新写：一律调用 Skill/chain/shot-repaint/scripts/seg_scan.py
（硬切 hist_l1>0.30、机位位移 dx_frac），本脚本只做「切成段 + 抽首帧 + 打分」。

    python segment.py <video> --outdir Log/Circle20/probe/src/<vid> [--secs 120]
"""
import argparse
import csv
import json
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[4]          # .../CardStudio
SCAN = ROOT / "Skill" / "chain" / "shot-repaint" / "scripts" / "seg_scan.py"
FFMPEG = ROOT / "Tool" / "ffmpeg.py"

sys.stdout.reconfigure(encoding="utf-8")


def run_scan(video: Path, secs: float, csv_path: Path) -> None:
    cmd = [sys.executable, str(SCAN), str(video), "--secs", str(secs),
           "--fps", "10", "--out", str(csv_path)]
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        raise SystemExit("seg_scan 失败：\n" + (r.stdout or "")[-800:] + (r.stderr or "")[-800:])


def read_rows(csv_path: Path):
    rows = []
    with open(csv_path, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            rows.append({"t": float(row["t"]), "hist": float(row["hist_l1"] or 0),
                         "dx": float(row["dx_frac"] or 0)})
    return rows


def quality(png: Path) -> dict:
    img = cv2.imread(str(png))
    if img is None:
        return {"laplacian": 0.0, "mean": 0.0, "std": 0.0, "flag": "读不到"}
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    lap = float(cv2.Laplacian(g, cv2.CV_64F).var())
    mean, std = float(g.mean()), float(g.std())
    flag = "ok"
    if mean < 16 and std < 25:
        flag = "黑帧"
    elif lap < 60:
        flag = "模糊"
    return {"laplacian": round(lap, 1), "mean": round(mean, 1), "std": round(std, 1),
            "flag": flag, "w": img.shape[1], "h": img.shape[0]}


def grab_frame(video: Path, t: float, out: Path) -> bool:
    r = subprocess.run([sys.executable, str(FFMPEG), "-y", "-ss", f"{t:.3f}", "-i", str(video),
                        "-frames:v", "1", str(out)], capture_output=True)
    return r.returncode == 0 and out.exists() and out.stat().st_size > 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--outdir", required=True)
    ap.add_argument("--secs", type=float, default=120.0)
    ap.add_argument("--cut", type=float, default=0.30, help="硬切阈值，沿用 metrics.md")
    ap.add_argument("--min-len", type=float, default=1.0)
    ap.add_argument("--max-len", type=float, default=9.0)
    ap.add_argument("--max-segs", type=int, default=12)
    a = ap.parse_args()

    video = Path(a.video).resolve()
    outdir = Path(a.outdir).resolve()
    outdir.mkdir(parents=True, exist_ok=True)
    anchors = outdir / "anchors"
    anchors.mkdir(exist_ok=True)

    cap = cv2.VideoCapture(str(video))
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    cap.release()
    dur = min(total / fps, a.secs)

    csv_path = outdir / "seg.csv"
    if not csv_path.exists():
        print(f"[segment] 扫描前 {dur:.1f}s（10fps，SIFT）…", flush=True)
        run_scan(video, dur, csv_path)
    rows = read_rows(csv_path)

    cuts = [r["t"] for r in rows if r["hist"] > a.cut]
    bounds = [0.0] + cuts + [dur]
    raw = []
    for i in range(len(bounds) - 1):
        s, e = bounds[i], bounds[i + 1]
        if e - s >= a.min_len:
            raw.append([s, e])

    # 超长段按等分拆开，不按固定 9s 硬切，避免切在动作中段
    segs = []
    for s, e in raw:
        n = max(1, int(np.ceil((e - s) / a.max_len)))
        step = (e - s) / n
        for k in range(n):
            segs.append((round(s + k * step, 3), round(s + (k + 1) * step, 3)))

    # 超过上限按等间隔抽，页面会显示被丢弃的条数
    dropped = 0
    if len(segs) > a.max_segs:
        idx = np.linspace(0, len(segs) - 1, a.max_segs).round().astype(int)
        dropped = len(segs) - len(set(idx.tolist()))
        segs = [segs[i] for i in sorted(set(idx.tolist()))]

    out = []
    for n, (s, e) in enumerate(segs, 1):
        sid = f"S{n:02d}"
        png = anchors / f"{sid}_f0.png"
        if not png.exists():
            grab_frame(video, s, png)
        q = quality(png)
        dx = sum(r["dx"] for r in rows if s <= r["t"] < e) * 100
        move = round(dx / max(e - s, 1e-3), 2)          # 位移累积 %/s
        out.append({"seg": sid, "start": s, "end": e, "dur": round(e - s, 3),
                    "anchor": str(png.relative_to(outdir)).replace("\\", "/"),
                    "move_pct_per_s": move,
                    "quality": q})

    meta = {"video": str(video), "fps": round(fps, 3), "total_frames": total,
            "scanned": round(dur, 2), "cut_threshold": a.cut,
            "cuts": cuts, "segments": out, "dropped": dropped}
    (outdir / "segments.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2),
                                          encoding="utf-8")
    print(f"[segment] {len(out)} 段，切点 {['%.2f' % c for c in cuts]}")
    for s in out:
        print(f"  {s['seg']} {s['start']:6.2f}-{s['end']:6.2f} {s['dur']:5.2f}s "
              f"move={s['move_pct_per_s']:5.2f}%/s {s['quality']['flag']} lap={s['quality']['laplacian']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
