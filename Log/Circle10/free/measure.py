"""自由任务 Step 3：量三件事。

1. 构图（L4）：人物高度占画幅比、头顶留白、鞋底距下缘、腰线位置——用「非背景像素」的行分布算。
2. 首帧保真（L0）：0s 帧 vs 首帧图，整体 NCC + 眼位对齐 NCC。
3. 运动：逐帧差分曲线，找抬手/重心转移的时刻。

背景是浅灰无缝，按与画面四角中位色的距离做阈值，得到前景掩膜。
用法：python Log/Circle10/free/measure.py
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "Tool" / "_deps"))
sys.path.insert(0, str(ROOT / "Tool" / "_deps_cv4"))
sys.path.insert(0, str(ROOT / "Log" / "Circle10"))

import cv2
import numpy as np
from consistency import eye_pair, align, crop, score

HERE = Path(__file__).resolve().parent
OUT = HERE / "output"


def fg_mask(bgr):
    h, w = bgr.shape[:2]
    corners = np.array([bgr[4, 4], bgr[4, w - 5], bgr[h - 5, 4], bgr[h - 5, w - 5]], dtype=np.float32)
    bg = np.median(corners, axis=0)
    d = np.linalg.norm(bgr.astype(np.float32) - bg, axis=2)
    m = (d > 26).astype(np.uint8) * 255
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    # 只保留最大连通域
    n, lab, stats, _ = cv2.connectedComponentsWithStats(m, 8)
    if n > 1:
        idx = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        m = ((lab == idx) * 255).astype(np.uint8)
    return m


def frame_geom(bgr):
    h, w = bgr.shape[:2]
    m = fg_mask(bgr)
    rows = np.where(m.sum(axis=1) > 0.01 * 255 * w)[0]
    cols = np.where(m.sum(axis=0) > 0.01 * 255 * h)[0]
    if len(rows) == 0:
        return None
    top, bot = int(rows[0]), int(rows[-1])
    people_h = (bot - top + 1) / h
    # 腰线：宽度最窄的一段（在 35%–60% 身高区间里找）
    widths = (m > 0).sum(axis=1)
    a, b = top + int(0.30 * (bot - top)), top + int(0.62 * (bot - top))
    seg = widths[a:b]
    waist_row = a + int(np.argmin(seg))
    return dict(
        top_pad=top / h,
        bottom_gap=(h - 1 - bot) / h,
        height=people_h,
        width=(cols[-1] - cols[0] + 1) / w,
        waist=(waist_row - top) / max(1, bot - top),   # 腰线在「人物身高」中的相对位置，从头顶算
        aspect=(bot - top + 1) / max(1, cols[-1] - cols[0] + 1),
        mask=m,
    )


def ncc(a, b):
    gb_img = b if b.shape[:2] == a.shape[:2] else cv2.resize(b, (a.shape[1], a.shape[0]),
                                                             interpolation=cv2.INTER_AREA)
    ga = cv2.cvtColor(a, cv2.COLOR_BGR2GRAY).astype(np.float32)
    gb = cv2.cvtColor(gb_img, cv2.COLOR_BGR2GRAY).astype(np.float32)
    ga -= ga.mean()
    gb -= gb.mean()
    return float((ga * gb).sum() / np.sqrt((ga * ga).sum() * (gb * gb).sum()))


def denim_top(bgr):
    """牛仔裤（蓝色）最上沿的行号——当作腰线。找不到返回 None。"""
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    lo = np.array([95, 40, 60], np.uint8)
    hi = np.array([125, 255, 255], np.uint8)
    m = cv2.inRange(hsv, lo, hi)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    rows = np.where((m > 0).sum(axis=1) > 0.06 * bgr.shape[1])[0]
    return int(rows[0]) if len(rows) else None



still = cv2.imread(str(OUT / "still-a.png"))
g = frame_geom(still)
H = still.shape[0]
print("== 首帧构图（画幅 %dx%d）==" % (still.shape[1], H))
print("  头顶留白 %.1f%%   鞋底距下缘 %.1f%%   人物高占 %.1f%%   宽占 %.1f%%   人物高宽比 %.2f"
      % (g["top_pad"] * 100, g["bottom_gap"] * 100, g["height"] * 100, g["width"] * 100, g["aspect"]))
zs = denim_top(still)
if zs is not None:
    top_row = int(round(g["top_pad"] * H))
    bot_row = int(round((g["top_pad"] + g["height"]) * H)) - 1
    print("  裤腰线在人物身高的 %.1f%%（从头顶算）→ 下半身占 %.1f%%"
          % ((zs - top_row) / max(1, bot_row - top_row) * 100,
             100 - (zs - top_row) / max(1, bot_row - top_row) * 100))

cap = cv2.VideoCapture(str(OUT / "free-a.mp4"))
fps = cap.get(cv2.CAP_PROP_FPS)
n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
print("\n== 视频 %d 帧 / %.2f fps ==" % (n, fps))

frames, diffs = [], []
prev = None
for i in range(n):
    ok, fr = cap.read()
    if not ok:
        break
    gg = cv2.cvtColor(fr, cv2.COLOR_BGR2GRAY).astype(np.float32)
    if prev is not None:
        diffs.append(float(np.abs(gg - prev).mean()))
    prev = gg
    if i % max(1, n // 24) == 0:
        frames.append((i / fps, fr))
cap.release()

diffs = np.array(diffs)
print("  逐帧差分 mean %.2f  max %.1f @ %.2fs" % (diffs.mean(), diffs.max(), (diffs.argmax() + 1) / fps))

f0 = frames[0][1]
print("\n== L0 首帧保真 ==")
print("  0s vs 首帧图  整体NCC %.3f" % ncc(f0, still))
try:
    p0 = eye_pair(cv2.cvtColor(f0, cv2.COLOR_BGR2GRAY))
    ps = eye_pair(cv2.cvtColor(still, cv2.COLOR_BGR2GRAY))
    if p0 is not None and ps is not None:
        a0, a1 = crop(align(f0, p0), p0), crop(align(still, ps), ps)
        print("  0s vs 首帧图  眼位对齐NCC %.3f" % score(a0, a1))
    else:
        print("  眼检失败：全身景别下脸太小")
except Exception as e:
    print("  眼检异常", e)

print("\n== L4 逐帧构图 ==")
print("   t(s)  头顶留白  鞋底距  人物高  高宽比")
for t, fr in frames[::2]:
    gg = frame_geom(fr)
    if gg is None:
        print("  %5.2f   —" % t)
        continue
    print("  %5.2f  %6.1f%%  %5.1f%%  %5.1f%%  %5.2f"
          % (t, gg["top_pad"] * 100, gg["bottom_gap"] * 100, gg["height"] * 100, gg["aspect"]))
