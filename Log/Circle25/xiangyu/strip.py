"""把每条视频的 6 个时间点与锚图横排成对照条，供目检。"""
import cv2, numpy as np
from pathlib import Path

ROOT = Path(__file__).parent / "out" / "runs"
IDX = [0, 31, 62, 93, 123]
CELL_H = 420

def rd(p):
    b = np.fromfile(str(p), np.uint8)
    return cv2.imdecode(b, cv2.IMREAD_COLOR) if b.size else None

def wr(p, img):
    ok, b = cv2.imencode(".png", img)
    if ok: Path(p).write_bytes(b.tobytes())

for run in sorted(p for p in ROOT.iterdir() if p.is_dir()):
    vid = run / "out.mp4"
    if not vid.exists(): continue
    cap = cv2.VideoCapture(str(vid))
    frames = {}
    i = 0
    while True:
        ok, f = cap.read()
        if not ok: break
        if i in IDX: frames[i] = f
        i += 1
    cap.release()
    anchor = rd(run / "anchor.png")
    tiles = [("anchor", anchor)]
    for i in IDX:
        if i in frames: tiles.append((f"f{i}", frames[i]))
    scaled = []
    for name, img in tiles:
        s = CELL_H / img.shape[0]
        t = cv2.resize(img, (int(img.shape[1] * s), CELL_H), interpolation=cv2.INTER_AREA)
        canvas = np.full((CELL_H + 22, t.shape[1], 3), 250, np.uint8)
        canvas[22:, :] = t
        cv2.putText(canvas, name, (6, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 200), 1, cv2.LINE_AA)
        scaled.append(canvas)
    sheet = np.hstack(scaled)
    out = run / "strip.png"
    wr(out, sheet)
    print(run.name, sheet.shape, "帧数", i)
