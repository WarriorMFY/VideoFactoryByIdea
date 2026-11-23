"""t2v-probe 度量：时长核对 + 3x3 分区运动曲线（无锚版）。

    python measure.py --run Log/Circle28/t2v/runs/T1-推镜 [--step 0.2]

输出 <run>/metrics.json 与 <run>/zones.png。判据见 ../reference/judging.md。
与 i2v-probe 的差异：没有 anchor_ncc（无首帧锚），增加 dur 偏差与黑边检测。
"""
import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np

ROWS, COLS = 3, 3


def imwrite_u(p, img):
    ok, buf = cv2.imencode(Path(p).suffix or ".png", img)
    if ok:
        Path(p).write_bytes(buf.tobytes())
    return ok


def gray(img):
    return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)


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


def black_edges(frame):
    """左右黑边宽度（像素）。i2v 21:9 有左右各 122px 的前科，t2v 也验一道。"""
    g = gray(frame)
    col_mean = g.mean(axis=0)
    w = len(col_mean)
    left = 0
    while left < w and col_mean[left] < 2:
        left += 1
    right = 0
    while right < w and col_mean[w - 1 - right] < 2:
        right += 1
    return left, right


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", required=True, help="runs/<id> 目录")
    ap.add_argument("--step", type=float, default=0.2, help="抽帧间隔（秒）")
    a = ap.parse_args()

    run = Path(a.run).resolve()
    run_json = run / "run.json"
    if not run_json.exists():
        print("缺 run.json，先跑 probe.py", file=sys.stderr)
        return 2
    rec = json.loads(run_json.read_text(encoding="utf-8"))
    video_p = Path(rec.get("file") or (run / "out.mp4"))
    if not video_p.exists():
        print(f"视频不存在: {video_p}", file=sys.stderr)
        return 2

    cap = cv2.VideoCapture(str(video_p))
    fps = cap.get(cv2.CAP_PROP_FPS) or 24.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    step = max(1, int(round(fps * a.step)))

    first, last, prev_g = None, None, None
    series, per_zone_motion = [], [[0.0] * COLS for _ in range(ROWS)]
    idx = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if first is None:
            first = frame
            size = (gray(frame).shape[1], gray(frame).shape[0])
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

    h, w = gray(first).shape
    left_px, right_px = black_edges(first)
    motion_flat = flat(per_zone_motion)
    motion_max = max(motion_flat)
    dur_measured = round(total / fps, 3) if total else None
    dur_req = rec.get("params", {}).get("dur")

    metrics = {
        "id": rec.get("id"),
        "group": rec.get("group"),
        "video": str(video_p),
        "fps": round(fps, 3),
        "frames": total,
        "size": [w, h],
        "black_edges_px": [left_px, right_px],
        "dur_measured": dur_measured,
        "dur_requested": dur_req,
        "dur_delta": round(dur_measured - dur_req, 3) if (dur_measured and dur_req) else None,
        "motion_max": round(motion_max, 2),
        "motion_zone": motion_flat.index(motion_max) + 1,
        "motion_band": band(motion_max),
        "zone_motion": [round(v, 2) for v in motion_flat],
        "series": series,
    }
    (run / "metrics.json").write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8")

    # 末帧九宫格：标注全片分区运动峰值
    vis = cv2.resize(last, (w, h))
    for i in range(1, ROWS):
        cv2.line(vis, (0, h * i // ROWS), (w, h * i // ROWS), (60, 60, 60), 1)
    for i in range(1, COLS):
        cv2.line(vis, (w * i // COLS, 0), (w * i // COLS, h), (60, 60, 60), 1)
    for r in range(ROWS):
        for c in range(COLS):
            txt = f"{r * COLS + c + 1}:{per_zone_motion[r][c]:.1f}"
            cv2.putText(vis, txt, (c * w // COLS + 6, r * h // ROWS + 22),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1, cv2.LINE_AA)
    imwrite_u(run / "zones.png", vis)

    print(f"{metrics['id']}  ({metrics['group']})  {metrics['fps']}fps {metrics['frames']}帧 {metrics['size']} {metrics['dur_measured']}s")
    print(f"时长 请求={metrics['dur_requested']}s 实测={metrics['dur_measured']}s 偏差={metrics['dur_delta']}s")
    print(f"黑边 左={metrics['black_edges_px'][0]}px 右={metrics['black_edges_px'][1]}px")
    print(f"运动 motion_max={metrics['motion_max']}(格{metrics['motion_zone']})  档位={metrics['motion_band']}")
    print("分区运动: " + " ".join(f"{i+1}:{v}" for i, v in enumerate(metrics["zone_motion"])))
    print(f"-> {run / 'metrics.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
