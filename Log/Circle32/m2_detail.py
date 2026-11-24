"""M2 密集抽帧：脚步（0-2.4s 每 0.4s）+ 尾段（4.2/5.0）看是否走步与崩边。"""
from pathlib import Path
import cv2

ROOT = Path(__file__).resolve().parent
RUN = ROOT / "video" / "runs" / "M2"
OUT = ROOT / "inspect"

cap = cv2.VideoCapture(str(RUN / "out.mp4"))
w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
print("video", w, h)


def grab(t, box, scale, label):
    cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
    ok, fr = cap.read()
    if not ok:
        return None
    x0, y0, x1, y1 = box
    crop = fr[y0:y1, x0:x1]
    crop = cv2.resize(crop, ((x1 - x0) * scale, (y1 - y0) * scale), interpolation=cv2.INTER_LANCZOS4)
    cv2.putText(crop, f"t={t:.1f}s", (8, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (0, 0, 255), 2)
    return crop


# 脚步：人脚大约在 x 210-360, y 470-570（1056x608）
feet = []
for t in [0.0, 0.4, 0.8, 1.2, 1.6, 2.0]:
    c = grab(t, (190, 440, 400, 590), 4, "feet")
    if c is not None:
        feet.append(c)
if feet:
    rows = [cv2.hconcat(feet[i:i + 2]) for i in range(0, len(feet), 2)]
    sheet = cv2.vconcat(rows)
    cv2.imwrite(str(OUT / "M2-feet.png"), sheet)
    print("M2-feet.png", sheet.shape)

# 尾段全帧
tails = []
for t in [3.6, 4.2, 4.8, 5.0]:
    cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
    ok, fr = cap.read()
    if not ok:
        continue
    small = cv2.resize(fr, (760, int(760 * h / w)), interpolation=cv2.INTER_AREA)
    cv2.putText(small, f"t={t:.1f}s", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 0, 255), 2)
    tails.append(small)
cap.release()
if tails:
    rows = [cv2.hconcat(tails[i:i + 2]) for i in range(0, len(tails), 2)]
    sheet = cv2.vconcat(rows)
    cv2.imwrite(str(OUT / "M2-tail.png"), sheet)
    print("M2-tail.png", sheet.shape)
