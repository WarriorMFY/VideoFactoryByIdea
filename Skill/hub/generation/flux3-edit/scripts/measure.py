"""flux3-edit 对照度量：保住了多少 / 改动了多少 / 有没有磨皮。

三个数：
  ssim_all   全图结构相似（缩到锚的尺寸）—— 构图、画风、物件有没有漂
  face_diff  人脸区灰度平均绝对差 —— 长相改了多少（越大改得越多）
  sharp      拉普拉斯方差 —— 磨皮（掉）还是锐化（涨）

    python measure.py --run Log/Circle24/runs/V1-五官
    python measure.py --ref a.png --face 0.23,0.22,0.77,0.94 b_1.png b_2.png
"""
import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np

DEFAULT_FACE = (0.23, 0.22, 0.77, 0.94)  # 相对比例；换构图必须改，否则 face_diff 无意义


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


def sharp(img) -> float:
    return float(cv2.Laplacian(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), cv2.CV_64F).var())


def face_absdiff(ref, img, box) -> float:
    h, w = ref.shape[:2]
    x1, y1, x2, y2 = int(w * box[0]), int(h * box[1]), int(w * box[2]), int(h * box[3])
    a = cv2.cvtColor(ref[y1:y2, x1:x2], cv2.COLOR_BGR2GRAY).astype(np.float32)
    b = cv2.cvtColor(img[y1:y2, x1:x2], cv2.COLOR_BGR2GRAY).astype(np.float32)
    return float(np.abs(a - b).mean())


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", default=None, help="跑次目录（读 run.json 拿锚与出图）")
    ap.add_argument("--ref", default=None, help="锚图；不给则用 run.json 的 ref")
    ap.add_argument("--face", default=None, help="人脸框 x1,y1,x2,y2 相对比例")
    ap.add_argument("files", nargs="*", help="要度量的图（不给则取 run 目录下 out_*.png）")
    a = ap.parse_args()

    if a.face:
        box = tuple(float(v) for v in a.face.split(","))
        if len(box) != 4:
            sys.exit("--face 需要 4 个相对比例，如 0.23,0.22,0.77,0.94")
    else:
        box = DEFAULT_FACE

    if a.run:
        run_dir = Path(a.run).resolve()
        rj = run_dir / "run.json"
        if not rj.exists():
            sys.exit(f"缺 run.json：{rj}")
        rec = json.loads(rj.read_text(encoding="utf-8"))
        ref_p = Path(a.ref).resolve() if a.ref else Path(rec["ref"])
        files = [Path(f) for f in a.files] or sorted(run_dir.glob("out*.png"))
        out_p = run_dir / "metrics.json"
    else:
        if not a.ref or not a.files:
            sys.exit("要么给 --run，要么给 --ref 加若干图片")
        ref_p = Path(a.ref).resolve()
        files = [Path(f) for f in a.files]
        out_p = files[0].parent / "metrics.json"

    ref = load(ref_p)
    if not files:
        sys.exit("没有可度量的出图")

    rows = []
    for p in files:
        img = load(p)
        H, W = ref.shape[:2]
        small = cv2.resize(img, (W, H), interpolation=cv2.INTER_AREA)
        rows.append({
            "file": Path(p).name,
            "size": f"{img.shape[1]}x{img.shape[0]}",
            "ssim_all": round(ssim(ref, small), 4),
            "face_diff": round(face_absdiff(ref, small, box), 2),
            "sharp": round(sharp(small), 1),
        })

    metrics = {
        "ref": ref_p.name,
        "ref_size": f"{ref.shape[1]}x{ref.shape[0]}",
        "ref_sharp": round(sharp(ref), 1),
        "face_box": list(box),
        "runs": rows,
    }
    out_p.write_text(json.dumps(metrics, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(metrics, ensure_ascii=False, indent=1))
    print(f"\n[measure] -> {out_p}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
