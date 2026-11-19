"""Measure C3 (start-end) anchoring: NCC / SSIM of output first & last frames vs anchors."""
import sys, os, json
sys.path.insert(0, r"F:\AgentWorkArea\WorkBuddy\CardStudio\Tool\_deps")
import cv2
import numpy as np

def load(p):
    im = cv2.imdecode(np.fromfile(p, dtype=np.uint8), cv2.IMREAD_COLOR)
    if im is None:
        raise SystemExit(f"cannot read {p}")
    return im

def to_size(im, w, h):
    return cv2.resize(im, (w, h), interpolation=cv2.INTER_AREA)

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

VID = sys.argv[1]
A1 = sys.argv[2]  # intended first
A2 = sys.argv[3]  # intended last

cap = cv2.VideoCapture(VID)
n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)); h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
cap.set(cv2.CAP_PROP_POS_FRAMES, 0); ok1, f_first = cap.read()
cap.set(cv2.CAP_PROP_POS_FRAMES, max(0, n - 1)); ok2, f_last = cap.read()
cap.release()
print(f"video: {w}x{h}, frames={n}, read_first={ok1}, read_last={ok2}")

a1, a2 = load(A1), load(A2)
r = w / h
variants = {
    "resize": lambda im: to_size(im, w, h),
    "crop16:9": lambda im: to_size(center_crop_ratio(im, r), w, h),
}

res = {}
for name, fn in variants.items():
    ref1, ref2 = fn(a1), fn(a2)
    res[name] = {
        "first_vs_A1(起点)": (round(ncc(f_first, ref1), 4), round(ssim(f_first, ref1), 4)),
        "first_vs_A2(掠过)": (round(ncc(f_first, ref2), 4), round(ssim(f_first, ref2), 4)),
        "last_vs_A1(起点)": (round(ncc(f_last, ref1), 4), round(ssim(f_last, ref1), 4)),
        "last_vs_A2(掠过)": (round(ncc(f_last, ref2), 4), round(ssim(f_last, ref2), 4)),
    }

print(json.dumps({"video": {"w": w, "h": h, "frames": n}, "metrics": res}, ensure_ascii=False, indent=1))

outdir = os.path.dirname(VID)
cv2.imwrite(os.path.join(outdir, "_c3_first.png"), f_first)
cv2.imwrite(os.path.join(outdir, "_c3_last.png"), f_last)
print("saved _c3_first.png / _c3_last.png")
