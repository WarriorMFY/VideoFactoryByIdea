"""跨镜一致性度量：风格（HSV 直方图相关）、场景（灰阶直方图相关）、角色（锈橙占比）。
零积分，只读本地产物。输出 consistency.json。"""
import json
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent
SHOTS = {"M1": ROOT / "video/runs/M1/out.mp4",
         "M2": ROOT / "video/runs/M2/out.mp4",
         "M3": ROOT / "video/runs/M3/out.mp4",
         "M4b": ROOT / "video/runs/M4b/out.mp4",
         "M5": ROOT / "video/runs/M5/out.mp4"}
ANCHOR = ROOT / "anchors/runs/A1-场景/out.png"
SIZE = (528, 304)


def imread_unicode(path):
    """cv2.imread 在 Windows 不支持非 ASCII 路径，绕道 np.fromfile。"""
    buf = np.fromfile(str(path), dtype=np.uint8)
    return cv2.imdecode(buf, cv2.IMREAD_COLOR)


def grab(path, idx):
    cap = cv2.VideoCapture(str(path))
    cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
    ok, fr = cap.read()
    cap.release()
    if not ok:
        raise RuntimeError(f"读不到 {path} 第 {idx} 帧")
    return cv2.resize(fr, SIZE, interpolation=cv2.INTER_AREA)


def hsv_corr(a, b):
    ha = cv2.cvtColor(a, cv2.COLOR_BGR2HSV)
    hb = cv2.cvtColor(b, cv2.COLOR_BGR2HSV)
    ga = cv2.calcHist([ha], [0, 1], None, [30, 32], [0, 180, 0, 256])
    gb = cv2.calcHist([hb], [0, 1], None, [30, 32], [0, 180, 0, 256])
    cv2.normalize(ga, ga); cv2.normalize(gb, gb)
    return float(cv2.compareHist(ga, gb, cv2.HISTCMP_CORREL))


def gray_corr(a, b):
    ga = cv2.cvtColor(a, cv2.COLOR_BGR2GRAY)
    gb = cv2.cvtColor(b, cv2.COLOR_BGR2GRAY)
    ha = cv2.calcHist([ga], [0], None, [64], [0, 256])
    hb = cv2.calcHist([gb], [0], None, [64], [0, 256])
    cv2.normalize(ha, ha); cv2.normalize(hb, hb)
    return float(cv2.compareHist(ha, hb, cv2.HISTCMP_CORREL))


def rust_ratio(img):
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    m = cv2.inRange(hsv, (5, 80, 60), (25, 255, 255))
    return float(m.mean() / 255.0)


def stats(img):
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    h, s, v = [float(x) for x in cv2.mean(hsv)[:3]]
    return {"hue": round(h, 1), "sat": round(s, 1), "val": round(v, 1),
            "rust": round(rust_ratio(img), 3)}


def main():
    a1 = cv2.resize(imread_unicode(ANCHOR), SIZE, interpolation=cv2.INTER_AREA)
    frames = {k: {"t0": grab(p, 0), "t60": grab(p, 60)} for k, p in SHOTS.items()}
    out = {"anchor_a1": stats(a1), "shots": {}, "pairs": {}}
    for k, fr in frames.items():
        out["shots"][k] = {"t0": stats(fr["t0"]), "t60": stats(fr["t60"]),
                           "hsv_corr_to_a1": round(hsv_corr(fr["t0"], a1), 3),
                           "gray_corr_to_a1": round(gray_corr(fr["t0"], a1), 3)}
    keys = list(frames)
    for i in range(len(keys)):
        for j in range(i + 1, len(keys)):
            a, b = keys[i], keys[j]
            out["pairs"][f"{a}-{b}"] = {
                "hsv_t0": round(hsv_corr(frames[a]["t0"], frames[b]["t0"]), 3),
                "hsv_t60": round(hsv_corr(frames[a]["t60"], frames[b]["t60"]), 3),
                "gray_t0": round(gray_corr(frames[a]["t0"], frames[b]["t0"]), 3),
                "rust_delta": round(abs(rust_ratio(frames[a]["t0"]) - rust_ratio(frames[b]["t0"])), 3),
            }
    (ROOT / "consistency.json").write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
