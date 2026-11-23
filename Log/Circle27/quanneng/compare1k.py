"""Compare Q(1k) vs Flux3 outputs against the scene anchor, metric parity with measure.py."""
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(r"d:\Data\QoderWorkArea\CardVideoMethod\Log\Circle27")
ANCHOR = ROOT / "runs" / "A-base" / "anchor.png"
FILES = [
    ("Q-1k", ROOT / "quanneng" / "runs" / "Q-A-V1-中" / "out.png"),
    ("F-out_1", ROOT / "runs" / "A-V1-中" / "out_1.png"),
    ("F-out_2", ROOT / "runs" / "A-V1-中" / "out_2.png"),
]


def load(p):
    data = np.fromfile(str(p), dtype=np.uint8)
    img = cv2.imdecode(data, cv2.IMREAD_COLOR)
    if img is None:
        raise SystemExit(f"读不到 {p}")
    return img


def gray(img):
    return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)


def ssim_gray(ga, gb):
    a, b = ga.astype(np.float64), gb.astype(np.float64)
    C1, C2 = (0.01 * 255) ** 2, (0.03 * 255) ** 2
    mu_a = cv2.GaussianBlur(a, (11, 11), 1.5)
    mu_b = cv2.GaussianBlur(b, (11, 11), 1.5)
    sa = cv2.GaussianBlur(a * a, (11, 11), 1.5) - mu_a ** 2
    sb = cv2.GaussianBlur(b * b, (11, 11), 1.5) - mu_b ** 2
    sab = cv2.GaussianBlur(a * b, (11, 11), 1.5) - mu_a * mu_b
    return float((((2 * mu_a * mu_b + C1) * (2 * sab + C2)) /
                  ((mu_a ** 2 + mu_b ** 2 + C1) * (sa + sb + C2))).mean())


def ncc(ga, gb):
    a = ga.astype(np.float64) - ga.mean()
    b = gb.astype(np.float64) - gb.mean()
    return float((a * b).sum() / (np.sqrt((a * a).sum() * (b * b).sum()) + 1e-9))


def edge_map(g):
    return cv2.GaussianBlur(cv2.Canny(g, 60, 160), (5, 5), 1.2)


def hist_hs(bgr):
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    h = cv2.calcHist([hsv], [0, 1], None, [30, 32], [0, 180, 0, 256])
    cv2.normalize(h, h, 1.0, 0, cv2.NORM_L1)
    return h.ravel()


anchor = load(ANCHOR)
ga = gray(anchor)
ea = edge_map(ga)
ha = hist_hs(anchor)
la = float(ga.mean())
sa = float(cv2.cvtColor(anchor, cv2.COLOR_BGR2HSV)[:, :, 1].mean())
print(f"anchor {anchor.shape[1]}x{anchor.shape[0]}")
print(f"{'id':<9} {'size':<11} {'ncc':>6} {'ssim':>6} {'edge':>6} {'dluma%':>7} {'dsat%':>7} {'hist':>6} {'lap':>6}")
for name, p in FILES:
    img = load(p)
    g = gray(img)
    g = cv2.resize(g, (ga.shape[1], ga.shape[0]), interpolation=cv2.INTER_AREA)
    c = cv2.resize(img, (anchor.shape[1], anchor.shape[0]), interpolation=cv2.INTER_AREA)
    e = edge_map(g)
    luma = float(g.mean())
    sat = float(cv2.cvtColor(c, cv2.COLOR_BGR2HSV)[:, :, 1].mean())
    print(f"{name:<9} {img.shape[1]}x{img.shape[0]:<5} "
          f"{ncc(ga, g):>6.3f} {ssim_gray(ga, g):>6.3f} {ssim_gray(ea, e):>6.3f} "
          f"{100*(luma-la)/max(la,1):>7.1f} {100*(sat-sa)/max(sa,1):>7.1f} "
          f"{0.5*np.abs(hist_hs(c)-ha).sum():>6.3f} {cv2.Laplacian(g, cv2.CV_64F).var():>6.0f}")
