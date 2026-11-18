"""Circle14 镜头运动估计：ORB + 仿射，逐帧估计缩放与平移，按段汇总。

用法：python Log/Circle14/Tool/motion.py <mp4> [段边界,逗号分隔,含0与末帧]
例：  python Log/Circle14/Tool/motion.py x.mp4 0,50,86,105,123
"""
import sys

import cv2
import numpy as np

sys.stdout.reconfigure(encoding="utf-8")


def main() -> int:
    src = sys.argv[1]
    cuts = [int(x) for x in sys.argv[2].split(",")] if len(sys.argv) > 2 else None
    cut_set = set(cuts or [])

    cap = cv2.VideoCapture(src)
    fps = cap.get(cv2.CAP_PROP_FPS) or 24.0
    frames = []
    while True:
        ok, fr = cap.read()
        if not ok:
            break
        frames.append(cv2.cvtColor(fr, cv2.COLOR_BGR2GRAY))
    cap.release()
    n = len(frames)
    print("FRAMES", n, "FPS", round(fps, 3))

    orb = cv2.ORB_create(1200)
    steps = [(0, 1.0, 0.0, 0.0)]
    for i in range(1, n):
        k1, d1 = orb.detectAndCompute(frames[i - 1], None)
        k2, d2 = orb.detectAndCompute(frames[i], None)
        if d1 is None or d2 is None or len(k1) < 8 or len(k2) < 8:
            steps.append((i, 1.0, 0.0, 0.0))
            continue
        bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
        m = sorted(bf.match(d1, d2), key=lambda x: x.distance)[:200]
        if len(m) < 8:
            steps.append((i, 1.0, 0.0, 0.0))
            continue
        p1 = np.float32([k1[x.queryIdx].pt for x in m]).reshape(-1, 1, 2)
        p2 = np.float32([k2[x.trainIdx].pt for x in m]).reshape(-1, 1, 2)
        mat, _ = cv2.estimateAffinePartial2D(p1, p2, method=cv2.RANSAC)
        if mat is None:
            steps.append((i, 1.0, 0.0, 0.0))
            continue
        s = float(np.hypot(mat[0, 0], mat[0, 1]))
        steps.append((i, s, float(mat[0, 2]), float(mat[1, 2])))

    def summarize(a, b, label):
        # 跳过硬切那一帧的估计（相邻帧不同镜头，仿射无意义），逐帧缩放裁剪到 ±2% 后再取中位数
        chunk = [c for c in steps[a + 1:b + 1] if c[0] not in cut_set]
        if not chunk:
            return
        raw = [c[1] for c in chunk]
        scales = [min(max(s, 0.98), 1.02) for s in raw]
        med = float(np.median(scales))
        total = med ** len(scales)
        dx = sum(c[2] for c in chunk)
        dy = sum(c[3] for c in chunk)
        print("%-14s f%3d-f%3d  n=%2d  中位每帧=%+.3f%%  累计=%+.2f%%  dx=%+.1fpx dy=%+.1fpx" % (
            label, a, b, len(scales), (med - 1) * 100, (total - 1) * 100, dx, dy))

    if cuts:
        for a, b in zip(cuts, cuts[1:]):
            summarize(a, b, "段 %d-%d" % (a, b))
    else:
        for a in range(0, n - 1, 10):
            summarize(a, min(a + 9, n - 1), "bin %d" % a)
    return 0


if __name__ == "__main__":
    sys.exit(main())
