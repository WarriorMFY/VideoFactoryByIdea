"""拼身份锚候选 2x2。"""
import cv2
import numpy as np
from pathlib import Path

HERE = Path(__file__).resolve().parent
CELL_W, CELL_H = 520, 700
cells = []
for i in range(1, 5):
    p = HERE / "runs" / f"P-A{i}" / "out.png"
    buf = np.fromfile(str(p), dtype=np.uint8)
    img = cv2.imdecode(buf, cv2.IMREAD_COLOR)
    ih, iw = img.shape[:2]
    s = min(CELL_W / iw, CELL_H / ih)
    img = cv2.resize(img, (int(iw * s), int(ih * s)), interpolation=cv2.INTER_AREA)
    cell = np.full((CELL_H, CELL_W, 3), 24, np.uint8)
    y0 = (CELL_H - img.shape[0]) // 2
    x0 = (CELL_W - img.shape[1]) // 2
    cell[y0:y0 + img.shape[0], x0:x0 + img.shape[1]] = img
    cv2.putText(cell, f"P-A{i}", (10, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
    cells.append(cell)

sheet = np.vstack([np.hstack(cells[:2]), np.hstack(cells[2:])])
out = HERE / "portrait-compare.png"
cv2.imwrite(str(out), sheet)
print(f"-> {out}  {sheet.shape[1]}x{sheet.shape[0]}")
