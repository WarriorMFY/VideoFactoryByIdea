"""i2i-probe 度量：目标变量变了多少 + 非目标漂了没有。

七个数字（全部相对锚图，输出先缩到锚尺寸）：
  ncc_global  灰度归一化互相关 —— 整体还像不像原图
  ssim_gray   灰度 SSIM         —— 结构保真
  edge_ssim   边缘图 SSIM       —— 构图/轮廓锁定（对光线、画风变化更鲁棒）
  luma_mean/std                 —— 光线是否按预期变
  sat_mean / hist_l1            —— 色彩/画风漂移
  lap_var                       —— 锐度/笔触（磨皮还是加细节）
  face_ratio                    —— 人脸高度占图高比（景别代理，人物锚）
  face_ssim                     —— 人脸区结构相似（长相漂移代理）

    python measure.py --run Log/Circle27/runs/A-V1-近
    python measure.py --ref a.png b_1.png b_2.png
"""
import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np

CASCADE_MODEL = Path(__file__).resolve().parent.parent / "models" / "face_detection_yunet_2023mar.onnx"
_DET = None


def detector():
    """可选 YuNet 人脸模型（OpenCV 5 已移除 Haar 级联）：有模型才自动测人脸。"""
    global _DET
    if _DET is None:
        if CASCADE_MODEL.exists():
            _DET = cv2.FaceDetectorYN_create(str(CASCADE_MODEL), "", (320, 320), 0.6, 0.3, 5000)
        else:
            _DET = False
    return _DET or None


def load(p):
    """cv2.imread 在 Windows 读不了中文路径；用 imdecode 走字节。"""
    data = np.fromfile(str(p), dtype=np.uint8)
    img = cv2.imdecode(data, cv2.IMREAD_COLOR) if data.size else None
    if img is None:
        sys.exit(f"读不到 {p}")
    return img


def gray(img):
    return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)


def ssim_gray(ga, gb) -> float:
    a = ga.astype(np.float64)
    b = gb.astype(np.float64)
    C1, C2 = (0.01 * 255) ** 2, (0.03 * 255) ** 2
    mu_a = cv2.GaussianBlur(a, (11, 11), 1.5)
    mu_b = cv2.GaussianBlur(b, (11, 11), 1.5)
    sa = cv2.GaussianBlur(a * a, (11, 11), 1.5) - mu_a ** 2
    sb = cv2.GaussianBlur(b * b, (11, 11), 1.5) - mu_b ** 2
    sab = cv2.GaussianBlur(a * b, (11, 11), 1.5) - mu_a * mu_b
    num = (2 * mu_a * mu_b + C1) * (2 * sab + C2)
    den = (mu_a ** 2 + mu_b ** 2 + C1) * (sa + sb + C2)
    return float((num / den).mean())


def ncc(ga, gb) -> float:
    a = ga.astype(np.float64) - ga.mean()
    b = gb.astype(np.float64) - gb.mean()
    return float((a * b).sum() / (np.sqrt((a * a).sum() * (b * b).sum()) + 1e-9))


def edge_map(g) -> np.ndarray:
    e = cv2.Canny(g, 60, 160)
    return cv2.GaussianBlur(e, (5, 5), 1.2)


def sat_mean(bgr) -> float:
    return float(cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)[:, :, 1].mean())


def hist_hs(bgr) -> np.ndarray:
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    h = cv2.calcHist([hsv], [0, 1], None, [30, 32], [0, 180, 0, 256])
    cv2.normalize(h, h, 1.0, 0, cv2.NORM_L1)
    return h.ravel()


def hist_l1(h1, h2) -> float:
    return float(0.5 * np.abs(h1 - h2).sum())


def lap_var(g) -> float:
    return float(cv2.Laplacian(g, cv2.CV_64F).var())


def face_box(bgr):
    det = detector()
    if det is None:
        return None
    h, w = bgr.shape[:2]
    det.setInputSize((w, h))
    _, faces = det.detect(bgr)
    if faces is None or len(faces) == 0:
        return None
    best = max(faces, key=lambda f: float(f[2]) * float(f[3]))
    return (int(best[0]), int(best[1]), int(best[2]), int(best[3]))


def face_crop(bgr, box, size=128):
    x, y, w, h = [int(v) for v in box]
    crop = gray(bgr)[y:y + h, x:x + w]
    return cv2.resize(crop, (size, size), interpolation=cv2.INTER_AREA)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", default=None, help="跑次目录（读 run.json 拿锚与出图）")
    ap.add_argument("--ref", default=None, help="锚图；不给则用 run.json 的 anchor")
    ap.add_argument("files", nargs="*", help="要度量的图（不给则取 run 目录下 out*.png）")
    a = ap.parse_args()

    if a.run:
        run_dir = Path(a.run).resolve()
        rj = run_dir / "run.json"
        if not rj.exists():
            sys.exit(f"缺 run.json：{rj}")
        rec = json.loads(rj.read_text(encoding="utf-8"))
        ref_p = Path(a.ref).resolve() if a.ref else Path(rec["anchor"])
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
    H, W = ref.shape[:2]
    rg = gray(ref)
    r_face = face_box(ref)
    anchor_m = {
        "file": ref_p.name,
        "size": f"{W}x{H}",
        "luma_mean": round(float(rg.mean()), 1),
        "luma_std": round(float(rg.std()), 1),
        "sat_mean": round(sat_mean(ref), 1),
        "lap_var": round(lap_var(rg), 1),
        "face_ratio": round(float(r_face[3]) / H, 4) if r_face is not None else None,
    }
    r_hist = hist_hs(ref)
    r_edge = edge_map(rg)

    rows = []
    for p in files:
        img = load(p)
        ph, pw = img.shape[:2]
        small = cv2.resize(img, (W, H), interpolation=cv2.INTER_AREA)
        g = gray(small)
        face = face_box(img)
        face_ratio = round(float(face[3]) / ph, 4) if face is not None else None
        face_ssim_v = None
        if r_face is not None and face is not None:
            face_ssim_v = round(ssim_gray(face_crop(ref, r_face), face_crop(img, face)), 4)
        luma = float(g.mean())
        sat = sat_mean(small)
        rows.append({
            "file": Path(p).name,
            "size": f"{pw}x{ph}",
            "ncc_global": round(ncc(rg, g), 4),
            "ssim_gray": round(ssim_gray(rg, g), 4),
            "edge_ssim": round(ssim_gray(r_edge, edge_map(g)), 4),
            "luma_mean": round(luma, 1),
            "d_luma_pct": round((luma - anchor_m["luma_mean"]) / max(anchor_m["luma_mean"], 1e-6) * 100, 1),
            "luma_std": round(float(g.std()), 1),
            "sat_mean": round(sat, 1),
            "d_sat_pct": round((sat - anchor_m["sat_mean"]) / max(anchor_m["sat_mean"], 1e-6) * 100, 1),
            "hist_l1": round(hist_l1(r_hist, hist_hs(small)), 4),
            "lap_var": round(lap_var(g), 1),
            "face_ratio": face_ratio,
            "face_ratio_x": round(face_ratio / anchor_m["face_ratio"], 2)
            if (face_ratio and anchor_m["face_ratio"]) else None,
            "face_ssim": face_ssim_v,
        })

    metrics = {"anchor": anchor_m, "runs": rows}
    out_p.write_text(json.dumps(metrics, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"{'file':<18}{'ncc':>7}{'ssim':>7}{'edge':>7}{'dluma%':>8}"
          f"{'dsat%':>7}{'hist':>7}{'lap':>7}{'facex':>7}{'fssim':>7}")
    print(f"{'ANCHOR':<18}{'':>7}{'':>7}{'':>7}{'':>8}{'':>7}{'':>7}"
          f"{anchor_m['lap_var']:>7}{'':>7}{'':>7}")
    for r in rows:
        print(f"{r['file']:<18}{r['ncc_global']:>7.3f}{r['ssim_gray']:>7.3f}{r['edge_ssim']:>7.3f}"
              f"{r['d_luma_pct']:>8.1f}{r['d_sat_pct']:>7.1f}{r['hist_l1']:>7.3f}"
              f"{r['lap_var']:>7.1f}{(r['face_ratio_x'] or 0):>7.2f}{(r['face_ssim'] or 0):>7.3f}")
    print(f"\n[measure] -> {out_p}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
