"""副实验 B 体检 v2：先切段，再在段内用带守卫的眼位算身份对齐。

被 v1 打脸的两件事：
  1) 全身帧里眼级联会错锁（瞳距/画幅 0.62 出现在脸只占 3.6% 的帧上，不可能）；
  2) 极特写帧里全脸级联漏检（fh=0），把「近景」误归到「远景」档。
所以 v2 改为：眼位为主、脸框为辅，并加两条守卫（瞳距占比区间 + 眼心必须落在脸框内）。

用法：python Log/Circle10/runway/measure2.py
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
from consistency import FACE, EYE, eye_pair, align, crop, score

OUT = HERE / "output"
RAG = ROOT / "RAG" / "portraits" / "figure-symmetric-cartographer"
VIDEOS = {"a": OUT / "r1-a.mp4", "b": OUT / "r1-b.mp4"}


def still_crop(p):
    im = cv2.imread(str(p))
    pr = eye_pair(cv2.cvtColor(im, cv2.COLOR_BGR2GRAY))
    return crop(align(im, pr), pr) if pr else None


def guarded_pair(g, face):
    """返回可信眼对：瞳距占画幅 0.20–0.75；有脸框时两眼中点须在框内。"""
    pr = eye_pair(g)
    if pr is None:
        return None
    (x1, y1, w1, h1), (x2, y2, w2, h2) = pr
    W = g.shape[1]
    ipd = float(np.hypot(x2 + w2 / 2 - x1 - w1 / 2, y2 + h2 / 2 - y1 - h1 / 2))
    if not (0.20 * W <= ipd <= 0.75 * W):
        return None
    if face is not None:
        fx, fy, fw, fh = face
        for (x, y, w, h) in pr:
            cx, cy = x + w / 2, y + h / 2
            if not (fx - 0.2 * fw <= cx <= fx + 1.2 * fw and fy - 0.2 * fh <= cy <= fy + 1.2 * fh):
                return None
    return pr


def load(path):
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
        face = max(faces, key=lambda r: r[2] * r[3]) if len(faces) else None
        row = {"t": i / fps, "diff": diff, "fr": fr,
               "fh": (face[3] / H) if face is not None else 0.0}
        pr = guarded_pair(g, face)
        if pr is not None:
            (x1, y1, w1, h1), (x2, y2, w2, h2) = pr
            ipd = float(np.hypot(x2 + w2 / 2 - x1 - w1 / 2, y2 + h2 / 2 - y1 - h1 / 2))
            row["ipd"] = ipd / W
            row["crop"] = crop(align(fr, pr), pr)
        rows.append(row)
        i += 1
    cap.release()
    return rows, fps, W, H


def main():
    refs = {"880": still_crop(RAG / "01-pass-880x1184.png"),
            "1086": still_crop(RAG / "02-pass-1086x1448.png")}
    R = {}
    for k, p in VIDEOS.items():
        if p.exists():
            R[k] = load(p)
    if not R:
        print("没有片子")
        return

    for k, (rows, fps, W, H) in R.items():
        print(f"\n===== r1-{k} =====")
        print(f"{W}×{H}  {len(rows)} 帧  fps {fps:.1f}")
        d = np.array([r["diff"] for r in rows])
        cut_i = int(d.argmax())
        print("最大跳变 %.1f @ %.2fs（fps24，约第 %d 帧）" % (d.max(), rows[cut_i]["t"], cut_i))
        seg1 = [r for r in rows if r["t"] < rows[cut_i]["t"] - 0.05]
        seg2 = [r for r in rows if r["t"] >= rows[cut_i]["t"] - 0.05]
        for name, seg in (("走秀段", seg1), ("近景段", seg2)):
            if not seg:
                continue
            fh = np.array([r["fh"] for r in seg])
            ips = [r["ipd"] for r in seg if "ipd" in r]
            print("  %s  %.2f–%.2fs  %d 帧" % (name, seg[0]["t"], seg[-1]["t"], len(seg)))
            print("   脸框高/画幅  %.3f → %.3f" % (fh[0], fh[-1]))
            print("   可信眼位 %d/%d   瞳距/幅 %s" % (
                len(ips), len(seg), ("%.3f–%.3f" % (min(ips), max(ips))) if ips else "—"))
            got = [r for r in seg if "crop" in r]
            if len(got) >= 3:
                n80 = np.mean([score(r["crop"], refs["880"]) for r in got]) if refs["880"] is not None else None
                n86 = np.mean([score(r["crop"], refs["1086"]) for r in got]) if refs["1086"] is not None else None
                intra = np.mean([score(got[0]["crop"], r["crop"]) for r in got])
                print("   对 880 %.3f   对 1086 %.3f   段内自比 %.3f  (n=%d)" %
                      (n80, n86, intra, len(got)))

    # 跨片：同一时间点，取两片都可测的帧
    if len(R) == 2:
        a, b = R["a"][0], R["b"][0]
        print("\n===== 跨片（同 t，最近帧）=====")
        pairs = []
        for r in a:
            if "crop" not in r:
                continue
            m = [x for x in b if "crop" in x]
            if not m:
                continue
            x = min(m, key=lambda x: abs(x["t"] - r["t"]))
            if abs(x["t"] - r["t"]) <= 0.06:
                pairs.append((r["t"], score(r["crop"], x["crop"])))
        if pairs:
            v = np.array([p[1] for p in pairs])
            print("可配帧 %d   mean %.3f  min %.3f  max %.3f" % (len(v), v.mean(), v.min(), v.max()))
            for t in (1.0, 2.0, 3.0, 4.0, 4.9):
                if pairs:
                    t0, s = min(pairs, key=lambda p: abs(p[0] - t))
                    print("   t=%.1fs  %.3f" % (t0, s))


if __name__ == "__main__":
    main()
