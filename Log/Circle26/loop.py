"""把一段生成片缝成可无限循环的单元，并拼 N 个周期。

原理（crossfade wrap）：
  取前 K 帧 H 与后 K 帧 T，混合成过渡段 B[i] = (1-a)·T[i] + a·H[i]，a 从 0 到 1。
  输出 = B + 原片中段 frames[K : N-K]
  两处接缝都落在原片的相邻帧上：
    · 中段末帧 frames[N-K-1] → 下一圈首帧 B[0] = T[0] = frames[N-K]   ← 原片相邻
    · B[K-1] ≈ H[K-1] = frames[K-1] → 中段首帧 frames[K]              ← 原片相邻
  所以循环是连续的，代价是片子短了 K 帧。

用法：
  python loop.py --video out.mp4 --loops 3 --xfade 12
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


def imwrite_u(p, img):
    ok, buf = cv2.imencode(Path(p).suffix or ".png", img)
    if ok:
        Path(p).write_bytes(buf.tobytes())
    return ok


def read_frames(path):
    cap = cv2.VideoCapture(str(path))
    fps = cap.get(cv2.CAP_PROP_FPS) or 24.0
    out = []
    while True:
        ok, f = cap.read()
        if not ok:
            break
        out.append(f)
    cap.release()
    return out, fps


def ncc(a, b):
    a = cv2.cvtColor(a, cv2.COLOR_BGR2GRAY).astype(np.float32)
    b = cv2.cvtColor(b, cv2.COLOR_BGR2GRAY).astype(np.float32)
    a -= a.mean(); b -= b.mean()
    den = float(np.sqrt((a * a).sum() * (b * b).sum()))
    return float((a * b).sum() / den) if den else 0.0


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


def xfade_unit(frames, K, ease="smooth"):
    N = len(frames)
    K = max(2, min(K, N // 3))
    head, tail = frames[:K], frames[N - K:N]
    blend = []
    for i in range(K):
        t = i / (K - 1)
        # smoothstep：两端陡、中间快，缩短「半透明停留」的时间，
        # 减轻两套相位不同的纹理平均后互相抵消（水纹变淡）的观感。
        a = t * t * (3 - 2 * t) if ease == "smooth" else t
        blend.append(cv2.addWeighted(tail[i], 1.0 - a, head[i], a, 0))
    return blend + frames[K:N - K], K


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", required=True)
    ap.add_argument("--loops", type=int, default=3)
    ap.add_argument("--xfade", type=int, default=12, help="过渡帧数 K")
    ap.add_argument("--ease", choices=["smooth", "linear"], default="smooth")
    ap.add_argument("--out", default=None)
    a = ap.parse_args()

    vid = Path(a.video)
    frames, fps = read_frames(vid)
    if len(frames) < 8:
        print("帧太少", file=sys.stderr)
        return 2
    N = len(frames)

    unit, K = xfade_unit(frames, a.xfade, a.ease)
    M = len(unit)

    # 缝合前后，接缝处的相似度
    before = ncc(frames[-1], frames[0])
    after = ncc(unit[-1], unit[0])
    f2f = float(np.median([ncc(frames[i], frames[i + 1]) for i in range(0, N - 1, max(1, N // 40))]))

    # 跨接缝连续性：中段末帧 → 下一圈首帧，应当等于原片相邻帧
    cross_ok = ncc(frames[N - K - 1], frames[N - K]) if N - K - 1 >= 0 else None

    print(f"{vid.parent.name}  {N}帧/{N/fps:.2f}s @{fps:g}fps  {frames[0].shape[1]}x{frames[0].shape[0]}")
    print(f"  过渡 K={K} 帧 ({K/fps:.2f}s)  单元 {M} 帧 ({M/fps:.2f}s)")
    print(f"  接缝相似度  缝合前 {before:.4f} → 缝合后 {after:.4f}   (帧间基线 {f2f:.4f})")
    print(f"  单元接缝/帧间 = {after/f2f:.3f}  {'连续' if after/f2f >= 0.97 else '仍有跳变'}")
    print(f"  中段接点校验 {cross_ok:.4f}  (原片相邻帧，理应≈基线)")

    outdir = Path(a.out) if a.out else vid.parent
    outdir.mkdir(parents=True, exist_ok=True)
    write_video(unit, outdir / "loop-unit.mp4", fps)
    write_video(unit * max(1, a.loops), outdir / f"loop-x{a.loops}.mp4", fps)

    # 接缝诊断图：末帧 / 首帧 / 过渡段的头中尾
    picks = [frames[-1], unit[0], unit[K // 2], unit[-1]]
    labels = ["orig last", f"B0 (={K}帧后)", f"B{K//2}", "unit last"]
    h = 260
    tiles = []
    for t, lab in zip(picks, labels):
        t2 = cv2.resize(t, (int(t.shape[1] * h / t.shape[0]), h))
        c = np.full((h + 22, t2.shape[1], 3), 250, np.uint8)
        c[22:] = t2
        cv2.putText(c, lab, (6, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 200), 1, cv2.LINE_AA)
        tiles.append(c)
    imwrite_u(outdir / "seam.png", np.hstack(tiles))

    (outdir / "loop.json").write_text(json.dumps({
        "src": str(vid), "frames_in": N, "xfade": K, "frames_unit": M,
        "fps": fps, "loops": a.loops,
        "seam_before": round(before, 4), "seam_after": round(after, 4),
        "fps_ncc": round(f2f, 4), "ratio_after": round(after / f2f, 4),
        "cross_check": None if cross_ok is None else round(cross_ok, 4),
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"  -> {outdir/'loop-unit.mp4'}  {outdir/('loop-x%d.mp4' % a.loops)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
