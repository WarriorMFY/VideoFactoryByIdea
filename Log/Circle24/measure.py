"""Circle24 对照度量：风格保真 vs 长相改动量。

三个数：
  ssim_all  全图结构相似（缩到同尺寸）—— 风格/构图有没有漂
  face_diff 中央人脸区归一化差异 —— 长相改了多少
  sharp     拉普拉斯方差 —— 有没有磨皮/锐化
"""
import json
import sys
from pathlib import Path

import cv2
import numpy as np


def load(p):
    img = cv2.imread(str(p))
    if img is None:
        sys.exit(f"读不到 {p}")
    return img


def ssim(a, b):
    """简化版 SSIM（高斯窗，单通道）。"""
    ga = cv2.cvtColor(a, cv2.COLOR_BGR2GRAY).astype(np.float64)
    gb = cv2.cvtColor(b, cv2.COLOR_BGR2GRAY).astype(np.float64)
    C1, C2 = (0.01 * 255) ** 2, (0.03 * 255) ** 2
    mu_a = cv2.GaussianBlur(ga, (11, 11), 1.5)
    mu_b = cv2.GaussianBlur(gb, (11, 11), 1.5)
    sa = cv2.GaussianBlur(ga * ga, (11, 11), 1.5) - mu_a ** 2
    sb = cv2.GaussianBlur(gb * gb, (11, 11), 1.5) - mu_b ** 2
    sab = cv2.GaussianBlur(ga * gb, (11, 11), 1.5) - mu_a * mu_b
    num = (2 * mu_a * mu_b + C1) * (2 * sab + C2)
    den = (mu_a ** 2 + mu_b ** 2 + C1) * (sa + sb + C2)
    return float((num / den).mean())


def face_box(img):
    """粗略人脸框：取画面中部 54%×72% 的区域（这张图是这样构图的）。"""
    h, w = img.shape[:2]
    return int(w * 0.23), int(h * 0.22), int(w * 0.77), int(h * 0.94)


def main():
    ref_p = Path(sys.argv[1])
    ref = load(ref_p)
    rows = []
    for p in sys.argv[2:]:
        img = load(p)
        H, W = ref.shape[:2]
        f = cv2.resize(img, (W, H), interpolation=cv2.INTER_AREA)
        x1, y1, x2, y2 = face_box(ref)
        rf = ref[y1:y2, x1:x2].astype(np.float32)
        gf = f[y1:y2, x1:x2].astype(np.float32)
        diff = float(np.abs(cv2.cvtColor(rf, cv2.COLOR_BGR2GRAY) -
                            cv2.cvtColor(gf, cv2.COLOR_BGR2GRAY)).mean())
        sharp = float(cv2.Laplacian(cv2.cvtColor(f, cv2.COLOR_BGR2GRAY), cv2.CV_64F).var())
        rows.append({
            "file": Path(p).name,
            "size": f"{img.shape[1]}x{img.shape[0]}",
            "ssim_all": round(ssim(ref, f), 4),
            "face_diff": round(diff, 2),
            "sharp": round(sharp, 1),
        })
    out = {"ref": ref_p.name,
           "ref_size": f"{ref.shape[1]}x{ref.shape[0]}",
           "ref_sharp": round(float(cv2.Laplacian(cv2.cvtColor(ref, cv2.COLOR_BGR2GRAY), cv2.CV_64F).var()), 1),
           "runs": rows}
    print(json.dumps(out, ensure_ascii=False, indent=1))
    (ref_p.parent.parent / "metrics.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
