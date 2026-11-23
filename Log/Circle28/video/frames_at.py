# -*- coding: utf-8 -*-
"""抽帧条：读 mp4，均匀抽 N 帧拼成横排大图。"""
import sys
from pathlib import Path

import cv2
import numpy as np


def main(video: str, out: str, n: int = 6, h: int = 640):
    cap = cv2.VideoCapture(video)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 24
    idxs = [round(i * (total - 1) / (n - 1)) for i in range(n)]
    frames = []
    for i in idxs:
        cap.set(cv2.CAP_PROP_POS_FRAMES, i)
        ok, fr = cap.read()
        if not ok:
            continue
        w = round(fr.shape[1] * h / fr.shape[0])
        frames.append(cv2.resize(fr, (w, h), interpolation=cv2.INTER_AREA))
    cap.release()
    gap = 8
    canvas = np.full((h + 36, sum(f.shape[1] for f in frames) + gap * (n - 1), 3), 22, np.uint8)
    x = 0
    for i, f in zip(idxs, frames):
        canvas[36:36 + h, x:x + f.shape[1]] = f
        cv2.putText(canvas, f"f{i} ({i/fps:.1f}s)", (x + 6, 24),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (230, 230, 230), 1, cv2.LINE_AA)
        x += f.shape[1] + gap
    cv2.imwrite(out, canvas)
    print(f"{out} frames={idxs} total={total} fps={fps:.2f}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 6)
