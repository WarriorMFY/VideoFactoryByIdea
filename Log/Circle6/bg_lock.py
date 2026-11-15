"""背景锁定度量化：比较不同视频首帧的「背景区」相似度。

目的（Circle6 验证问题 3）：场景卡是否把「背景与风格轮间随机」压成稳定。
做法：取 0.0s 首帧，裁画面顶部背景带（去掉人物主体），统一缩放后比较：
  - 结构相关 Pearson（灰度 96x48，零均值归一化）
  - 色彩直方图相交（HSV H+S 二维）
同组内两两平均 = 该组的背景一致性。组内越高，说明背景越被锁住。

用法：
  python Log/Circle6/bg_lock.py --case pair1 pair2 --base b1 b2 b3
"""
import argparse
import itertools
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "Tool" / "_deps"))
import cv2
import numpy as np

CANDIDATES = {
    "pair1": ROOT / "Log" / "Circle6" / "output" / "pair-1.mp4",
    "pair2": ROOT / "Log" / "Circle6" / "output" / "pair-2.mp4",
    "bamboo1": ROOT / "Log" / "Circle6" / "output" / "bamboo-1.mp4",
    "b1": ROOT / "Log" / "Circle4" / "output" / "l4-cs5-b1.mp4",
    "b2": ROOT / "Log" / "Circle4" / "output" / "l4-cs5-b2.mp4",
    "b3": ROOT / "Log" / "Circle4" / "output" / "l4-cs5-b3.mp4",
}


def bg_band(video: Path):
    cap = cv2.VideoCapture(str(video))
    ok, fr = cap.read()
    cap.release()
    if not ok:
        raise SystemExit("读不到首帧: %s" % video)
    h, w = fr.shape[:2]
    band = fr[0:int(h * 0.30), :]  # 顶部 30%：天空/断墙/枯草，通常不含人物躯干
    return band, (w, h)


def feats(band):
    g = cv2.cvtColor(band, cv2.COLOR_BGR2GRAY)
    g = cv2.resize(g, (96, 48), interpolation=cv2.INTER_AREA).astype(np.float32)
    g = (g - g.mean()) / (g.std() + 1e-6)
    hsv = cv2.cvtColor(band, cv2.COLOR_BGR2HSV)
    hist = cv2.calcHist([hsv], [0, 1], None, [32, 8], [0, 180, 0, 256])
    hist = cv2.normalize(hist, hist).flatten()
    return g, hist


def corr(a, b):
    return float((a * b).mean())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--case", nargs="+", default=["pair1", "pair2"])
    ap.add_argument("--base", nargs="+", default=["b1", "b2", "b3"])
    a = ap.parse_args()

    data = {}
    for k in a.case + a.base:
        band, wh = bg_band(CANDIDATES[k])
        data[k] = feats(band) + (wh,)
        print("LOAD", k, CANDIDATES[k].name, "size", wh)

    def pair_stats(keys):
        vals_s, vals_h = [], []
        for x, y in itertools.combinations(keys, 2):
            vals_s.append(corr(data[x][0], data[y][0]))
            vals_h.append(cv2.compareHist(data[x][1], data[y][1], cv2.HISTCMP_CORREL))
        return vals_s, vals_h

    cs, ch = pair_stats(a.case)
    bs, bh = pair_stats(a.base)

    print("\n=== 组内两两相似度（越高越一致，1.0 = 完全一致） ===")
    print("场景卡组 %s：结构 %.3f–%.3f（均值 %.3f）｜色彩 %.3f–%.3f（均值 %.3f）" % (
        "/".join(a.case), min(cs), max(cs), np.mean(cs), min(ch), max(ch), np.mean(ch)))
    print("无场景卡基线 %s：结构 %.3f–%.3f（均值 %.3f）｜色彩 %.3f–%.3f（均值 %.3f）" % (
        "/".join(a.base), min(bs), max(bs), np.mean(bs), min(bh), max(bh), np.mean(bh)))
    print("\n结构增益 %+.3f｜色彩增益 %+.3f" % (np.mean(cs) - np.mean(bs), np.mean(ch) - np.mean(bh)))

    print("\n=== 逐对明细 ===")
    for keys, tag in ((a.case, "场景卡"), (a.base, "基线")):
        for x, y in itertools.combinations(keys, 2):
            print("%s %s-%s 结构 %.3f 色彩 %.3f" % (
                tag, x, y, corr(data[x][0], data[y][0]),
                cv2.compareHist(data[x][1], data[y][1], cv2.HISTCMP_CORREL)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
