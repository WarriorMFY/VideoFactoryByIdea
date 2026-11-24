"""M1 抽帧接触表：8 帧拼 2x4，看动作是否成立（零积分，本地）。"""
from pathlib import Path
import cv2

ROOT = Path(__file__).resolve().parent
RUN = ROOT / "video" / "runs" / "M2"
OUT = ROOT / "inspect"
OUT.mkdir(exist_ok=True)

cap = cv2.VideoCapture(str(RUN / "out.mp4"))
fps = cap.get(cv2.CAP_PROP_FPS)
n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
dur = n / fps
print(f"fps={fps:.2f} frames={n} dur={dur:.3f}s")

times = [0.0, 0.7, 1.4, 2.1, 2.8, 3.5, 4.2, 5.0]
frames = []
for t in times:
    cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
    ok, fr = cap.read()
    if not ok:
        print("miss", t)
        continue
    h, w = fr.shape[:2]
    small = cv2.resize(fr, (960, int(960 * h / w)), interpolation=cv2.INTER_AREA)
    cv2.putText(small, f"t={t:.1f}s", (14, 40), cv2.FONT_HERSHEY_SIMPLEX, 1.1, (0, 0, 255), 3)
    frames.append(small)
cap.release()

rows = [cv2.hconcat(frames[i:i + 2]) for i in range(0, len(frames), 2)]
sheet = cv2.vconcat(rows)
dst = OUT / "M2-sheet.png"
cv2.imwrite(str(dst), sheet)
print(dst.name, sheet.shape)
