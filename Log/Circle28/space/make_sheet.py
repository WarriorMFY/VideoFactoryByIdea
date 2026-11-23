"""拼空间锚候选：B2 锚 + 16:9 两张 + 2:3 两张。"""
import cv2
import numpy as np
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
IDS = [
    (ROOT / "style" / "style-anchor-locked.png", "STYLE-ANCHOR B2"),
    (HERE / "runs" / "P1-arc169" / "out_1.png", "16x9 #1"),
    (HERE / "runs" / "P1-arc169" / "out_2.png", "16x9 #2"),
    (HERE / "runs" / "P1-ar23" / "out_1.png", "2x3 #1"),
    (HERE / "runs" / "P1-ar23" / "out_2.png", "2x3 #2"),
]
CELL_W, CELL_H = 520, 640


def imread_u(p):
    buf = np.fromfile(str(p), dtype=np.uint8)
    return cv2.imdecode(buf, cv2.IMREAD_COLOR)


def fit(img, w, h):
    ih, iw = img.shape[:2]
    s = min(w / iw, h / ih)
    img = cv2.resize(img, (int(iw * s), int(ih * s)), interpolation=cv2.INTER_AREA)
    canvas = np.full((h, w, 3), 24, np.uint8)
    y0 = (h - img.shape[0]) // 2
    x0 = (w - img.shape[1]) // 2
    canvas[y0:y0 + img.shape[0], x0:x0 + img.shape[1]] = img
    return canvas


cells = []
for path, label in IDS:
    img = imread_u(path)
    cell = fit(img, CELL_W, CELL_H)
    cv2.putText(cell, label, (10, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
    cv2.putText(cell, f"{img.shape[1]}x{img.shape[0]}", (10, 54),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (200, 200, 200), 1)
    cells.append(cell)

row1 = np.hstack(cells[:3])
row2 = np.hstack([cells[3], cells[4], np.full_like(cells[0], 24)])
sheet = np.vstack([row1, row2])
out = HERE / "space-compare.png"
cv2.imwrite(str(out), sheet)
print(f"-> {out}  {sheet.shape[1]}x{sheet.shape[0]}")
