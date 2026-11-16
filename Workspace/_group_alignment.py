"""同一尺寸分组：拼一行图 + 人脸对齐后的两两相似度。只读分析。"""
import itertools
import pathlib

import numpy as np
from PIL import Image, ImageDraw

try:
    import cv2
except ImportError:
    cv2 = None

ROOT = pathlib.Path(__file__).resolve().parents[1]
DIR = ROOT / "Log/Circle8/output/v3-fixed10"
W = 480

files = sorted(p for p in DIR.glob("portrait-*.png") if "-grid" not in p.name)
groups: dict = {}
for f in files:
    with Image.open(f) as im:
        groups.setdefault(im.size, []).append(f)


def face_crop(path, size=192):
    img = cv2.imread(str(path))
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    cas = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    rects = cas.detectMultiScale(gray, 1.1, 5, minSize=(80, 80))
    h, w = gray.shape
    if len(rects) == 0:
        side = min(h, w)
        x, y = (w - side) // 2, (h - side) // 2
    else:
        fx, fy, fw, fh = max(rects, key=lambda r: r[2] * r[3])
        side = int(max(fw, fh) * 1.15)
        cx, cy = fx + fw // 2, fy + fh // 2
        x, y = max(0, cx - side // 2), max(0, cy - side // 2)
        side = min(side, w - x, h - y)
    crop = img[y:y + side, x:x + side]
    return cv2.resize(crop, (size, size), interpolation=cv2.INTER_AREA)


for size, items in sorted(groups.items()):
    n = len(items)
    th = round(size[1] * W / size[0])
    row = Image.new("RGB", (n * W, th), (24, 24, 24))
    d = ImageDraw.Draw(row)
    for k, f in enumerate(items):
        with Image.open(f) as im:
            row.paste(im.convert("RGB").resize((W, th), Image.LANCZOS), (k * W, 0))
        d.rectangle([k * W, 0, k * W + 76, 22], fill=(0, 0, 0))
        d.text((k * W + 6, 6), f.stem.split("-")[-1], fill=(0, 255, 255))
    out = DIR / f"group-{size[0]}x{size[1]}.png"
    row.save(out)
    tags = [f.stem.split("-")[-1] for f in items]
    print(f"\n=== {size[0]}x{size[1]}  {tags}")
    print("拼图", out.name, row.size)

    if cv2 is None:
        print("无 cv2，跳过相似度")
        continue
    crops = [face_crop(f) for f in items]
    print("人脸对齐后两两相似度（灰度 Pearson / HSV 直方图相关）：")
    vals = []
    for a, b in itertools.combinations(range(len(crops)), 2):
        ga = cv2.cvtColor(crops[a], cv2.COLOR_BGR2GRAY).astype(np.float32).ravel()
        gb = cv2.cvtColor(crops[b], cv2.COLOR_BGR2GRAY).astype(np.float32).ravel()
        r = float(np.corrcoef(ga, gb)[0, 1])
        ha = cv2.calcHist([crops[a]], [0, 1], None, [32, 32], [0, 180, 0, 256])
        hb = cv2.calcHist([crops[b]], [0, 1], None, [32, 32], [0, 180, 0, 256])
        cv2.normalize(ha, ha)
        cv2.normalize(hb, hb)
        hc = float(cv2.compareHist(ha.astype(np.float32), hb.astype(np.float32),
                                   cv2.HISTCMP_CORREL))
        vals.append((r, hc))
        print(f"  {tags[a]} vs {tags[b]}: 灰度 {r:+.3f}  色彩 {hc:+.3f}")
    if vals:
        arr = np.array(vals)
        print(f"  均值: 灰度 {arr[:, 0].mean():+.3f}  色彩 {arr[:, 1].mean():+.3f}")
