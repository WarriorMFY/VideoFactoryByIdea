"""副实验 A 体检：v2-a / v2-b 跨片一致性 + 对原卡两张静态样张的基线。

口径与父目录 consistency.py 完全一致（Haar 眼级联 → 瞳孔距归一 100px、眼线旋转归零 → 300×380 窗口 NCC）。

用法：python Log/Circle10/bare-portrait/measure.py
"""
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(ROOT / "Log" / "Circle10"))
sys.path.insert(0, str(ROOT / "Tool" / "_deps"))
sys.path.insert(0, str(ROOT / "Tool" / "_deps_cv4"))
import cv2
import numpy as np
from consistency import eye_pair, align, crop, score

OUT = HERE / "output"
RAG = ROOT / "RAG" / "portraits" / "figure-symmetric-cartographer"
VIDEOS = {"a": OUT / "v2-a.mp4", "b": OUT / "v2-b.mp4"}
STILLS = {"880": RAG / "01-pass-880x1184.png", "1086": RAG / "02-pass-1086x1448.png"}
TS = [0.0, 1.0, 2.0, 3.0, 4.0, 5.0]


def _crop_of(img):
    pair = eye_pair(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY))
    if pair is None:
        return None
    return crop(align(img, pair), pair)


def still(k):
    return _crop_of(cv2.imread(str(STILLS[k])))


def vid(path, t):
    cap = cv2.VideoCapture(str(path))
    cap.set(cv2.CAP_PROP_POS_FRAMES, int(round(t * cap.get(cv2.CAP_PROP_FPS))))
    ok, fr = cap.read()
    cap.release()
    return _crop_of(fr) if ok else None


def main():
    S = {}
    for k in STILLS:
        c = still(k)
        if c is not None:
            S[k] = c
    for k, p in VIDEOS.items():
        for t in TS:
            c = vid(p, t)
            if c is not None:
                S[f"{k}{t:.0f}"] = c

    keys = list(S)
    print("=== 眼位对齐 NCC ===")
    print("%-8s" % "" + "".join("%-8s" % k for k in keys))
    for a in keys:
        print("%-8s" % a + "".join("%-8.3f" % score(S[a], S[b]) for b in keys))

    tiles = []
    for k in keys:
        im = S[k].copy()
        cv2.putText(im, k, (8, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 255, 255), 2, cv2.LINE_AA)
        tiles.append(im)
    while len(tiles) % 6:
        tiles.append(np.full_like(tiles[0], 255))
    sheet = np.vstack([np.hstack(tiles[i:i + 6]) for i in range(0, len(tiles), 6)])
    p = OUT / "_bare_aligned.png"
    cv2.imwrite(str(p), sheet)
    print("SHEET", p, sheet.shape)

    # 逐帧运动/尺度统计
    for k, path in VIDEOS.items():
        if not path.exists():
            continue
        cap = cv2.VideoCapture(str(path))
        fps = cap.get(cv2.CAP_PROP_FPS)
        W = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)); H = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        prev, diffs, ipds, i = None, [], [], 0
        while True:
            ok, fr = cap.read()
            if not ok:
                break
            g = cv2.cvtColor(fr, cv2.COLOR_BGR2GRAY).astype(np.float32)
            if prev is not None:
                diffs.append(float(np.abs(g - prev).mean()))
            prev = g
            pair = eye_pair(g.astype(np.uint8))
            if pair is not None:
                (x1, y1, w1, h1), (x2, y2, w2, h2) = pair
                ipds.append(float(np.hypot(x2 + w2 / 2 - x1 - w1 / 2, y2 + h2 / 2 - y1 - h1 / 2)) / W)
            i += 1
        cap.release()
        print(f"\n{k}: {W}x{H} {i}帧 fps{fps:.1f}")
        if diffs:
            d = np.array(diffs)
            print("  逐帧差分 mean %.2f peak %.2f@%.2fs" % (d.mean(), d.max(), (d.argmax() + 1) / fps))
        if ipds:
            v = np.array(ipds)
            print("  瞳孔距/画幅 mean %.3f min %.3f max %.3f 极差 %.3f  (n=%d)" %
                  (v.mean(), v.min(), v.max(), v.max() - v.min(), len(v)))


if __name__ == "__main__":
    main()
