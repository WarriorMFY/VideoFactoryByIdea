# -*- coding: utf-8 -*-
"""分区度量：判断「变了多少／变在哪」。

用法:
  python measure_zones.py --video out/s1.mp4 [--video out/s1e.mp4 ...] \
      [--ref keys/S1-first-f0.png] [--diff out.png] [--json metrics.json]

口径（见 reference/metrics.md）:
  - NCC(f0, ref)  首帧锚是否生效，≥0.90 视为锚住
  - NCC(fn, ref)  末帧整体偏离，仅作参考，**不能单独用来判「变了多少」**
  - 3×3 分区差     必看。局部事件会被全幅均值稀释，只有分区能看见
  - 直方图相关     片内色相是否稳定，判画风漂移
"""
import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np

sys.stdout.reconfigure(encoding="utf-8")
cv2.setNumThreads(2)


def read_frames(path):
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        sys.exit("打不开视频：%s" % path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 24.0
    fs = []
    while True:
        ok, f = cap.read()
        if not ok:
            break
        fs.append(f)
    cap.release()
    if not fs:
        sys.exit("空视频：%s" % path)
    return fs, fps


def ncc(a, b, size=512):
    ia = cv2.cvtColor(cv2.resize(a, (size, size)), cv2.COLOR_BGR2GRAY).astype(np.float32)
    ib = cv2.cvtColor(cv2.resize(b, (size, size)), cv2.COLOR_BGR2GRAY).astype(np.float32)
    ia -= ia.mean()
    ib -= ib.mean()
    den = float(np.sqrt((ia * ia).sum() * (ib * ib).sum()))
    return 0.0 if den == 0 else float((ia * ib).sum() / den)


def hist_corr(a, b):
    ha = cv2.calcHist([cv2.cvtColor(a, cv2.COLOR_BGR2HSV)], [0, 1], None,
                      [18, 16], [0, 180, 0, 256])
    hb = cv2.calcHist([cv2.cvtColor(b, cv2.COLOR_BGR2HSV)], [0, 1], None,
                      [18, 16], [0, 180, 0, 256])
    cv2.normalize(ha, ha)
    cv2.normalize(hb, hb)
    return float(cv2.compareHist(ha, hb, cv2.HISTCMP_CORREL))


def zone_diff(f0, fn, grid=3):
    """末帧相对首帧的最大通道差，按 grid×grid 分区求均值。"""
    d = np.abs(fn.astype(np.int16) - f0.astype(np.int16)).max(axis=2)
    h, w = d.shape
    cells = []
    for r in range(grid):
        row = []
        for c in range(grid):
            y0, y1 = r * h // grid, (r + 1) * h // grid
            x0, x1 = c * w // grid, (c + 1) * w // grid
            row.append(round(float(d[y0:y1, x0:x1].mean()), 2))
        cells.append(row)
    return cells, round(float(d.mean()), 2), d


def measure(path, ref_img=None, diff_out=None):
    fs, fps = read_frames(path)
    f0, fn = fs[0], fs[-1]
    h, w = f0.shape[:2]
    m = {"video": str(path), "frames": len(fs), "size": "%dx%d" % (w, h),
         "dur": round(len(fs) / fps, 3)}

    ref = None
    if ref_img is not None:
        ref = cv2.imread(str(ref_img))
        if ref is None:
            sys.exit("读不到参照帧：%s" % ref_img)
        ref = cv2.resize(ref, (w, h), interpolation=cv2.INTER_AREA)
        m["ref"] = str(ref_img)
        m["ncc_f0_ref"] = round(ncc(f0, ref), 4)
        m["ncc_fn_ref"] = round(ncc(fn, ref), 4)

    m["ncc_f0_fn"] = round(ncc(f0, fn), 4)
    cells, all_d, dmap = zone_diff(f0, fn)
    m["diff_all"] = all_d
    m["diff_grid"] = cells
    m["diff_left"] = round(float(dmap[:, :w // 2].mean()), 2)
    m["diff_right"] = round(float(dmap[:, w // 2:].mean()), 2)
    m["diff_center"] = round(float(dmap[int(h * 0.2):int(h * 0.8),
                                       int(w * 0.3):int(w * 0.7)].mean()), 2)

    base = f0 if ref is None else ref
    step = max(1, len(fs) // 12)
    hc = [hist_corr(base, f) for f in fs[::step]]
    m["hist_corr_mean"] = round(float(np.mean(hc)), 4)
    m["hist_corr_min"] = round(float(np.min(hc)), 4)

    series = [float(np.abs(f.astype(np.int16) - f0.astype(np.int16)).max(axis=2).mean())
              for f in fs[::max(1, len(fs) // 24)]]
    m["diff_series"] = [round(v, 2) for v in series]

    if diff_out:
        cap = cv2.applyColorMap(cv2.convertScaleAbs(dmap, alpha=3.0), cv2.COLORMAP_JET)
        cv2.imwrite(str(diff_out), cv2.addWeighted(fn, 0.55, cap, 0.45, 0))
        m["diff_png"] = str(diff_out)
    return m


def find_ref(refdir, video):
    """按段名前缀找该段的首帧：keys/S1-first-f0.png。"""
    stem = Path(video).stem
    cands = sorted(Path(refdir).glob("%s-first-*.png" % stem))
    return cands[0] if cands else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", action="append", required=True, help="可重复")
    ap.add_argument("--ref", default=None, help="单条视频用的首帧参照；多段请改用 --refdir")
    ap.add_argument("--refdir", default=None,
                    help="按段名前缀自动匹配首帧的目录（如 keys）")
    ap.add_argument("--diff", default=None, help="差异热力图输出（仅单条视频时有效）")
    ap.add_argument("--json", default=None)
    a = ap.parse_args()

    out = []
    for v in a.video:
        ref = Path(a.ref) if a.ref else None
        if ref is None and a.refdir:
            ref = find_ref(a.refdir, v)
            if ref is None:
                print("[%s] 在 %s 没找到 %s-first-*.png，跳过锚指标"
                      % (Path(v).stem, a.refdir, Path(v).stem))
        diff = a.diff if (a.diff and len(a.video) == 1) else None
        m = measure(v, ref, diff)
        out.append(m)
        print("\n=== %s ===" % Path(v).name)
        line = "帧%d %.2fs %s" % (m["frames"], m["dur"], m["size"])
        if "ncc_f0_ref" in m:
            line += " | 锚 f0 %.4f  fn %.4f" % (m["ncc_f0_ref"], m["ncc_fn_ref"])
        print(line)
        print("分区差（末帧 vs 首帧）  全幅 %.2f  左 %.2f  右 %.2f  中央 %.2f"
              % (m["diff_all"], m["diff_left"], m["diff_right"], m["diff_center"]))
        for row in m["diff_grid"]:
            print("   " + "".join("%8.2f" % c for c in row))
        print("片内直方图相关  均值 %.3f  最低 %.3f" % (m["hist_corr_mean"], m["hist_corr_min"]))
    if a.json:
        Path(a.json).write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
        print("\n写出 %s" % a.json)


if __name__ == "__main__":
    main()
