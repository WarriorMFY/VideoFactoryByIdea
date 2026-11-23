"""i2v-probe 度量：锚强度 + 3×3 分区运动 + 终态漂移。

    python measure.py --run Log/Circle20/probe/runs/M1-大动 [--step 0.2]

输出 <run>/metrics.json 与 <run>/zones.png。判据见 ../reference/judging.md。
"""
import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np

ROWS, COLS = 3, 3


def imread_u(p):
    """Windows 下 cv2.imread 不认非 ASCII 路径，统一走 fromfile 解码。"""
    buf = np.fromfile(str(p), dtype=np.uint8)
    return cv2.imdecode(buf, cv2.IMREAD_COLOR) if buf.size else None


def imwrite_u(p, img):
    ok, buf = cv2.imencode(Path(p).suffix or ".png", img)
    if ok:
        Path(p).write_bytes(buf.tobytes())
    return ok


def gray(img):
    return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)


def ncc(a, b, size):
    a = cv2.resize(gray(a), size, interpolation=cv2.INTER_AREA).astype(np.float32)
    b = cv2.resize(gray(b), size, interpolation=cv2.INTER_AREA).astype(np.float32)
    a -= a.mean()
    b -= b.mean()
    den = float(np.sqrt((a * a).sum() * (b * b).sum()))
    return float((a * b).sum() / den) if den else 0.0


def zone_matrix(diff):
    h, w = diff.shape
    ys = np.linspace(0, h, ROWS + 1).astype(int)
    xs = np.linspace(0, w, COLS + 1).astype(int)
    return [[float(diff[ys[r]:ys[r + 1], xs[c]:xs[c + 1]].mean()) for c in range(COLS)]
            for r in range(ROWS)]


def flat(m):
    return [m[r][c] for r in range(ROWS) for c in range(COLS)]


def band(motion):
    if motion < 2:
        return "静"
    if motion < 8:
        return "微"
    if motion < 25:
        return "中"
    return "大"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", required=True, help="runs/<id> 目录")
    ap.add_argument("--step", type=float, default=0.2, help="抽帧间隔（秒）")
    a = ap.parse_args()

    run = Path(a.run).resolve()
    anchor_p = run / "anchor.png"
    run_json = run / "run.json"
    if not anchor_p.exists() or not run_json.exists():
        print("缺 anchor.png 或 run.json，先跑 probe.py", file=sys.stderr)
        return 2
    rec = json.loads(run_json.read_text(encoding="utf-8"))
    video_p = Path(rec.get("file") or (run / "out.mp4"))
    if not video_p.exists():
        print(f"视频不存在: {video_p}", file=sys.stderr)
        return 2

    anchor = imread_u(anchor_p)
    if anchor is None:
        print(f"anchor.png 读不出来: {anchor_p}", file=sys.stderr)
        return 2
    cap = cv2.VideoCapture(str(video_p))
    fps = cap.get(cv2.CAP_PROP_FPS) or 24.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    step = max(1, int(round(fps * a.step)))

    first, last, prev = None, None, None
    series, per_zone_motion = [], [[0.0] * COLS for _ in range(ROWS)]
    idx = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if first is None:
            first = frame
            size = (anchor.shape[1], anchor.shape[0])
            prev_g = cv2.resize(gray(frame), size, interpolation=cv2.INTER_AREA)
        last = frame
        if idx % step == 0 and idx > 0:
            g = cv2.resize(gray(frame), size, interpolation=cv2.INTER_AREA)
            z = zone_matrix(cv2.absdiff(g, prev_g).astype(np.float32))
            for r in range(ROWS):
                for c in range(COLS):
                    per_zone_motion[r][c] = max(per_zone_motion[r][c], z[r][c])
            series.append({"t": round(idx / fps, 2), "zones": [z[r][c] for r in range(ROWS) for c in range(COLS)]})
            prev_g = g
        idx += 1
    cap.release()

    if first is None:
        print("读不到帧", file=sys.stderr)
        return 2

    size = (anchor.shape[1], anchor.shape[0])
    anchor_ncc = ncc(first, anchor, size)
    drift = zone_matrix(cv2.absdiff(
        cv2.resize(gray(last), size, interpolation=cv2.INTER_AREA).astype(np.float32),
        cv2.resize(gray(anchor), size, interpolation=cv2.INTER_AREA).astype(np.float32)))
    motion_flat = flat(per_zone_motion)
    drift_flat = flat(drift)
    motion_max = max(motion_flat)
    drift_max = max(drift_flat)

    metrics = {
        "id": rec.get("id"),
        "group": rec.get("group"),
        "video": str(video_p),
        "fps": round(fps, 3),
        "frames": total,
        "dur_measured": round(total / fps, 3) if total else None,
        "dur_requested": rec.get("params", {}).get("dur"),
        "anchor_ncc": round(anchor_ncc, 4),
        "anchor_band": "锁住" if anchor_ncc >= 0.95 else ("松动" if anchor_ncc >= 0.90 else "锚失效"),
        "motion_max": round(motion_max, 2),
        "motion_zone": motion_flat.index(motion_max) + 1,
        "motion_band": band(motion_max),
        "drift_max": round(drift_max, 2),
        "drift_zone": drift_flat.index(drift_max) + 1,
        "zone_motion": [round(v, 2) for v in motion_flat],
        "zone_drift": [round(v, 2) for v in drift_flat],
        "series": series,
    }
    (run / "metrics.json").write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8")

    # 终态九宫格标注
    vis = cv2.resize(last, size)
    h, w = vis.shape[:2]
    for i in range(1, ROWS):
        cv2.line(vis, (0, h * i // ROWS), (w, h * i // ROWS), (60, 60, 60), 1)
    for i in range(1, COLS):
        cv2.line(vis, (w * i // COLS, 0), (w * i // COLS, h), (60, 60, 60), 1)
    for r in range(ROWS):
        for c in range(COLS):
            txt = f"{r * COLS + c + 1}:{drift[r][c]:.1f}"
            cv2.putText(vis, txt, (c * w // COLS + 6, r * h // ROWS + 22),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1, cv2.LINE_AA)
    imwrite_u(run / "zones.png", vis)

    print(f"{metrics['id']}  ({metrics['group']})  {metrics['fps']}fps {metrics['frames']}帧 {metrics['dur_measured']}s")
    print(f"锚   anchor_ncc={metrics['anchor_ncc']}  {metrics['anchor_band']}")
    print(f"运动 motion_max={metrics['motion_max']}(格{metrics['motion_zone']})  档位={metrics['motion_band']}")
    print(f"漂移 drift_max={metrics['drift_max']}(格{metrics['drift_zone']})")
    print("分区运动: " + " ".join(f"{i+1}:{v}" for i, v in enumerate(metrics["zone_motion"])))
    print(f"-> {run/'metrics.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
