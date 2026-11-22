"""一张底图 + 一条生成片，判它能不能首尾相接。

四问：
  seam      末帧与底图整体相不相似（NCC）
  drift     背景有没有被顺手改写（低频偏移，比 seam 更要命）
  exit      周期末主体是否已离场（高差面积 / 全程峰值）
  dir       末段运动方向 vs 首段方向是否同向（接上下一圈时速度连不连续）

用法：
  python loop-check.py --base frames/P.png --video out.mp4 [--out 目录]
"""
import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np

HI = 26          # 高差阈值：算「主体区域」用
DRIFT_SIGMA = 9  # 低频用的模糊半径


def imread_u(p):
    b = np.fromfile(str(p), np.uint8)
    return cv2.imdecode(b, cv2.IMREAD_COLOR) if b.size else None


def imwrite_u(p, img):
    ok, buf = cv2.imencode(Path(p).suffix or ".png", img)
    if ok:
        Path(p).write_bytes(buf.tobytes())
    return ok


def ncc(a, b):
    a = a.astype(np.float32) - a.mean()
    b = b.astype(np.float32) - b.mean()
    den = float(np.sqrt((a * a).sum() * (b * b).sum()))
    return float((a * b).sum() / den) if den else 0.0


def flow_dir(frames, mask):
    """对一段帧算 Farneback 光流，返回 mask 内的平均方向（度）。"""
    vs = []
    for i in range(len(frames) - 1):
        g1 = cv2.cvtColor(frames[i], cv2.COLOR_BGR2GRAY)
        g2 = cv2.cvtColor(frames[i + 1], cv2.COLOR_BGR2GRAY)
        f = cv2.calcOpticalFlowFarneback(g1, g2, None, 0.5, 3, 15, 3, 5, 1.2, 0)
        if mask is not None:
            sel = mask > 0
            if sel.sum() < 50:
                continue
            vx, vy = float(f[..., 0][sel].mean()), float(f[..., 1][sel].mean())
        else:
            vx, vy = float(f[..., 0].mean()), float(f[..., 1].mean())
        vs.append((vx, vy))
    if not vs:
        return None, 0.0
    vx = float(np.mean([v[0] for v in vs]))
    vy = float(np.mean([v[1] for v in vs]))
    mag = float(np.hypot(vx, vy))
    return float(np.degrees(np.arctan2(vy, vx))), mag


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True, help="关键帧（基准态底图）")
    ap.add_argument("--video", required=True)
    ap.add_argument("--out", default=None, help="留图目录，默认与视频同目录")
    a = ap.parse_args()

    base = imread_u(a.base)
    if base is None:
        print(f"底图读不出来: {a.base}", file=sys.stderr)
        return 2
    size = (base.shape[1], base.shape[0])
    base_g = cv2.cvtColor(base, cv2.COLOR_BGR2GRAY)

    cap = cv2.VideoCapture(a.video)
    frames, diffs = [], []
    while True:
        ok, f = cap.read()
        if not ok:
            break
        if f.shape[1::-1] != size:
            f = cv2.resize(f, size, interpolation=cv2.INTER_AREA)
        frames.append(f)
        diffs.append(cv2.absdiff(cv2.cvtColor(f, cv2.COLOR_BGR2GRAY), base_g))
    cap.release()
    if len(frames) < 4:
        print("视频帧太少", file=sys.stderr)
        return 2

    last, d_last = frames[-1], diffs[-1]

    # 1) seam：末帧与底图的绝对相似度
    seam = ncc(cv2.cvtColor(last, cv2.COLOR_BGR2GRAY), base_g)

    # 1b) 帧间基线：正常播放时相邻帧像到什么程度。接缝要和「正常帧间变化」比，
    #     而不是和一个绝对阈值比——古画的绢纹是高频，绝对 NCC 天然偏低。
    step = max(1, len(frames) // 40)
    f2f = [ncc(cv2.cvtColor(frames[i], cv2.COLOR_BGR2GRAY),
               cv2.cvtColor(frames[i + 1], cv2.COLOR_BGR2GRAY))
           for i in range(0, len(frames) - 1, step)]
    fps_ncc = float(np.median(f2f)) if f2f else 1.0
    seam_ratio = seam / fps_ncc if fps_ncc else 0.0

    # 2) drift：低频偏移。主体是局部高频变化，整幅改色会落在低频上。
    #    但大面积主体位移（如花瓣被拖动）也会拉高低频——先挖掉主体区再算。
    def lo(img):
        return cv2.GaussianBlur(img.astype(np.float32), (0, 0), DRIFT_SIGMA)
    d_lo = np.abs(lo(cv2.cvtColor(last, cv2.COLOR_BGR2GRAY)) - lo(base_g))
    act = np.zeros_like(d_lo, np.uint8)
    for d in diffs:
        act |= (d > HI).astype(np.uint8)
    act = cv2.dilate(act, np.ones((15, 15), np.uint8), iterations=2)
    keep = act == 0
    if keep.sum() < d_lo.size * 0.1:      # 主体几乎占满，drift 无从谈起
        keep = np.ones_like(keep, bool)
    drift = float(np.median(d_lo[keep]))
    drift_p99 = float(np.percentile(d_lo[keep], 99))

    # 3) exit：末帧高差面积 / 全程峰值
    areas = [float((d > HI).sum()) / d.size for d in diffs]
    peak = max(areas) or 1e-9
    exit_ratio = areas[-1] / peak
    tail = areas[-max(2, len(areas) // 10):]
    tail_slope = (tail[-1] - tail[0]) / max(1, len(tail) - 1)

    # 4) dir：末段 vs 首段
    seg = max(6, len(frames) // 12)
    m_first = (diffs[min(seg, len(diffs) - 1)] > HI).astype(np.uint8)
    m_last = (d_last > HI).astype(np.uint8)
    dir_first, mag_first = flow_dir(frames[:seg + 1], m_first if m_first.sum() > 50 else None)
    dir_last, mag_last = flow_dir(frames[-seg - 1:], m_last if m_last.sum() > 50 else None)
    if dir_first is None or dir_last is None:
        dir_gap = None
    else:
        dir_gap = abs((dir_last - dir_first + 180) % 360 - 180)

    # 判定
    verdict = []
    verdict.append(("seam", f"{seam:.4f} (帧间基线 {fps_ncc:.4f})",
                    "过" if seam >= 0.95 else ("勉强" if seam >= 0.90 else "不过")))
    verdict.append(("ratio", f"{seam_ratio:.3f}", "过" if seam_ratio >= 0.98 else ("勉强" if seam_ratio >= 0.95 else "不过")))
    verdict.append(("drift", f"{drift:.2f} / p99 {drift_p99:.1f}", "过" if drift_p99 <= 12 else "不过"))
    verdict.append(("exit", f"{exit_ratio*100:.1f}% (斜 {tail_slope*100:+.2f}%/帧)",
                    "已离场" if exit_ratio <= 0.15 else ("正在离场" if exit_ratio <= 0.45 else "还在场内")))
    if dir_gap is None:
        verdict.append(("dir", "算不出（主体太小）", "—"))
    else:
        verdict.append(("dir", f"差 {dir_gap:.0f}°", "同向" if dir_gap <= 60 else "反向/乱"))

    print(f"{Path(a.video).parent.name or a.video}  {len(frames)}帧  {size[0]}x{size[1]}")
    for k, v, j in verdict:
        print(f"  {k:6s} {v:32s} {j}")

    ok = (seam_ratio >= 0.95 and drift_p99 <= 12 and exit_ratio <= 0.45)
    print(f"  => {'可接' if ok else '不可接'}（接缝可交剪辑补：ratio<1 就必有跳，crossfade 能吃掉）")

    outdir = Path(a.out) if a.out else Path(a.video).parent
    outdir.mkdir(parents=True, exist_ok=True)
    (outdir / "loopcheck.json").write_text(json.dumps({
        "base": str(a.base), "video": str(a.video), "frames": len(frames),
        "seam": round(seam, 4), "fps_ncc": round(fps_ncc, 4),
        "seam_ratio": round(seam_ratio, 4), "drift_median": round(drift, 2),
        "drift_p99": round(drift_p99, 2), "exit_ratio": round(exit_ratio, 4),
        "tail_slope": round(tail_slope, 6), "dir_first": dir_first,
        "dir_last": dir_last, "dir_gap": dir_gap, "ok": ok,
    }, ensure_ascii=False, indent=1), encoding="utf-8")

    # 可视化：底图 | 末帧 | 高差图 | 低频漂移图
    heat = cv2.applyColorMap(cv2.normalize(d_last, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8),
                             cv2.COLORMAP_INFERNO)
    dlow = cv2.normalize(d_lo, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
    dlow = cv2.applyColorMap(dlow, cv2.COLORMAP_TURBO)
    tiles = [base, last, heat, dlow]
    h = 420
    tiles = [cv2.resize(t, (int(t.shape[1] * h / t.shape[0]), h)) for t in tiles]
    labels = ["base", "last", "|last-base|", "lowfreq drift"]
    canvas = []
    for t, lab in zip(tiles, labels):
        c = np.full((h + 22, t.shape[1], 3), 250, np.uint8)
        c[22:] = t
        cv2.putText(c, lab, (6, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 200), 1, cv2.LINE_AA)
        canvas.append(c)
    imwrite_u(outdir / "loopcheck.png", np.hstack(canvas))
    return 0


if __name__ == "__main__":
    sys.exit(main())
