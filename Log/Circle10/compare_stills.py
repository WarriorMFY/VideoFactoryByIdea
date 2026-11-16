"""把原肖像卡的两张入库静态图拉进与视频帧同一套眼位对齐口径，出一张 6 格对比版。
用法：python Log/Circle10/compare_stills.py
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "Log" / "Circle10"))
sys.path.insert(0, str(ROOT / "Tool" / "_deps"))
sys.path.insert(0, str(ROOT / "Tool" / "_deps_cv4"))
import cv2
import numpy as np
from consistency import EYE, FACE, WIN, eye_pair, align, crop, score

OUT = ROOT / "Log" / "Circle10" / "output"
RAG = ROOT / "RAG" / "portraits" / "figure-symmetric-cartographer"
STILLS = {"still-880": RAG / "01-pass-880x1184.png", "still-1086": RAG / "02-pass-1086x1448.png"}
VIDEOS = {"a": OUT / "v1-a.mp4", "b": OUT / "v1-b.mp4"}
TS = [3.0, 5.0]


def from_still(path):
    img = cv2.imread(str(path))
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    pair = eye_pair(g)
    if pair is None:
        return None
    (x1, y1, w1, h1), (x2, y2, w2, h2) = pair
    c1 = np.array([x1 + w1 / 2, y1 + h1 / 2]); c2 = np.array([x2 + w2 / 2, y2 + h2 / 2])
    ipd = float(np.hypot(*(c2 - c1)))
    return {"crop": crop(align(img, pair), pair), "ipd_px": ipd,
            "ipd_frac": ipd / img.shape[1], "size": img.shape[1::-1]}


def from_video(path, t):
    cap = cv2.VideoCapture(str(path))
    fps = cap.get(cv2.CAP_PROP_FPS)
    idx = int(round(t * fps))
    cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
    ok, fr = cap.read()
    cap.release()
    if not ok:
        return None
    pair = eye_pair(cv2.cvtColor(fr, cv2.COLOR_BGR2GRAY))
    if pair is None:
        return None
    (x1, y1, w1, h1), (x2, y2, w2, h2) = pair
    c1 = np.array([x1 + w1 / 2, y1 + h1 / 2]); c2 = np.array([x2 + w2 / 2, y2 + h2 / 2])
    ipd = float(np.hypot(*(c2 - c1)))
    return {"crop": crop(align(fr, pair), pair), "ipd_px": ipd, "ipd_frac": ipd / fr.shape[1]}


def main():
    S = {}
    for k, p in STILLS.items():
        r = from_still(p)
        print(f"{k}: {'OK' if r else 'NO EYES'}  {p.name}")
        if r:
            S[k] = r
    for k, p in VIDEOS.items():
        for t in TS:
            r = from_video(p, t)
            if r:
                S[f"{k}{t:.0f}s"] = r

    keys = list(S)
    print("\n=== 眼位对齐 NCC（同一套对齐、同一窗口 300x380）===")
    print("%-12s" % "" + "".join("%-11s" % k for k in keys))
    for a in keys:
        row = "%-12s" % a
        for b in keys:
            row += "%-11.3f" % score(S[a]["crop"], S[b]["crop"])
        print(row)

    tiles = []
    for k in keys:
        im = S[k]["crop"].copy()
        cv2.putText(im, k, (8, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2, cv2.LINE_AA)
        tiles.append(im)
    while len(tiles) % 6:
        tiles.append(np.full_like(tiles[0], 255))
    sheet = np.vstack([np.hstack(tiles[i:i + 6]) for i in range(0, len(tiles), 6)])
    p = OUT / "_still-vs-video_aligned.png"
    cv2.imwrite(str(p), sheet)
    print("\nSHEET", p, sheet.shape)

    # 原始画幅缩略（不做对齐，保留各自取景）
    thumbs = []
    for k, path in list(STILLS.items()) + [(f"{k}{t:.0f}s", VIDEOS[k]) for k in VIDEOS for t in TS]:
        if isinstance(path, Path) and path.suffix == ".png":
            im = cv2.imread(str(path))
        else:
            cap = cv2.VideoCapture(str(path)); cap.set(cv2.CAP_PROP_POS_FRAMES, int(round(3.0 * cap.get(cv2.CAP_PROP_FPS))))
            ok, im = cap.read(); cap.release()
        h = 420
        im = cv2.resize(im, (int(im.shape[1] * h / im.shape[0]), h), interpolation=cv2.INTER_AREA)
        cv2.putText(im, k, (8, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2, cv2.LINE_AA)
        thumbs.append(im)
    hmax = max(t.shape[0] for t in thumbs)
    thumbs = [cv2.copyMakeBorder(t, 0, hmax - t.shape[0], 0, 0, cv2.BORDER_CONSTANT, value=(255, 255, 255)) for t in thumbs]
    cv2.imwrite(str(OUT / "_still-vs-video_raw.png"), np.hstack(thumbs))
    print("RAW", OUT / "_still-vs-video_raw.png")


if __name__ == "__main__":
    main()
