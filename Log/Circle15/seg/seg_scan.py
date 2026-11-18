# -*- coding: utf-8 -*-
"""前 N 秒分段扫描：全局位移 + 尺度 + 硬切检测。

用法: python seg_scan.py <video> [--secs 10] [--fps 10]
输出: seg.csv（逐采样点）、由 stdout 打印 0.5s 聚合表
"""
import argparse
import csv
import sys
from pathlib import Path

import cv2
import numpy as np

sys.stdout.reconfigure(encoding="utf-8")
cv2.setNumThreads(2)


def hist_sig(gray_small):
    h = cv2.calcHist([gray_small], [0], None, [32], [0, 256])
    cv2.normalize(h, h)
    return h


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--secs", type=float, default=10.0)
    ap.add_argument("--fps", type=float, default=10.0)
    ap.add_argument("--out", default="seg.csv")
    a = ap.parse_args()

    cap = cv2.VideoCapture(a.video)
    if not cap.isOpened():
        sys.exit("打不开视频")
    fps = cap.get(cv2.CAP_PROP_FPS)
    n_total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    step = max(1, int(round(fps / a.fps)))
    n_use = min(n_total, int(round(a.secs * fps)))
    print("视频 %dx%d %.2ffps 共 %d 帧；分析前 %.1fs（每 %.2fs 取一帧，共 %d 采样）"
          % (w, h, fps, n_total, a.secs, step / fps, n_use // step))

    sift = cv2.SIFT_create(nfeatures=1200)
    matcher = cv2.BFMatcher(cv2.NORM_L2)
    rows = []
    prev = None
    prev_sig = None
    idx = 0
    while idx + step <= n_use:
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ok, frame = cap.read()
        if not ok:
            break
        t = idx / fps
        scale_w = 640.0 / frame.shape[1]
        small = cv2.resize(frame, (640, int(round(frame.shape[0] * scale_w))))
        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
        sig = hist_sig(cv2.resize(gray, (160, 90)))

        row = dict(t=round(t, 2), frame=idx, tx=0.0, ty=0.0, rot=0.0, sc=1.0,
                   inl=1.0, match=0, hist_l1=0.0, dx_frac=0.0)
        if prev is not None and prev_sig is not None:
            l1 = float(np.abs(sig - prev_sig).sum() / 2.0)
            row["hist_l1"] = round(l1, 4)

            k1, d1 = sift.detectAndCompute(prev, None)
            k2, d2 = sift.detectAndCompute(gray, None)
            if d1 is not None and d2 is not None and len(k1) > 8 and len(k2) > 8:
                knn = matcher.knnMatch(d1, d2, k=2)
                good = [m for m, n in (p for p in knn if len(p) == 2)
                        if m.distance < 0.75 * n.distance]
                row["match"] = len(good)
                if len(good) >= 8:
                    p1 = np.float32([k1[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
                    p2 = np.float32([k2[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)
                    M, inl = cv2.estimateAffinePartial2D(
                        p1, p2, method=cv2.RANSAC, ransacReprojThreshold=3.0,
                        maxIters=3000, confidence=0.995)
                    if M is not None:
                        sc = float(np.hypot(M[0, 0], M[0, 1]))
                        rot = float(np.degrees(np.arctan2(M[0, 1], M[0, 0])))
                        tx, ty = float(M[0, 2]), float(M[1, 2])
                        # 采样层的位移换算回原始分辨率
                        k = 1.0 / scale_w
                        row.update(tx=round(tx * k, 2), ty=round(ty * k, 2),
                                   rot=round(rot, 3), sc=round(sc, 5),
                                   inl=round(float(inl.mean()) if inl is not None else 0.0, 3))
                        row["dx_frac"] = round(float(np.hypot(tx, ty)) / 640.0, 5)
        rows.append(row)
        prev, prev_sig = gray, sig
        idx += step

    with open(a.out, "w", newline="", encoding="utf-8") as f:
        wr = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        wr.writeheader()
        wr.writerows(rows)
    print("逐点数据 -> %s（%d 行）" % (a.out, len(rows)))

    # 0.5s 聚合
    print("\n时间窗   位移累积(%宽)  缩放累积   旋转累积  硬切分   内点率  匹配数")
    bin_n = max(1, int(round(0.5 * a.fps)))
    for s in range(0, len(rows), bin_n):
        chunk = rows[s:s + bin_n]
        dx = sum(r["dx_frac"] for r in chunk) * 100
        ds = sum(abs(np.log(max(r["sc"], 1e-6))) for r in chunk) * 100
        dr = sum(abs(r["rot"]) for r in chunk)
        cut = max(r["hist_l1"] for r in chunk)
        inl = float(np.mean([r["inl"] for r in chunk]))
        mt = int(np.mean([r["match"] for r in chunk]))
        print("%5.1f–%-5.1f %12.2f %11.2f %9.1f %7.3f %7.2f %6d"
              % (chunk[0]["t"], chunk[-1]["t"] + 1.0 / a.fps, dx, ds, dr, cut, inl, mt))
    cap.release()


if __name__ == "__main__":
    main()
