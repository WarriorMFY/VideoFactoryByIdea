"""首尾「状态锚定」策略的度量：不是咬合，是「画风/天光有没有漂 + 布局动了多少」。

    python measure-anchor.py Log/Circle26/anchor/in/A.png <out_1.png> <out_2.png>

输出到与出图同目录的 anchor-metrics.json。

四个数：
  ssim_vs_A   与首帧的结构相似（跨机位必然低，只作「动了多少」的参考，不作及格线）
  ssim_vs_B   与用户给定尾帧的结构相似（只看落点构图有没有靠近，不强求）
  dL / dS     亮度均值、HSV 饱和度均值相对首帧的差（天光与矿物色有没有漂）
  mist        亮且低饱和像素占比（薄雾/留白有多少，古画风的呼吸空间）
  sharp       拉普拉斯方差（比首帧掉多少 = 放大/磨掉多少笔触）
"""
import json
import sys
from pathlib import Path

import cv2
import numpy as np


def imread_u(p):
    """Windows 下 cv2.imread 不认非 ASCII 路径，统一走 fromfile 解码。"""
    buf = np.fromfile(str(p), dtype=np.uint8)
    img = cv2.imdecode(buf, cv2.IMREAD_COLOR) if buf.size else None
    if img is None:
        sys.exit(f"读不到 {p}")
    return img


def ssim(a, b):
    """简化版 SSIM（高斯窗，单通道）；b 先缩到 a 的尺寸。"""
    b = cv2.resize(b, (a.shape[1], a.shape[0]), interpolation=cv2.INTER_AREA)
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


def lum(img):
    return float(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).mean())


def sat(img):
    return float(cv2.cvtColor(img, cv2.COLOR_BGR2HSV)[:, :, 1].mean())


def mist_frac(img):
    """亮且低饱和 = 雾/留白。阈值取 V>170 且 S<40（HSV 的 S 是 0-255）。"""
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    m = (hsv[:, :, 2] > 170) & (hsv[:, :, 1] < 40)
    return float(m.mean())


def sharp(img):
    return float(cv2.Laplacian(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), cv2.CV_64F).var())


def stat(img, ref, given):
    return {
        "size": f"{img.shape[1]}x{img.shape[0]}",
        "ssim_vs_A": round(ssim(ref, img), 4),
        "ssim_vs_B": round(ssim(given, img), 4) if given is not None else None,
        "L": round(lum(img), 1),
        "S": round(sat(img), 1),
        "mist": round(mist_frac(img), 3),
        "sharp": round(sharp(img), 1),
    }


def main() -> int:
    if len(sys.argv) < 3:
        sys.exit("用法：measure-anchor.py <首帧> <出图...> [--given 尾帧]")
    argv = sys.argv[1:]
    given = None
    if "--given" in argv:
        i = argv.index("--given")
        given = imread_u(argv[i + 1])
        argv = argv[:i] + argv[i + 2:]
    ref_p = Path(argv[0])
    ref = imread_u(ref_p)
    outs = [Path(p) for p in argv[1:]]
    base = stat(ref, ref, given)
    rows = [{"file": ref_p.name, **base, "role": "首帧(锚)"}]
    for p in outs:
        rows.append({"file": p.name, **stat(imread_u(p), ref, given), "role": "出图"})
    out = {
        "ref": ref_p.name,
        "L_drift": {r["file"]: round(r["L"] - base["L"], 1) for r in rows[1:]},
        "S_drift": {r["file"]: round(r["S"] - base["S"], 1) for r in rows[1:]},
        "rows": rows,
    }
    dst = outs[0].parent / "anchor-metrics.json"
    dst.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(out, ensure_ascii=False, indent=1))
    print(f"\n[measure-anchor] -> {dst}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
