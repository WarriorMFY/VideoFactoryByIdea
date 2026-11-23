"""t2i-probe 度量：尺寸核对 + 清晰度/色彩 + 镜像对称度（无锚版）。

    python measure.py --run Log/Circle28/t2i/runs/P1-地形

输出 <run>/metrics.json。判据见 ../reference/judging.md。
与 i2i-probe 的差异：无 anchor_ncc（无锚图），增加 mirror_ncc（本通道已知的镜像对称副作用）。
"""
import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np


def imread_u(p):
    """Windows 下 cv2.imread 不认非 ASCII 路径，统一走 fromfile 解码。"""
    buf = np.fromfile(str(p), dtype=np.uint8)
    return cv2.imdecode(buf, cv2.IMREAD_COLOR) if buf.size else None


def gray(img):
    return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)


def ncc(a, b):
    a = a.astype(np.float32)
    b = b.astype(np.float32)
    a -= a.mean()
    b -= b.mean()
    den = float(np.sqrt((a * a).sum() * (b * b).sum()))
    return float((a * b).sum() / den) if den else 0.0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", required=True, help="runs/<id> 目录")
    a = ap.parse_args()

    run = Path(a.run).resolve()
    run_json = run / "run.json"
    if not run_json.exists():
        print("缺 run.json，先跑 probe.py", file=sys.stderr)
        return 2
    rec = json.loads(run_json.read_text(encoding="utf-8"))
    img_p = Path(rec.get("file") or (run / "out.png"))
    if not img_p.exists():
        print(f"图不存在: {img_p}", file=sys.stderr)
        return 2

    img = imread_u(img_p)
    if img is None:
        print(f"读不出来: {img_p}", file=sys.stderr)
        return 2

    g = gray(img)
    h, w = g.shape
    lap_var = float(cv2.Laplacian(g, cv2.CV_64F).var())
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    sat_mean = float(hsv[:, :, 1].mean())
    val_mean = float(hsv[:, :, 2].mean())
    # 镜像对称度：水平翻转后的 NCC。本通道有镜像构图倾向，>0.90 视为疑似
    mirror = ncc(g, cv2.flip(g, 1))
    # 灰度直方图（32 桶），用于组内风格锁定比较
    hist = cv2.calcHist([g], [0], None, [32], [0, 256]).flatten()
    hist = (hist / hist.sum()).round(4).tolist() if hist.sum() else hist.tolist()

    metrics = {
        "id": rec.get("id"),
        "group": rec.get("group"),
        "image": str(img_p),
        "size": [w, h],
        "size_requested": rec.get("params", {}).get("resolution"),
        "aspect_ratio": rec.get("params", {}).get("aspect_ratio"),
        "lap_var": round(lap_var, 1),
        "sharp_band": ("糊" if lap_var < 80 else ("中" if lap_var < 300 else "锐")),
        "sat_mean": round(sat_mean, 1),
        "val_mean": round(val_mean, 1),
        "mirror_ncc": round(mirror, 4),
        "mirror_flag": mirror >= 0.90,
        "hist32": hist,
    }
    (run / "metrics.json").write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"{metrics['id']}  ({metrics['group']})  {w}x{h}  请求档 {metrics['size_requested']}  {metrics['aspect_ratio']}")
    print(f"清晰 lap_var={metrics['lap_var']}  档位={metrics['sharp_band']}")
    print(f"色彩 sat={metrics['sat_mean']} val={metrics['val_mean']}")
    print(f"镜像 mirror_ncc={metrics['mirror_ncc']}" + ("  ⚠️ 疑似镜像构图" if metrics["mirror_flag"] else ""))
    print(f"-> {run / 'metrics.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
