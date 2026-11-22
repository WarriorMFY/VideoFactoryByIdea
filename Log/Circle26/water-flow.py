"""纯剪辑版循环水面：不调任何生成通道。

与 loop.py 的分工：
  loop.py   —— 生成片拿到手后做事后缝合，crossfade 会平均两套相位不同的水纹，水会「淡一下」
  本脚本    —— 纹理本身是周期性的，每帧只做整数像素平移，滚满一个周期就回到起点，
               首尾像素级同相位，不需要任何过渡帧，也没有「淡一下」

做法：
  1. 从原画取一块纯水面 ROI，左右各取 B 列做 crossfade，得到可横向平铺的纹理（周期 P = 宽 - B）
  2. 纹理横铺足够长，每帧取一个宽 = ROI 宽的窗口，偏移量随帧推进
  3. 用「矩形羽化 × 亮度权重」做 mask 贴回去：深墨（沙洲、山脚、树）不动，只有淡的水在流
  4. 总帧数 n 满足 n 帧正好滚满一个周期，于是 帧[n-1] → 帧[0] 的位移 = 一帧步长，循环无缝且匀速

用法：
  python water-flow.py                       # 出 12s 单元 + 十圈
  python water-flow.py --dur 8 --speed 50
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

# 水面 ROI（在 fuchun-169-a.png 上量的：左侧 x<430 是岸树，右侧 x>1180 是山脚）
ROI = dict(x0=430, y0=465, x1=1180, y1=745)
TILE_BAND = 200      # 左右 crossfade 带宽
FEATHER_Y = 42       # 上下羽化
FEATHER_X = 58       # 左右羽化
TONE_LO, TONE_HI = 104, 142   # 亮度低于 LO 视为深墨（不动），高于 HI 全动


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


def seamless_tile(img, band):
    """把纹理做成可横向平铺：左边缘与右边缘相接处像素连续。

    new = img[:, :W-band]，其中前 band 列是「左带 × ramp_up + 右带 × ramp_down」。
    于是 new 的左边缘取自 img 的最右带，new 的右边缘是 img 的第 W-band-1 列——两者本来相邻。
    """
    h, w = img.shape[:2]
    band = min(band, w // 3)
    new = img[:, : w - band].astype(np.float32).copy()
    ramp = np.linspace(0.0, 1.0, band, dtype=np.float32)
    ramp = (ramp * ramp * (3 - 2 * ramp))[None, :, None]  # smoothstep，避免线性斜坡的硬折
    left = img[:, :band].astype(np.float32)
    right = img[:, w - band:].astype(np.float32)
    new[:, :band] = right * (1 - ramp) + left * ramp
    return np.clip(new, 0, 255).astype(np.uint8)


def build_alpha(roi, px, py):
    h, w = roi.shape[:2]
    ax = np.ones(w, np.float32)
    ay = np.ones(h, np.float32)
    px = min(px, w // 3); py = min(py, h // 3)
    ramp = lambda n: (lambda t: t * t * (3 - 2 * t))(np.linspace(0, 1, n, dtype=np.float32))
    ax[:px] = ramp(px); ax[-px:] = ramp(px)[::-1]
    ay[:py] = ramp(py); ay[-py:] = ramp(py)[::-1]

    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY).astype(np.float32)
    t = np.clip((gray - TONE_LO) / (TONE_HI - TONE_LO), 0, 1)
    tone = t * t * (3 - 2 * t)                          # 深墨 → 0（钉住），淡墨 → 1（跟着流）
    tone = cv2.GaussianBlur(tone, (0, 0), 7)

    a = ay[:, None] * ax[None, :] * tone
    return np.clip(a, 0, 1)[..., None].astype(np.float32)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="Log/Circle26/base/fuchun-169-a.png")
    ap.add_argument("--dur", type=float, default=12.0, help="一个周期的秒数")
    ap.add_argument("--fps", type=float, default=24.0)
    ap.add_argument("--loops", type=int, default=10)
    ap.add_argument("--out", default="Log/Circle26/out/flow")
    a = ap.parse_args()

    src = imread_u(a.base)
    H, W = src.shape[:2]
    roi = src[ROI["y0"]:ROI["y1"], ROI["x0"]:ROI["x1"]]
    rh, rw = roi.shape[:2]

    tile = seamless_tile(roi, TILE_BAND)
    P = tile.shape[1]                                    # 周期像素
    n = int(round(a.dur * a.fps))                        # 单元帧数
    speed = P / a.dur                                    # px/s

    # 横铺：目标窗口宽 rw，偏移最大 P-1
    reps = int(np.ceil((rw + P) / P)) + 1
    tiled = np.concatenate([tile] * reps, axis=1)
    alpha = build_alpha(roi, FEATHER_X, FEATHER_Y)

    frames = []
    offs = []
    for i in range(n):
        off = int(round(i * P / n)) % P                  # 一帧步长 = P/n，n 帧正好一圈
        offs.append(off)
        rolled = tiled[:, off: off + rw].astype(np.float32)
        patch = roi.astype(np.float32) * (1 - alpha) + rolled * alpha
        out = src.copy()
        out[ROI["y0"]:ROI["y1"], ROI["x0"]:ROI["x1"]] = np.clip(patch, 0, 255).astype(np.uint8)
        frames.append(out)

    outdir = Path(a.out); outdir.mkdir(parents=True, exist_ok=True)
    write_video(frames, outdir / "flow-unit.mp4", a.fps)
    write_video(frames * max(1, a.loops), outdir / f"flow-x{a.loops}.mp4", a.fps)

    # 验证：末帧 → 首帧的位移恰为一帧步长，因此接缝相似度应当不低于帧间基线
    f2f = [ncc(frames[i], frames[i + 1]) for i in range(0, n - 1, max(1, n // 40))]
    seam = ncc(frames[-1], frames[0])
    step = offs[1] - offs[0]

    print(f"底图 {W}x{H}  ROI {rw}x{rh}  纹理周期 P={P}px")
    print(f"周期 {a.dur:g}s / {n} 帧 @{a.fps:g}fps  速度 {speed:.1f}px/s  帧步长 {P/n:.2f}px")
    print(f"接缝(末帧→首帧) {seam:.4f}   帧间基线 {np.median(f2f):.4f}   比值 {seam/np.median(f2f):.3f}")
    print(f"偏移序列 首 {offs[:4]} … 末 {offs[-3:]}  回到 0 时步长应≈{step}")

    # 诊断图：三帧整幅 + ROI 原图 + alpha（统一高度后横排）
    CH = 256
    tiles = []

    def add(lab, img):
        t = cv2.resize(img, (int(img.shape[1] * CH / img.shape[0]), CH))
        c = np.full((CH + 20, t.shape[1], 3), 250, np.uint8); c[20:] = t
        cv2.putText(c, lab, (6, 15), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 200), 1, cv2.LINE_AA)
        tiles.append(c)

    add("f0", frames[0]); add(f"f{n//2}", frames[n // 2]); add(f"f{n-1}", frames[-1])
    add("ROI orig", roi)
    add("alpha mask", cv2.cvtColor((alpha[..., 0] * 255).astype(np.uint8), cv2.COLOR_GRAY2BGR))
    imwrite_u(outdir / "diag.png", np.hstack(tiles))
    imwrite_u(outdir / "tile.png", tile)

    (outdir / "flow.json").write_text(json.dumps({
        "base": str(a.base), "roi": ROI, "roi_size": [rw, rh],
        "period_px": P, "tile_band": TILE_BAND, "dur": a.dur, "fps": a.fps,
        "frames": n, "speed_px_s": round(speed, 2),
        "seam_ncc": round(seam, 4), "fps_ncc": round(float(np.median(f2f)), 4),
        "ratio": round(seam / float(np.median(f2f)), 4),
        "cost": 0,
    }, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
