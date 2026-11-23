# -*- coding: utf-8 -*-
"""双图探针度量：场景保持度 = 出图 vs 空间锚 的 SSIM（PIL 读图，避 cv2 中文路径坑）。
SSIM 公式与 flux3-edit/scripts/measure.py 一致（高斯窗 11x11 sigma 1.5）。
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image

C = Path(r"d:\Data\QoderWorkArea\CardVideoMethod\Log\Circle28")
REF = C / "space" / "space-anchor-locked.png"
REF_K1 = C / "frames" / "K1-locked.png"

CASES = [
    ("P0-双图 out_1", C / "frames-dual/runs/P0-双图/out_1.png"),
    ("P0-双图 out_2", C / "frames-dual/runs/P0-双图/out_2.png"),
    ("K1b-门口跨出 out_1", C / "frames-dual/runs/K1b-门口跨出/out_1.png"),
    ("K1b-门口跨出 out_2", C / "frames-dual/runs/K1b-门口跨出/out_2.png"),
    ("K2b-单图抬头(漂移)", C / "frames/runs/K2b-近景抬头/out_1.png"),
    ("K2c-双图 out_1", C / "frames-dual/runs/K2c-双图抬头/out_1.png"),
    ("K2c-双图 out_2", C / "frames-dual/runs/K2c-双图抬头/out_2.png"),
    ("K1-单图 out_1", C / "frames/runs/K1-中景提灯/out_1.png"),
    ("K2-单图 out_1", C / "frames/runs/K2-近景望雨2/out_1.png"),
]


def gray(im: Image.Image, size) -> np.ndarray:
    return np.asarray(im.convert("L").resize(size, Image.LANCZOS), dtype=np.float64)


def gauss(x, k=11, s=1.5):
    """可分离高斯模糊。"""
    r = k // 2
    t = np.arange(-r, r + 1, dtype=np.float64)
    g = np.exp(-(t ** 2) / (2 * s * s))
    g /= g.sum()
    out = np.apply_along_axis(lambda m: np.convolve(m, g, mode="same"), 0, x)
    return np.apply_along_axis(lambda m: np.convolve(m, g, mode="same"), 1, out)


def ssim(a, b):
    C1, C2 = (0.01 * 255) ** 2, (0.03 * 255) ** 2
    mu_a, mu_b = gauss(a), gauss(b)
    sa = gauss(a * a) - mu_a ** 2
    sb = gauss(b * b) - mu_b ** 2
    sab = gauss(a * b) - mu_a * mu_b
    num = (2 * mu_a * mu_b + C1) * (2 * sab + C2)
    den = (mu_a ** 2 + mu_b ** 2 + C1) * (sa + sb + C2)
    return float((num / den).mean())


def sharp(x):
    lap = np.gradient(np.gradient(x, axis=0), axis=0) + np.gradient(np.gradient(x, axis=1), axis=1)
    return float(lap.var())


ref_im = Image.open(REF)
size = (ref_im.width // 2, ref_im.height // 2)  # 半分辨率保速度
ref = gray(ref_im, size)
ref_k1_im = Image.open(REF_K1)
k1_size = (ref_k1_im.width // 2, ref_k1_im.height // 2)
ref_k1 = gray(ref_k1_im, k1_size)
print(f"ref={REF.name} {ref_im.size} sharp={sharp(ref):.1f}")

rows = []
for name, p in CASES:
    im = Image.open(p)
    g = gray(im, size)
    g1 = gray(im, k1_size)
    row = {"case": name, "size": f"{im.width}x{im.height}",
           "ssim_vs_space": round(ssim(ref, g), 4),
           "ssim_vs_k1": round(ssim(ref_k1, g1), 4),
           "sharp": round(sharp(g), 1)}
    rows.append(row)
    print(row)

out = C / "frames-dual" / "metrics-dual.json"
out.write_text(json.dumps({"ref": REF.name, "runs": rows}, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"-> {out}")
