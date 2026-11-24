"""M1 面板细节：抽 4 帧按比例裁面板区，放大看护盖/拨杆/灯。"""
from pathlib import Path
import cv2

ROOT = Path(__file__).resolve().parent
RUN = ROOT / "video" / "runs" / "M1"
OUT = ROOT / "inspect"

cap = cv2.VideoCapture(str(RUN / "out.mp4"))
w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
print("video", w, h)

x0, x1 = int(w * 0.54), int(w * 0.99)
y0, y1 = int(h * 0.48), int(h * 0.88)

tiles = []
for t in [0.0, 2.4, 3.2, 4.8]:
    cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
    ok, fr = cap.read()
    if not ok:
        continue
    crop = fr[y0:y1, x0:x1]
    scale = 900 / crop.shape[1]
    crop = cv2.resize(crop, (900, int(crop.shape[0] * scale)), interpolation=cv2.INTER_LANCZOS4)
    cv2.putText(crop, f"t={t:.1f}s", (10, 34), cv2.FONT_HERSHEY_SIMPLEX, 0.95, (0, 0, 255), 2)
    tiles.append(crop)
cap.release()

rows = [cv2.hconcat(tiles[i:i + 2]) for i in range(0, len(tiles), 2)]
sheet = cv2.vconcat(rows)
dst = OUT / "M1-panel.png"
cv2.imwrite(str(dst), sheet)
print(dst.name, sheet.shape)
