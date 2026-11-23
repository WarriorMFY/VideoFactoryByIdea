"""拼风格锚 2x2 对比图：上排 G-2.0（A1/A2），下排官流重绘（B1/B2）。"""
import cv2
import numpy as np
from pathlib import Path

HERE = Path(__file__).resolve().parent
IDS = [("S-A1", "G-2.0 A1"), ("S-A2", "G-2.0 A2"),
       ("S-B1", "G31-official B1"), ("S-B2", "G31-official B2")]
CELL_W, CELL_H = 560, 700   # 3:4 竖版格


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
for rid, label in IDS:
    img = imread_u(HERE / "runs" / rid / "out.png")
    cell = fit(img, CELL_W, CELL_H)
    cv2.putText(cell, label, (12, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
    cv2.putText(cell, f"{img.shape[1]}x{img.shape[0]}", (12, 58),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 200, 200), 1)
    cells.append(cell)

row1 = np.hstack([cells[0], cells[1]])
row2 = np.hstack([cells[2], cells[3]])
sheet = np.vstack([row1, row2])
out = HERE / "style-compare.png"
cv2.imwrite(str(out), sheet)
print(f"-> {out}  {sheet.shape[1]}x{sheet.shape[0]}")
