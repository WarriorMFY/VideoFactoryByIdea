# -*- coding: utf-8 -*-
"""Circle28 现场器材：成片体检。

判据（spec §3 剪辑层）：尺寸/帧率一致、无黑边、拼接处无跳变（无黑帧、无重复帧）。
输出：edit/final-strip.png（8 帧拼条）+ 控制台数字。
"""
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent  # Log/Circle28
FINAL = ROOT / "edit" / "final.mp4"
CUT = 124  # 镜1 帧数，镜2 首帧下标


def main():
    cap = cv2.VideoCapture(str(FINAL))
    fps = cap.get(cv2.CAP_PROP_FPS)
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    lumas, frames, colors = [], [], []
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
    print(f"size={w}x{h} fps={fps:.2f} frames={n}(meta {total}) dur={n/fps:.3f}s")

    black = [i for i, v in enumerate(lumas) if v < 10]
    print(f"luma min={min(lumas):.1f} max={max(lumas):.1f}  black_frames(<10)={len(black)}")
    if black:
        print("  black idx:", black[:20])

    # 拼接点：末帧 vs 首帧（硬切，应显著不同但都正常曝光）
    a, b = frames[CUT - 1], frames[CUT]
    mad = float(np.abs(a.astype(np.int16) - b.astype(np.int16)).mean())
    print(f"seam f{CUT-1}->f{CUT}: luma {lumas[CUT-1]:.1f}->{lumas[CUT]:.1f}  mad={mad:.2f}")
    dup = min(
        float(np.abs(a.astype(np.int16) - c.astype(np.int16)).mean()) for c in (frames[CUT - 6], frames[CUT - 2])
    )
    print(f"seam 邻帧 mad(前 6 帧)= {dup:.2f}  → 切点 mad 若远大于邻帧即硬切成立")

    # 拼条
    idxs = [round(i * (n - 1) / 7) for i in range(8)]
    th = 640
    tiles = []
    for i in idxs:
        fr = colors[i]
        tw = round(w * th / h)
        tiles.append(cv2.resize(fr, (tw, th), interpolation=cv2.INTER_AREA))
    gap = 8
    canvas = np.full((th + 36, sum(t.shape[1] for t in tiles) + gap * (len(tiles) - 1), 3), 22, np.uint8)
    x = 0
    for i, t in zip(idxs, tiles):
        canvas[36:36 + th, x:x + t.shape[1]] = t
        cv2.putText(canvas, f"f{i} ({i/fps:.1f}s)", (x + 6, 24),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (230, 230, 230), 1, cv2.LINE_AA)
        x += t.shape[1] + gap
    out = ROOT / "edit" / "final-strip.png"
    cv2.imwrite(str(out), canvas)
    print("strip ->", out)


if __name__ == "__main__":
    sys.exit(main())
