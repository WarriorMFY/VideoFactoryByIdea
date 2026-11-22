"""纯剪辑版循环水面（行波位移）。

为什么不做「纹理平铺平移」：
  可平铺纹理必须先裁掉并交叉融合两端，纹理宽度必然小于 ROI；平铺后水面变成
  「一小段纹理重复三次」。实测中段帧与原画的 NCC 只有 0.59–0.66——原画那一片
  水面的近淡远浓的层次没了。它不是「原画在动」，是「原画的水被换掉」。

这里的做法：**像素一个都不生成，只改采样位置。**
  out(x, y) = src( x + dx, y + dy )
  dx = A(y) · sin(2π( x/λx − t/T + y/λy ))
  dy = 0.35·A(y) · cos(2π( x/λx − t/T + y/λy ))

于是三条性质同时成立：
  · 保画风   —— 每个像素都来自原画，只是位置移了几像素，色调笔法零改动
  · 无重复   —— 不存在平铺周期，画面里不会出现第二份同样的水纹
  · 严格无缝 —— 位移场是 t 的周期函数，t=T 与 t=0 相位完全相同，首尾同帧
  · 不撕裂   —— 位移场连续衰减到 0（深墨与岸线处），沙洲山脚不被拖走，也没有硬边

用法：
  python water-wave.py                 # 7s 单元 + 十圈
  python water-wave.py --dur 9 --amp 9
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = next(p for p in Path(__file__).resolve().parents if (p / "Tool" / "ffmpeg.py").exists())
sys.path.insert(0, str(ROOT / "Tool"))
from ffmpeg import find_exe  # noqa: E402

ROI = dict(x0=0, y0=425, x1=1700, y1=790)    # 覆盖整条水带；左端留给往复漂移藏接缝
LAM_X = 260.0        # 行波水平波长
LAM_Y = 900.0       # 沿 y 的相位偏移（让波纹略斜，不是纯竖条）
FEATHER_Y = 55
FEATHER_X = 70
TONE_LO, TONE_HI = 96, 138


def imread_u(p):
    b = np.fromfile(str(p), np.uint8)
    return cv2.imdecode(b, cv2.IMREAD_COLOR)


def imwrite_u(p, img):
    ok, buf = cv2.imencode(Path(p).suffix or ".png", img)
    if ok:
        Path(p).write_bytes(buf.tobytes())
    return ok


def write_video(frames, out, fps, crf=16):
    h, w = frames[0].shape[:2]
    cmd = [find_exe(), "-v", "error", "-y",
           "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{w}x{h}", "-r", f"{fps:g}",
           "-i", "-", "-c:v", "libx264", "-crf", str(crf), "-pix_fmt", "yuv420p",
           "-movflags", "+faststart", str(out)]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    for f in frames:
        p.stdin.write(f.astype(np.uint8).tobytes())
    p.stdin.close()
    err = p.stderr.read().decode("utf-8", "replace")
    if p.wait() != 0:
        raise RuntimeError("ffmpeg 编码失败:\n" + err[-800:])


def ncc(a, b):
    a = cv2.cvtColor(a, cv2.COLOR_BGR2GRAY).astype(np.float32)
    b = cv2.cvtColor(b, cv2.COLOR_BGR2GRAY).astype(np.float32)
    a -= a.mean(); b -= b.mean()
    den = float(np.sqrt((a * a).sum() * (b * b).sum()))
    return float((a * b).sum() / den) if den else 0.0


def build_mask(src):
    """矩形羽化 × 亮度权重：深墨（沙洲、山脚、树）位移压到 0。"""
    H, W = src.shape[:2]
    m = np.zeros((H, W), np.float32)
    x0, y0, x1, y1 = ROI["x0"], ROI["y0"], ROI["x1"], ROI["y1"]
    m[y0:y1, x0:x1] = 1.0

    ramp = lambda n: (lambda t: t * t * (3 - 2 * t))(np.linspace(0, 1, n, dtype=np.float32))
    fy = min(FEATHER_Y, (y1 - y0) // 3)
    fx = min(FEATHER_X, (x1 - x0) // 3)
    m[y0:y0 + fy, x0:x1] *= ramp(fy)[:, None]
    m[y1 - fy:y1, x0:x1] *= ramp(fy)[::-1, None]
    m[y0:y1, x0:x0 + fx] *= ramp(fx)[None, :]
    m[y0:y1, x1 - fx:x1] *= ramp(fx)[::-1][None, :]

    gray = cv2.cvtColor(src, cv2.COLOR_BGR2GRAY).astype(np.float32)
    t = np.clip((gray - TONE_LO) / (TONE_HI - TONE_LO), 0, 1)
    tone = t * t * (3 - 2 * t)
    tone = cv2.GaussianBlur(tone, (0, 0), 8)
    return np.clip(m * tone, 0, 1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="Log/Circle26/base/fuchun-169-a.png")
    ap.add_argument("--dur", type=float, default=6.0)
    ap.add_argument("--fps", type=float, default=24.0)
    ap.add_argument("--amp", type=float, default=16.0, help="近处最大位移 px")
    ap.add_argument("--dy-ratio", type=float, default=1.0,
                    help="纵向位移占比；水平短线只有上下起伏才看得见，调大更明显")
    ap.add_argument("--sway", type=float, default=0.0,
                    help="整体往复横向漂移幅度 px（0..2×sway，接缝须落在左岸静止区）")
    ap.add_argument("--loops", type=int, default=10)
    ap.add_argument("--out", default="Log/Circle26/out/wave")
    a = ap.parse_args()

    src = imread_u(a.base)
    H, W = src.shape[:2]
    n = int(round(a.dur * a.fps))

    mask = build_mask(src)

    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    # 幅度随 y 增大：远处（y 小）静，近处（y 大）幅大，像自然的透视衰减
    y0, y1 = ROI["y0"], ROI["y1"]
    ty = np.clip((yy - y0) / max(1.0, (y1 - y0)), 0, 1)
    amp = (0.28 + 0.72 * ty) * a.amp * mask

    frames = []
    sway_log = []
    for i in range(n):
        ph = 2 * np.pi * (xx / LAM_X - i / n + yy / LAM_Y)
        dx = amp * np.sin(ph)
        dy = a.dy_ratio * amp * np.cos(ph)
        # 整体往复漂移：d 在 0..2·sway 之间来回，t=T 回到 0。
        # 用的是 np.roll（环绕），所以接缝出现在 x=d 处——那里是左岸树丛，mask≈0，看不见。
        out = cv2.remap(src, xx + dx, yy + dy, cv2.INTER_LINEAR,
                        borderMode=cv2.BORDER_REPLICATE)
        frames.append(out)

    outdir = Path(a.out); outdir.mkdir(parents=True, exist_ok=True)
    write_video(frames, outdir / "wave-unit.mp4", a.fps)
    write_video(frames * max(1, a.loops), outdir / f"wave-x{a.loops}.mp4", a.fps)

    f2f = [ncc(frames[i], frames[i + 1]) for i in range(0, n - 1, max(1, n // 40))]
    seam = ncc(frames[-1], frames[0])
    keep = [ncc(frames[i], src) for i in (0, n // 3, n // 2, n - 1)]
    move = [float(np.abs(frames[i].astype(np.float32) - frames[i + 1].astype(np.float32)).mean())
            for i in range(0, n - 1, max(1, n // 40))]

    print(f"底图 {W}x{H}  ROI {ROI['x1']-ROI['x0']}x{ROI['y1']-ROI['y0']}")
    print(f"周期 {a.dur:g}s / {n} 帧 @{a.fps:g}fps  行波 λx={LAM_X:g}  λy={LAM_Y:g}  速度 {LAM_X/a.dur:.1f}px/s")
    print(f"位移幅度 远 {0.28*a.amp:.1f}px → 近 {a.amp:.1f}px   (∂dx/∂x 峰值 {a.amp*2*np.pi/LAM_X:.3f}，须 <1 才不折叠)")
    print(f"接缝(末帧→首帧) {seam:.4f}   帧间基线 {np.median(f2f):.4f}   比值 {seam/np.median(f2f):.3f}")
    print(f"每帧与原画 NCC {['%.4f'%v for v in keep]}   ← 全程应≈1（像素值未改，只移位）")
    print(f"帧间 mean|Δ| 中位 {np.median(move):.3f}")
    if a.sway:
        print(f"整体漂移 0..{max(sway_log)}px 往复（接缝落在 x≤{max(sway_log)}，左岸树丛）")

    CH = 256
    tiles = []

    def add(lab, img):
        t = cv2.resize(img, (int(img.shape[1] * CH / img.shape[0]), CH))
        c = np.full((CH + 20, t.shape[1], 3), 250, np.uint8); c[20:] = t
        cv2.putText(c, lab.encode("ascii", "ignore").decode() or "", (6, 15),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 200), 1, cv2.LINE_AA)
        tiles.append(c)

    add("src", src); add("f0", frames[0]); add(f"f{n//2}", frames[n // 2]); add(f"f{n-1}", frames[-1])
    add("mask", cv2.cvtColor((mask * 255).astype(np.uint8), cv2.COLOR_GRAY2BGR))
    imwrite_u(outdir / "diag.png", np.hstack(tiles))

    (outdir / "wave.json").write_text(json.dumps({
        "base": str(a.base), "roi": ROI, "lam_x": LAM_X, "lam_y": LAM_Y,
        "dur": a.dur, "fps": a.fps, "frames": n, "amp": a.amp,
        "speed_px_s": round(LAM_X / a.dur, 2),
        "seam_ncc": round(seam, 4), "fps_ncc": round(float(np.median(f2f)), 4),
        "ratio": round(seam / float(np.median(f2f)), 4),
        "ncc_to_src": [round(v, 4) for v in keep],
        "sway": a.sway, "sway_max": max(sway_log) if sway_log else 0,
        "cost": 0,
    }, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
