"""Estimate zoom direction (scale) of outputs vs anchor via ORB+RANSAC, and build side-by-side."""
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(r"d:\Data\QoderWorkArea\CardVideoMethod\Log\Circle27")
ANCHOR = ROOT / "runs" / "A-base" / "anchor.png"
Q = ROOT / "quanneng" / "runs" / "Q-A-V1-中" / "out.png"
F1 = ROOT / "runs" / "A-V1-中" / "out_1.png"
F2 = ROOT / "runs" / "A-V1-中" / "out_2.png"


def load(p):
    data = np.fromfile(str(p), dtype=np.uint8)
    return cv2.imdecode(data, cv2.IMREAD_COLOR)


def est_scale(ref, mov, label):
    """相似变换 matching: map anchor coords -> output coords; scale = output/anchor."""
    ga = cv2.cvtColor(ref, cv2.COLOR_BGR2GRAY)
    gb = cv2.cvtColor(mov, cv2.COLOR_BGR2GRAY)
    # resize both to same width for fair scale estimate
    w = 1280
    ga = cv2.resize(ga, (w, int(ga.shape[0] * w / ga.shape[1])))
    gb = cv2.resize(gb, (w, int(gb.shape[0] * w / gb.shape[1])))
    orb = cv2.ORB_create(nfeatures=6000)
    ka, da = orb.detectAndCompute(ga, None)
    kb, db = orb.detectAndCompute(gb, None)
    bf = cv2.BFMatcher(cv2.NORM_HAMMING)
    matches = bf.knnMatch(da, db, k=2)
    good = [m for m, n in matches if m.distance < 0.75 * n.distance]
    if len(good) < 12:
        print(f"{label}: not enough matches ({len(good)})")
        return
    pa = np.float32([ka[m.queryIdx].pt for m in good])
    pb = np.float32([kb[m.trainIdx].pt for m in good])
    M, inl = cv2.estimateAffinePartial2D(pa, pb, method=cv2.RANSAC, ransacReprojThreshold=3.0)
    if M is None:
        print(f"{label}: estimate failed")
        return
    s = float(np.sqrt(M[0, 0] ** 2 + M[0, 1] ** 2))
    inliers = int(inl.sum()) if inl is not None else -1
    # interpret: s>1 means anchor content appears larger in output = camera pushed in
    direction = "PUSH-IN (推近)" if s > 1.03 else ("PULL-BACK (拉远)" if s < 0.97 else "≈SAME (基本未动)")
    print(f"{label:<10} matches={len(good):>4} inliers={inliers:>4} scale={s:.3f} -> {direction}")


ref = load(ANCHOR)
print(f"anchor {ref.shape[1]}x{ref.shape[0]}")
est_scale(ref, load(Q), "Q-1k")
est_scale(ref, load(F1), "F-out_1")
est_scale(ref, load(F2), "F-out_2")

# side-by-side composite: anchor | Q | F1, same width, labels
def band(img, label, w=960):
    h = int(img.shape[0] * w / img.shape[1])
    r = cv2.resize(img, (w, h))
    cv2.rectangle(r, (0, 0), (255, 42), (0, 0, 0), -1)
    cv2.putText(r, label, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 255, 255), 2, cv2.LINE_AA)
    return r


panels = [band(ref, "ANCHOR"), band(load(Q), "Q-1k"), band(load(F1), "FLUX-out1")]
h = min(p.shape[0] for p in panels)
panels = [p[:h] for p in panels]
comp = cv2.hconcat(panels)
out = ROOT / "quanneng" / "compare-A-V1-zhong.png"
cv2.imwrite(str(out), comp)
print("saved", out, comp.shape)
