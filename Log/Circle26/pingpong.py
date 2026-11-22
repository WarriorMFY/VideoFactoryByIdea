"""把一条单向视频做成严格无缝的循环：正放 + 倒放（乒乓）。

原理：f0..fN-1 + fN-2..f1 拼成一个单元，单元末帧 f1 与下一单元首帧 f0
本来就是原片里的相邻帧，所以接缝跳变严格为 0，不需要 crossfade，也不需要
首尾两端长得一样。

代价：所有有方向的运动会被倒放反转（落花变上升、外扩涟漪变收缩）。
只适用于无方向的周期运动（明暗呼吸、雾的聚散、光尘浮沉）。

    python pingpong.py --video in.mp4 --loops 10 --out out.mp4
"""

import argparse
import json
import subprocess
from pathlib import Path

import cv2
import numpy as np

FFMPEG = Path(__file__).resolve().parents[2] / "Tool/_deps/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v9.0.2.exe"


def rd(p):
    b = np.fromfile(str(p), np.uint8)
    return cv2.imdecode(b, cv2.IMREAD_COLOR)


def read_video(p):
    cap = cv2.VideoCapture(str(p))
    frames = []
    while True:
        ok, f = cap.read()
        if not ok:
            break
        frames.append(f)
    cap.release()
    fps = cap.get(cv2.CAP_PROP_FPS)
    if not fps or fps <= 0 or fps > 240:
        fps = 16.0
    return frames, fps


def ncc_gray(a, b):
    a = cv2.cvtColor(a, cv2.COLOR_BGR2GRAY).astype(np.float32)
    b = cv2.cvtColor(b, cv2.COLOR_BGR2GRAY).astype(np.float32)
    a -= a.mean()
    b -= b.mean()
    s = np.sqrt((a * a).sum() * (b * b).sum())
    return float((a * b).sum() / s) if s else 0.0


def write_video(frames, path, fps):
    h, w = frames[0].shape[:2]
    tmp = Path(str(path) + ".raw.mp4")
    vw = cv2.VideoWriter(str(tmp), cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))
    for f in frames:
        vw.write(f)
    vw.release()
    # mp4v 兼容性一般，转 h264
    if FFMPEG.exists():
        subprocess.run([str(FFMPEG), "-v", "error", "-y", "-i", str(tmp),
                        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18",
                        str(path)], check=True)
        tmp.unlink(missing_ok=True)
    else:
        tmp.replace(path)


def minterp(src, dst, fps):
    """补帧到目标帧率。只做一次，避免多次插值累积糊。"""
    if not FFMPEG.exists():
        Path(src).replace(dst)
        return False
    subprocess.run([str(FFMPEG), "-v", "error", "-y", "-i", str(src),
                    "-vf", f"minterpolate=fps={fps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1",
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", str(dst)], check=True)
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", required=True)
    ap.add_argument("--loops", type=int, default=10)
    ap.add_argument("--out", default=None, help="输出路径；默认 <src>/pingpong-xN.mp4")
    ap.add_argument("--fps", type=float, default=0, help="补帧到该帧率（0=保持原帧率）")
    ap.add_argument("--ease", action="store_true", help="在折返点做速度缓入缓出（帧复制，会拉长周期）")
    a = ap.parse_args()

    frames, fps = read_video(a.video)
    n = len(frames)
    if n < 4:
        raise SystemExit("帧太少")

    # 乒乓单元：正放全部 + 倒放去掉首尾（首=末帧、尾=首帧，会各重复一次）
    unit = list(frames) + list(reversed(frames[1:-1]))
    cycle = len(unit)

    out_frames = unit * a.loops

    src = Path(a.video)
    out = Path(a.out) if a.out else src.parent / f"pingpong-x{a.loops}.mp4"
    raw = out.with_name(out.stem + ".nofps.mp4")
    write_video(out_frames, raw, fps)

    if a.fps and abs(a.fps - fps) > 0.5:
        pre = raw.with_name(out.stem + ".xfps.mp4")
        if minterp(raw, pre, a.fps):
            pre.replace(out)
            raw.unlink(missing_ok=True)
            out_fps = a.fps
        else:
            raw.replace(out)
            out_fps = fps
    else:
        raw.replace(out)
        out_fps = fps

    # 两处折返的连续性：折返点是「同一帧相接」以外的相邻关系，
    # 这里直接量拼接后每对相邻帧的 NCC，看折返处是否落在正常范围内。
    u = unit
    pairs = [(len(frames) - 1, len(frames)),           # 末帧 -> 倒放首帧
             (cycle - 1, 0)]                            # 单元末 -> 单元首
    seam = [ncc_gray(u[i], u[j]) for i, j in pairs]
    allc = [ncc_gray(u[i], u[i + 1]) for i in range(cycle - 1)]
    med = float(np.median(allc))

    print(f"原片 {n} 帧 @ {fps:.1f}fps = {n / fps:.2f}s")
    print(f"乒乓单元 {cycle} 帧 = {cycle / fps:.2f}s；{a.loops} 圈 = {len(out_frames)} 帧 = {len(out_frames) / out_fps:.1f}s @ {out_fps:.0f}fps")
    print(f"帧间 NCC 中位 {med:.4f}；折返处 " + " / ".join(f"{v:.4f}" for v in seam)
          + f"（比值 {seam[0] / med:.3f} / {seam[1] / med:.3f}）")
    print(f"-> {out}")

    (src.parent / "pingpong.json").write_text(json.dumps({
        "src": str(src), "src_frames": n, "fps": fps, "unit_frames": cycle,
        "loops": a.loops, "out_fps": out_fps, "seam_ncc": [round(v, 4) for v in seam],
        "frame_ncc_median": round(med, 4),
    }, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
