"""把尾帧的色阶压回首帧 —— 结构用新的，颜色回到旧的。

为什么：图生图重排机位时，Flux 会顺手把画面提亮、把矿物色洗淡（实测 S 掉 60+、L 涨 33）。
首尾帧生视频时模型会在这两个色阶之间线性过渡，整镜就"褪色"了。
所以尾帧只当结构用，色阶在事后按首帧的统计重新贴一遍，零积分、可复现。

    python grade.py <首帧> <尾帧> [-o 出图] [--alpha 1.0]

做三件事：
  1) Lab 的 L 通道：均值/标准差匹配到首帧（暗部重新压沉、高光收回）
  2) a/b 通道：围绕 128 按 k 缩放，k 二分到 HSV 饱和度均值 = 首帧
  3) 输出上/中/下三段亮度，确认"天比山亮、山比地暗"的结构没被校反
"""
import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np


def imread_u(p):
    buf = np.fromfile(str(p), dtype=np.uint8)
    img = cv2.imdecode(buf, cv2.IMREAD_COLOR) if buf.size else None
    if img is None:
        sys.exit(f"读不到 {p}")
    return img


def imwrite_u(p, img):
    ok, buf = cv2.imencode(Path(p).suffix or ".png", img)
    if not ok:
        sys.exit(f"写不出 {p}")
    Path(p).write_bytes(buf.tobytes())


def lum(img):
    return float(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).mean())


def sat(img):
    return float(cv2.cvtColor(img, cv2.COLOR_BGR2HSV)[:, :, 1].mean())


def bands(img):
    h = img.shape[0]
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    return [round(float(g[i * h // 3:(i + 1) * h // 3].mean()), 1) for i in range(3)]


def match_channel(src, ref, alpha):
    """单通道均值/标准差匹配，alpha 控制力度。"""
    m_s, s_s = float(src.mean()), float(src.std()) or 1.0
    m_r, s_r = float(ref.mean()), float(ref.std())
    return src * (1 - alpha) + ((src - m_s) * (s_r / s_s) + m_r) * alpha


def grade_lab(ref, img, alpha=1.0):
    """Reinhard：L/a/b 三通道各自均值-标准差匹配。色相分布整体搬过去，不做统一提饱和。"""
    lab_r = cv2.cvtColor(ref, cv2.COLOR_BGR2LAB).astype(np.float32)
    lab_i = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)
    for c in range(3):
        lab_i[:, :, c] = match_channel(lab_i[:, :, c], lab_r[:, :, c], alpha)
    out = cv2.cvtColor(np.clip(lab_i, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR)
    return out, {"mode": "lab"}


def grade(ref, img, alpha=1.0):
    """alpha=1 全量对齐，0 原样；中间值按比例混。"""
    lab_r = cv2.cvtColor(ref, cv2.COLOR_BGR2LAB).astype(np.float32)
    lab_i = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)

    # 1) L：均值/标准差匹配
    Lr, Li = lab_r[:, :, 0], lab_i[:, :, 0]
    tgt_mean, tgt_std = float(Lr.mean()), float(Lr.std())
    src_mean, src_std = float(Li.mean()), float(Li.std()) or 1.0
    L_new = (Li - src_mean) * (tgt_std / src_std) + tgt_mean
    lab_i[:, :, 0] = Li * (1 - alpha) + L_new * alpha
    out = cv2.cvtColor(np.clip(lab_i, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR)

    # 2) 饱和度：二分 k
    tgt_s = sat(ref)
    lab0 = cv2.cvtColor(out, cv2.COLOR_BGR2LAB).astype(np.float32)
    lo, hi = 0.3, 4.0
    best, best_d = out, abs(sat(out) - tgt_s)
    for _ in range(12):
        k = (lo + hi) / 2
        t = lab0.copy()
        t[:, :, 1:] = np.clip((t[:, :, 1:] - 128) * k + 128, 0, 255)
        cand = cv2.cvtColor(t.astype(np.uint8), cv2.COLOR_LAB2BGR)
        d = abs(sat(cand) - tgt_s)
        if d < best_d:
            best, best_d = cand, d
        if sat(cand) < tgt_s:
            lo = k
        else:
            hi = k
    if alpha < 1:
        best = cv2.addWeighted(out, 1 - alpha, best, alpha, 0)
    return best, {"k_sat": round(k, 3), "sat_target": round(tgt_s, 1)}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("ref")
    ap.add_argument("src")
    ap.add_argument("-o", "--out", default=None)
    ap.add_argument("--alpha", type=float, default=1.0)
    ap.add_argument("--mode", choices=["sat", "lab"], default="sat",
                    help="sat=压亮度后提饱和到首帧；lab=Lab 三通道整体对齐（色相分布搬过去）")
    a = ap.parse_args()

    ref, src = imread_u(a.ref), imread_u(a.src)
    if a.mode == "lab":
        out, info = grade_lab(ref, src, a.alpha)
    else:
        out, info = grade(ref, src, a.alpha)
    dst = Path(a.out) if a.out else Path(a.src).with_name(Path(a.src).stem + "-graded.png")
    imwrite_u(dst, out)

    rec = {
        "ref": str(a.ref), "src": str(a.src), "out": str(dst), "alpha": a.alpha,
        "before": {"L": round(lum(src), 1), "S": round(sat(src), 1), "bands": bands(src)},
        "after": {"L": round(lum(out), 1), "S": round(sat(out), 1), "bands": bands(out)},
        "ref_stat": {"L": round(lum(ref), 1), "S": round(sat(ref), 1), "bands": bands(ref)},
        **info,
    }
    print(json.dumps(rec, ensure_ascii=False, indent=1))
    print(f"[grade] -> {dst}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
