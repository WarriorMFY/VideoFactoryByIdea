"""成片体检：尺寸/帧率/帧数、黑帧、两处拼接点的 mad 与邻帧基线、段内首末帧。零积分。"""
import json
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
VIDEO = ROOT / "edit" / "final.mp4"
CUTS = [120, 240, 360, 480]


def mad(a, b):
    return float(np.mean(np.abs(a.astype(np.float32) - b.astype(np.float32))))


def main():
    cap = cv2.VideoCapture(str(VIDEO))
    fps = cap.get(cv2.CAP_PROP_FPS)
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    frames, colors, lumas = [], [], []
    while True:
        ok, fr = cap.read()
        if not ok:
            break
        g = cv2.cvtColor(fr, cv2.COLOR_BGR2GRAY)
        lumas.append(float(g.mean()))
        frames.append(g)
        colors.append(fr)
    cap.release()
    n = len(frames)
    black = [i for i, v in enumerate(lumas) if v < 16]
    seams = {}
    for c in CUTS:
        if 0 < c < n:
            base = [mad(frames[i], frames[i + 1]) for i in range(max(0, c - 4), min(n - 1, c + 4)) if i + 1 != c]
            seams[c] = {"mad": round(mad(frames[c - 1], frames[c]), 2),
                        "neighbor_med": round(float(np.median(base)), 2)}
    out = {"file": str(VIDEO), "size": f"{w}x{h}", "fps": fps, "frames": n,
           "duration_s": round(n / fps, 3) if fps else None,
           "luma_min": round(min(lumas), 1), "luma_max": round(max(lumas), 1),
           "black_frames": len(black), "seams": seams}
    (ROOT / "edit" / "check.json").write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(out, ensure_ascii=False, indent=2))

    picks = [0, 60, 119, 120, 180, 239, 240, 300, 359, 360, 420, 479, 480, 540, 599]
    tiles = [cv2.resize(colors[i], (240, 138)) for i in picks if i < n]
    strip = np.hstack(tiles)
    cv2.imwrite(str(ROOT / "edit" / "final-strip.png"), strip)


if __name__ == "__main__":
    main()
