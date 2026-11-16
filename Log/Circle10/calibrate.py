"""Circle10 校准：把两条视频的正脸帧与「已验收的肖像卡静态图」对齐后比相似度。

用途：NCC 没有绝对阈值，需要参照点。这里给三档参照
  静态图 ↔ 静态图（同卡异次，Circle8 已验收为同一人）
  静态图 ↔ 视频（跨模态，同一张卡）
  视频   ↔ 视频（本轮两条）
另加一个「不同人」下界：动作卡视频里的人脸。

用法：python Log/Circle10/calibrate.py
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "Tool" / "_deps"))
sys.path.insert(0, str(ROOT / "Tool" / "_deps_cv4"))
import cv2
import numpy as np

sys.path.insert(0, str(ROOT / "Log" / "Circle10"))
from consistency import align, crop, eye_pair, score  # noqa: E402

OUT = ROOT / "Log" / "Circle10" / "output"
STILLS = {
    "still-880": ROOT / "RAG/portraits/figure-symmetric-cartographer/01-pass-880x1184.png",
    "still-1086": ROOT / "RAG/portraits/figure-symmetric-cartographer/02-pass-1086x1448.png",
}


def face_of_image(path):
    img = cv2.imread(str(path))
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    pair = eye_pair(g)
    if pair is None:
        return None
    return crop(align(img, pair), pair)


def face_of_video(path, t):
    cap = cv2.VideoCapture(str(path))
    cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
    ok, fr = cap.read()
    cap.release()
    if not ok:
        return None
    pair = eye_pair(cv2.cvtColor(fr, cv2.COLOR_BGR2GRAY))
    return None if pair is None else crop(align(fr, pair), pair)


def main():
    faces = {}
    for k, p in STILLS.items():
        f = face_of_image(p)
        print(k, "眼位对齐", "OK" if f is not None else "★未检出")
        if f is not None:
            faces[k] = f
            cv2.imwrite(str(OUT / f"_{k}_aligned.png"), f)

    for tag, t in (("a3", 3.0), ("a5", 5.0), ("b3", 3.0), ("b5", 5.0)):
        v = "a" if tag.startswith("a") else "b"
        f = face_of_video(OUT / f"v1-{v}.mp4", t)
        if f is not None:
            faces[tag] = f
            cv2.imwrite(str(OUT / f"_vid-{tag}_aligned.png"), f)
        print("vid-" + tag, "眼位对齐", "OK" if f is not None else "★未检出")

    print("\n=== 三档参照 NCC ===")
    names = list(faces)
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            x, y = names[i], names[j]
            print("  %-12s ↔ %-12s  %.3f" % (x, y, score(faces[x], faces[y])))

    if "still-880" in faces and "still-1086" in faces:
        print("\n参考口径：静态图之间（同卡异次验收为同一人）= %.3f" %
              score(faces["still-880"], faces["still-1086"]))


if __name__ == "__main__":
    main()
