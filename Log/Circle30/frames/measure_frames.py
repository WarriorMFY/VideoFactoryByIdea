"""Circle30 现场器材：关键帧判据（对空间锚 SSIM / mirror_ncc / 对肖像 face ncc）。
本机 cv2 无 CascadeClassifier，人脸框改人工给（记录在 BOXES，非检测）。
"""
import json
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent  # Log/Circle30
SPACE = ROOT / "space" / "space-anchor-locked.png"
PORT = ROOT / "portrait" / "portrait-anchor-locked.png"

# 相对框 (x1,y1,x2,y2)，人工给：肖像取中央胸像，关键帧取可见的最大人脸
BOXES = {
    "portrait": (0.28, 0.12, 0.72, 0.48),
    "K1-抹纸/out_1.png": (0.26, 0.12, 0.44, 0.28),
    "K1-抹纸/out_2.png": (0.26, 0.12, 0.44, 0.28),
    "K2-压边/out_1.png": (0.22, 0.09, 0.57, 0.41),
    "K2-压边/out_2.png": (0.22, 0.09, 0.57, 0.41),
}


def imread_u(p):
    buf = np.fromfile(str(p), dtype=np.uint8)
    return cv2.imdecode(buf, cv2.IMREAD_COLOR) if buf.size else None


def ssim(a, b):
    b = cv2.resize(b, (a.shape[1], a.shape[0]))
    ga = cv2.cvtColor(a, cv2.COLOR_BGR2GRAY).astype(np.float64)
    gb = cv2.cvtColor(b, cv2.COLOR_BGR2GRAY).astype(np.float64)
    C1, C2 = (0.01 * 255) ** 2, (0.03 * 255) ** 2
    ma = cv2.GaussianBlur(ga, (11, 11), 1.5)
    mb = cv2.GaussianBlur(gb, (11, 11), 1.5)
    sa = cv2.GaussianBlur(ga * ga, (11, 11), 1.5) - ma ** 2
    sb = cv2.GaussianBlur(gb * gb, (11, 11), 1.5) - mb ** 2
    sab = cv2.GaussianBlur(ga * gb, (11, 11), 1.5) - ma * mb
    return float((((2 * ma * mb + C1) * (2 * sab + C2)) / ((ma ** 2 + mb ** 2 + C1) * (sa + sb + C2))).mean())


def mirror_ncc(img):
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
    f = cv2.flip(g, 1)
    a, b = g - g.mean(), f - f.mean()
    d = float(np.sqrt((a * a).sum() * (b * b).sum()))
    return float((a * b).sum() / d) if d else 0.0


def crop(img, box):
    h, w = img.shape[:2]
    x1, y1, x2, y2 = int(w * box[0]), int(h * box[1]), int(w * box[2]), int(h * box[3])
    c = img[y1:y2, x1:x2]
    return cv2.resize(cv2.cvtColor(c, cv2.COLOR_BGR2GRAY), (160, 160)).astype(np.float32)


def ncc(a, b):
    a = a - a.mean()
    b = b - b.mean()
    d = float(np.sqrt((a * a).sum() * (b * b).sum()))
    return float((a * b).sum() / d) if d else 0.0


def main():
    space = imread_u(SPACE)
    port = imread_u(PORT)
    pf = crop(port, BOXES["portrait"])
    res = {"space": str(SPACE), "portrait": str(PORT),
           "note": "face_ncc 的人脸框为人工给（BOXES），非检测器输出", "runs": {}}
    for run in sorted((ROOT / "frames").glob("runs/*")):
        rj = run / "run.json"
        if not rj.exists():
            continue
        rec = json.loads(rj.read_text(encoding="utf-8"))
        rows = {}
        for f in rec.get("files") or []:
            img = imread_u(f)
            if img is None:
                continue
            key = run.name + "/" + Path(f).name
            box = BOXES.get(key)
            rows[Path(f).name] = {
                "size": [int(img.shape[1]), int(img.shape[0])],
                "ssim_vs_space": round(ssim(space, img), 4),
                "mirror_ncc": round(mirror_ncc(img), 4),
                "face_ncc_vs_portrait": None if box is None else round(ncc(pf, crop(img, box)), 4),
                "face_box": box,
            }
        res["runs"][run.name] = rows
    dst = ROOT / "frames" / "frame-metrics.json"
    dst.write_text(json.dumps(res, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(res, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
