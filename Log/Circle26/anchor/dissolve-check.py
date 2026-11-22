"""判「中间是运镜还是溶解」：逐帧算三条曲线。

    python dissolve-check.py <video> <首帧> <尾帧>

三条曲线：
  nccA / nccB   每帧与首锚、尾锚的结构相似。真运镜大体单调过渡；溶解会出现「两头都快、中间发黏」
  hf            每帧限带后的细节密度。**溶解的指纹是中间塌下去**——两张错位的图平均，
                高频必然被抹掉；真运镜的高频是连续的，不会在中间挖个坑
  dframe        相邻帧平均绝对差。溶解的中段是恒定中等速度的匀速变化，运镜则是「起手快、到位缓」

判据：hf 曲线中段（30%–70%）均值 ÷ 两端均值 < 0.75 → 判溶解。
"""
import json
import sys
from pathlib import Path

import cv2
import numpy as np

W = 720  # 成片宽度，统一在这一档算


def imread_u(p):
    buf = np.fromfile(str(p), dtype=np.uint8)
    img = cv2.imdecode(buf, cv2.IMREAD_COLOR) if buf.size else None
    if img is None:
        sys.exit(f"读不到 {p}")
    return img


def prep(img, w=W):
    h = round(img.shape[0] * w / img.shape[1])
    return cv2.resize(img, (w, h), interpolation=cv2.INTER_AREA)


def gray(img):
    return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)


def ncc(a, b):
    a = a.astype(np.float32) - a.mean()
    b = b.astype(np.float32) - b.mean()
    d = np.sqrt((a * a).sum() * (b * b).sum())
    return float((a * b).sum() / d) if d else 0.0


def main() -> int:
    if len(sys.argv) < 4:
        sys.exit("用法：dissolve-check.py <video> <首帧> <尾帧>")
    vid, fp, lp = sys.argv[1:4]
    cap = cv2.VideoCapture(str(vid))
    if not cap.isOpened():
        sys.exit(f"打不开 {vid}")
    frames = []
    while True:
        ok, f = cap.read()
        if not ok:
            break
        frames.append(prep(f))
    cap.release()
    if len(frames) < 5:
        sys.exit("帧数太少")

    vh, vw = frames[0].shape[:2]

    def to_video(img):
        return gray(cv2.resize(img, (vw, vh), interpolation=cv2.INTER_AREA))

    A = to_video(imread_u(fp))
    B = to_video(imread_u(lp))
    gs = [gray(f) for f in frames]

    rows = []
    for i, g in enumerate(gs):
        rows.append({
            "i": i,
            "nccA": round(ncc(g, A), 4),
            "nccB": round(ncc(g, B), 4),
            "hf": round(float(cv2.Laplacian(g, cv2.CV_64F).var()), 1),
            "dframe": round(float(np.abs(g.astype(np.int16) - gs[i - 1].astype(np.int16)).mean()), 2) if i else 0.0,
        })

    n = len(rows)
    mid = rows[int(n * 0.3):int(n * 0.7)]
    ends = rows[: int(n * 0.2)] + rows[int(n * 0.8):]
    hf_mid = float(np.mean([r["hf"] for r in mid]))
    hf_end = float(np.mean([r["hf"] for r in ends]))
    ratio = hf_mid / hf_end if hf_end else 0.0

    # 单调性：nccA 应该大体一路走低
    na = [r["nccA"] for r in rows]
    inc = sum(1 for i in range(1, n) if na[i] > na[i - 1] + 0.005)
    # 快速运镜本身会带来运动模糊，高频同样塌——所以 hf 塌陷必须配上「中段不快」才算溶解
    d_mid = float(np.mean([r["dframe"] for r in mid]))
    d_end = float(np.mean([r["dframe"] for r in ends]))
    if ratio < 0.75 and d_mid <= 1.1 * d_end:
        verdict = "溶解"
    elif ratio < 0.75:
        verdict = "运镜·带运动模糊（hf 塌但帧间差在涨）"
    else:
        verdict = "运镜"

    out = {
        "video": str(vid), "frames": n,
        "hf_mid": round(hf_mid, 1), "hf_end": round(hf_end, 1), "hf_ratio": round(ratio, 3),
        "nccA_first": na[0], "nccA_last": na[-1], "nccA_rises": inc,
        "dframe_max": max(r["dframe"] for r in rows),
        "dframe_mid_mean": round(d_mid, 2), "dframe_end_mean": round(d_end, 2),
        "verdict": verdict,
        "curve": rows,
    }
    dst = Path(vid).with_name(Path(vid).stem + "-dissolve.json")
    dst.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"frames={n}  hf 中段/两端 = {hf_mid:.1f}/{hf_end:.1f} = {ratio:.3f} -> 判 {verdict}")
    print(f"nccA 首→末 {na[0]} -> {na[-1]}，反向抬升次数 {inc}")
    print(f"帧间差 峰值 {out['dframe_max']}，中段均值 {out['dframe_mid_mean']}")
    print("i  nccA   nccB   hf    dframe")
    for r in rows[::max(1, n // 12)]:
        print(f"{r['i']:<3}{r['nccA']:<7}{r['nccB']:<7}{r['hf']:<7}{r['dframe']}")

    # 曲线图
    chart = np.full((300, 720, 3), 24, np.uint8)
    for key, color, scale in (("nccA", (90, 200, 255), 1.0), ("nccB", (120, 255, 160), 1.0)):
        pts = []
        for r in rows:
            x = int(r["i"] / max(1, n - 1) * 700) + 10
            y = int(280 - r[key] * 260 * scale)
            pts.append((x, y))
        cv2.polylines(chart, [np.array(pts, np.int32)], False, color, 2)
    hmax = max(r["hf"] for r in rows) or 1
    pts = [(int(r["i"] / max(1, n - 1) * 700) + 10, int(280 - r["hf"] / hmax * 150)) for r in rows]
    cv2.polylines(chart, [np.array(pts, np.int32)], False, (255, 140, 90), 1)
    cv2.putText(chart, "nccA(yellow) nccB(green) hf(blue,scaled)", (10, 20),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)
    cv2.putText(chart, f"hf_ratio={ratio:.2f} -> {verdict}", (10, 44),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)
    ok, buf = cv2.imencode(".png", chart)
    Path(vid).with_name("dissolve-curve.png").write_bytes(buf.tobytes())
    print(f"\n[dissolve] -> {dst}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
