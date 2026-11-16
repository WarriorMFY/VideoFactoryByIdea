"""副实验 B 体检：一条 5s 走秀片横跨四档景别，按景别分档看肖像对齐度。

景别用「全脸框高 / 画幅高」分档：
  band1 远景   fh < 0.10
  band2 七分身 0.10 ≤ fh < 0.18
  band3 半身   0.18 ≤ fh < 0.30
  band4 胸像   fh ≥ 0.30
每档给出：帧数、平均脸高比、瞳孔距/画幅、对两张入库样张的眼位对齐 NCC（有眼位才算）。

用法：python Log/Circle10/runway/measure_runway.py
"""
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(ROOT / "Log" / "Circle10"))
sys.path.insert(0, str(ROOT / "Tool" / "_deps"))
sys.path.insert(0, str(ROOT / "Tool" / "_deps_cv4"))
import cv2
import numpy as np
from consistency import FACE, eye_pair, align, crop, score

OUT = HERE / "output"
RAG = ROOT / "RAG" / "portraits" / "figure-symmetric-cartographer"
VIDEOS = {"a": OUT / "r1-a.mp4", "b": OUT / "r1-b.mp4"}
BANDS = [(0.0, 0.10, "远景/全身"), (0.10, 0.18, "七分身"), (0.18, 0.30, "半身"), (0.30, 9.9, "胸像/近景")]


def still_crop(p):
    im = cv2.imread(str(p))
    pr = eye_pair(cv2.cvtColor(im, cv2.COLOR_BGR2GRAY))
    return crop(align(im, pr), pr) if pr else None


def main():
    refs = {"880": still_crop(RAG / "01-pass-880x1184.png"),
            "1086": still_crop(RAG / "02-pass-1086x1448.png")}

    for k, path in VIDEOS.items():
        if not path.exists():
            print(f"\n{k}: 文件不存在，跳过")
            continue
        cap = cv2.VideoCapture(str(path))
        fps = cap.get(cv2.CAP_PROP_FPS)
        W = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)); H = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        rows, i, prev = [], 0, None
        while True:
            ok, fr = cap.read()
            if not ok:
                break
            g = cv2.cvtColor(fr, cv2.COLOR_BGR2GRAY)
            diff = float(np.abs(g.astype(np.float32) - prev).mean()) if prev is not None else 0.0
            prev = g.astype(np.float32)
            faces = FACE.detectMultiScale(g, 1.08, 4, minSize=(24, 24))
            fh = max(faces, key=lambda r: r[2] * r[3])[3] / H if len(faces) else 0.0
            pr = eye_pair(g)
            row = {"t": i / fps, "fh": fh, "diff": diff, "eyes": pr is not None}
            if pr is not None:
                (x1, y1, w1, h1), (x2, y2, w2, h2) = pr
                ipd = float(np.hypot(x2 + w2 / 2 - x1 - w1 / 2, y2 + h2 / 2 - y1 - h1 / 2))
                row["ipd"] = ipd / W
                c = crop(align(fr, pr), pr)
                row["crop"] = c
                for name, ref in refs.items():
                    if ref is not None:
                        row[name] = score(c, ref)
            rows.append(row)
            i += 1
        cap.release()

        print(f"\n===== {k} =====")
        print(f"{W}×{H}  {len(rows)} 帧  fps {fps:.1f}")
        fhs = np.array([r["fh"] for r in rows])
        print("全脸框高/画幅：0s %.3f → 末帧 %.3f  (max %.3f)" %
              (fhs[0], fhs[-1], fhs.max()))
        print("逐帧差分 mean %.2f  peak %.2f" % (np.mean([r["diff"] for r in rows]), max(r["diff"] for r in rows)))
        print("眼位检出 %d/%d" % (sum(r["eyes"] for r in rows), len(rows)))

        print("\n%-10s %4s %8s %8s %8s %8s %8s" % ("景别档", "帧", "脸高比", "瞳距/幅", "对880", "对1086", "帧内NCC"))
        for lo, hi, label in BANDS:
            sub = [r for r in rows if lo <= r["fh"] < hi]
            if not sub:
                print("%-10s %4d   —" % (label, 0))
                continue
            ipds = [r["ipd"] for r in sub if "ipd" in r]
            n80 = np.mean([r["880"] for r in sub if "880" in r]) if any("880" in r for r in sub) else None
            n86 = np.mean([r["1086"] for r in sub if "1086" in r]) if any("1086" in r for r in sub) else None
            w = [r for r in sub if "crop" in r]
            intra = np.mean([score(w[0]["crop"], r["crop"]) for r in w]) if len(w) > 1 else None
            print("%-10s %4d %8.3f %8s %8s %8s %8s" % (
                label, len(sub), np.mean([r["fh"] for r in sub]),
                "%.3f" % np.mean(ipds) if ipds else "—",
                "%.3f" % n80 if n80 else "—",
                "%.3f" % n86 if n86 else "—",
                "%.3f" % intra if intra else "—"))

        # 抽帧联络表
        tiles = []
        for t in np.linspace(0, max(r["t"] for r in rows), 6):
            r = min(rows, key=lambda r: abs(r["t"] - t))
            idx = int(round(r["t"] * fps))
            cap = cv2.VideoCapture(str(path)); cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
            ok, fr = cap.read(); cap.release()
            if not ok:
                continue
            fr = cv2.resize(fr, (320, 416), interpolation=cv2.INTER_AREA)
            cv2.putText(fr, "%.1fs fh%.2f" % (r["t"], r["fh"]), (8, 24),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 255), 2, cv2.LINE_AA)
            tiles.append(fr)
        if tiles:
            cv2.imwrite(str(OUT / f"_{k}_sheet.png"), np.hstack(tiles))
            print("SHEET", OUT / f"_{k}_sheet.png")


if __name__ == "__main__":
    main()
