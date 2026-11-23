"""Circle30 现场器材：空间锚候选的亮度/饱和/清晰度，与风格锚对比（core §2 同带 ±50%）。
"""
import json
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent  # Log/Circle30
RUN = ROOT / "space" / "runs" / "SP1b-留位"
ANCHOR = ROOT / "style" / "style-anchor-locked.png"


def imread_u(p):
    buf = np.fromfile(str(p), dtype=np.uint8)
    return cv2.imdecode(buf, cv2.IMREAD_COLOR) if buf.size else None


def stat(img):
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    return {
        "h": int(img.shape[0]),
        "w": int(img.shape[1]),
        "lap_var": round(float(cv2.Laplacian(g, cv2.CV_64F).var()), 1),
        "sat_mean": round(float(hsv[:, :, 1].mean()), 1),
        "val_mean": round(float(hsv[:, :, 2].mean()), 1),
    }


def main():
    a = stat(imread_u(ANCHOR))
    out = {"anchor": a, "candidates": {}}
    for p in sorted(RUN.glob("out_*.png")):
        s = stat(imread_u(p))
        s["lap_ratio"] = round(s["lap_var"] / a["lap_var"], 3)
        s["sat_ratio"] = round(s["sat_mean"] / a["sat_mean"], 3)
        s["band_ok"] = (0.5 <= s["lap_ratio"] <= 1.5) and (0.5 <= s["sat_ratio"] <= 1.5)
        out["candidates"][p.name] = s
    dst = RUN / "space-metrics.json"
    dst.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
