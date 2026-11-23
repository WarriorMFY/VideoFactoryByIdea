"""首尾帧通道 · 度量：输出首/末帧 vs 两张锚图，出 NCC + SSIM（自实现，无 skimage 依赖）

用法：python measure.py --video out.mp4 --first A.png --last B.png [--json metrics.json]

判读（沿用 pixel-anchor 的尺度）：
  ≥0.93  锁住
  0.80~0.93 大体对齐但已被重画
  <0.80  只是语义相似
交叉项（首×尾锚 / 末×首锚）必须低，否则说明首尾串了。
"""
import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))


def find_repo_root(start):
    cur = start
    for _ in range(8):
        if os.path.isdir(os.path.join(cur, "Tool", "_deps")):
            return cur
        parent = os.path.dirname(cur)
        if parent == cur:
            break
        cur = parent
    return None


ROOT = find_repo_root(HERE)
if ROOT:
    sys.path.insert(0, os.path.join(ROOT, "Tool", "_deps"))

import cv2  # noqa: E402
import numpy as np  # noqa: E402


def load(p):
    im = cv2.imdecode(np.fromfile(p, dtype=np.uint8), cv2.IMREAD_COLOR)
    if im is None:
        raise SystemExit(f"cannot read {p}")
    return im


def center_crop_ratio(im, ratio):
    h, w = im.shape[:2]
    if w / h > ratio:
        nw = int(round(h * ratio)); x = (w - nw) // 2
        return im[:, x:x + nw]
    nh = int(round(w / ratio)); y = (h - nh) // 2
    return im[y:y + nh, :]


def ncc(a, b):
    g1 = cv2.cvtColor(a, cv2.COLOR_BGR2GRAY).astype(np.float32)
    g2 = cv2.cvtColor(b, cv2.COLOR_BGR2GRAY).astype(np.float32)
    g1 -= g1.mean(); g2 -= g2.mean()
    den = np.sqrt((g1 ** 2).sum() * (g2 ** 2).sum())
    return float((g1 * g2).sum() / den) if den else 0.0


def ssim(a, b):
    g1 = cv2.cvtColor(a, cv2.COLOR_BGR2GRAY).astype(np.float64)
    g2 = cv2.cvtColor(b, cv2.COLOR_BGR2GRAY).astype(np.float64)
    C1, C2 = (0.01 * 255) ** 2, (0.03 * 255) ** 2
    k = (11, 11)
    mu1 = cv2.GaussianBlur(g1, k, 1.5); mu2 = cv2.GaussianBlur(g2, k, 1.5)
    s1 = cv2.GaussianBlur(g1 * g1, k, 1.5) - mu1 * mu1
    s2 = cv2.GaussianBlur(g2 * g2, k, 1.5) - mu2 * mu2
    s12 = cv2.GaussianBlur(g1 * g2, k, 1.5) - mu1 * mu2
    num = (2 * mu1 * mu2 + C1) * (2 * s12 + C2)
    den = (mu1 ** 2 + mu2 ** 2 + C1) * (s1 + s2 + C2)
    return float(np.mean(num / den))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", required=True)
    ap.add_argument("--first", required=True, help="意图中的首帧锚")
    ap.add_argument("--last", required=True, help="意图中的尾帧锚")
    ap.add_argument("--json", default=None)
    args = ap.parse_args()

    cap = cv2.VideoCapture(args.video)
    n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)); h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap.set(cv2.CAP_PROP_POS_FRAMES, 0); ok1, f_first = cap.read()
    cap.set(cv2.CAP_PROP_POS_FRAMES, max(0, n - 1)); ok2, f_last = cap.read()
    cap.release()
    print(f"video: {w}x{h}, frames={n}, read_first={ok1}, read_last={ok2}")

    a_first, a_last = load(args.first), load(args.last)
    size = (w, h)
    ratio = w / h
    variants = {
        "resize": lambda im: cv2.resize(im, size, interpolation=cv2.INTER_AREA),
        "crop": lambda im: cv2.resize(center_crop_ratio(im, ratio), size, interpolation=cv2.INTER_AREA),
    }

    res = {}
    for name, fn in variants.items():
        r1, r2 = fn(a_first), fn(a_last)
        res[name] = {
            "first_vs_first": [round(ncc(f_first, r1), 4), round(ssim(f_first, r1), 4)],
            "first_vs_last": [round(ncc(f_first, r2), 4), round(ssim(f_first, r2), 4)],
            "last_vs_first": [round(ncc(f_last, r1), 4), round(ssim(f_last, r1), 4)],
            "last_vs_last": [round(ncc(f_last, r2), 4), round(ssim(f_last, r2), 4)],
        }

    out = {"video": {"w": w, "h": h, "frames": n}, "metrics": res}
    print(json.dumps(out, ensure_ascii=False, indent=1))

    outdir = os.path.dirname(os.path.abspath(args.video))
    cv2.imwrite(os.path.join(outdir, "_first.png"), f_first)
    cv2.imwrite(os.path.join(outdir, "_last.png"), f_last)
    if args.json:
        with open(args.json, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=1)
    print("saved _first.png / _last.png")


if __name__ == "__main__":
    main()
