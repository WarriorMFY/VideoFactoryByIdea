"""同一批图放一起量「写实度」的四个代理量，统一缩到同一宽度再算。

    python compare.py A.png B-given.png out_1.png out_1-Lab.png

写实 vs 平面，肉眼靠"云有没有体积、石头有没有切面、草是个体还是一片色"，
拆成数字是：
  sky_std   顶部 25% 的灰度标准差 —— 均匀雾≈5–10，体积云≈20–40
  hf        灰度拉普拉斯方差 —— 细节密度（统一宽度后才有可比性）
  p5p95     p5–p95 动态范围 —— 写实的明暗跨度更大
  dark      暗部（<60）占比 —— 写实背景的暗部更沉、更占面积
"""
import json
import sys
from pathlib import Path

import cv2
import numpy as np

W = 882  # 统一宽度，取首帧宽度
BAND = 1.2  # 限带用的高斯 σ（以统一宽度为基准，按原图宽度等比放大）


def imread_u(p):
    buf = np.fromfile(str(p), dtype=np.uint8)
    img = cv2.imdecode(buf, cv2.IMREAD_COLOR) if buf.size else None
    if img is None:
        sys.exit(f"读不到 {p}")
    return img


def norm(img):
    """先按比例做高斯限带，再缩到统一宽度。

    不这么做的话，1920 宽的出图被缩掉 2.2 倍、878 宽的参考图几乎原样，
    hf / sky_std 会系统性偏向分辨率低的那张，写实度就成了分辨率的代理。
    """
    sigma = BAND * img.shape[1] / W
    if sigma > 0.3:
        img = cv2.GaussianBlur(img, (0, 0), sigma)
    h = round(img.shape[0] * W / img.shape[1])
    return cv2.resize(img, (W, h), interpolation=cv2.INTER_AREA)


def stat(p):
    img = norm(imread_u(p))
    g8 = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    g = g8.astype(np.float32)
    h = g.shape[0]
    sky = g[: int(h * 0.25)]
    lo, hi = np.percentile(g, 5), np.percentile(g, 95)
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    return {
        "file": Path(p).name,
        "sky_std": round(float(sky.std()), 1),
        "hf": round(float(cv2.Laplacian(g8, cv2.CV_64F).var()), 1),
        "p5p95": f"{lo:.0f}-{hi:.0f}",
        "range": round(float(hi - lo), 1),
        "dark": round(float((g < 60).mean()), 3),
        "L": round(float(g.mean()), 1),
        "S": round(float(hsv[:, :, 1].mean()), 1),
    }


def main() -> int:
    if len(sys.argv) < 2:
        sys.exit("用法：compare.py <图...>")
    rows = [stat(p) for p in sys.argv[1:]]
    keys = ["file", "sky_std", "hf", "range", "dark", "L", "S"]
    print(" | ".join(keys))
    for r in rows:
        print(" | ".join(str(r[k]) for k in keys))
    out = Path(sys.argv[1]).parent / "compare-writedegree.json"
    out.write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n[compare] -> {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
