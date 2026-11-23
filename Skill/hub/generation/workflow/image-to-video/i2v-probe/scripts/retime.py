"""把生成片的时间轴重映射到目标时长，不丢内容。

    python retime.py --gen runs/X/out.mp4 --target 4.40 --mode uniform --out out-retimed.mp4

为什么要它：本通道最短只出 5s（`205:select` 第 1 档 = 5s），实际 124 帧 / 5.167s。
源段常短于 5s（如 S01 = 4.40s），直接 `-t 4.40` 裁掉尾部 18 帧 ——
那 0.77s 里模型已经把动作做完了，裁掉等于「动作只演到 88%」。

四种模式：

| mode | 做法 | 内容 | 节奏 | 用途 |
| --- | --- | --- | --- | --- |
| `cut` | 直接截前 target 秒 | 丢尾 | 原速 | 对照基线，复现旧行为 |
| `uniform` | 全程匀速压缩到 target | 全保留 | 快 17% | 默认，快且稳 |
| `interp` | 同上 + 运动补偿补帧 | 全保留 | 快 17% | 24fps 采样不够时用，慢 |
| `zone` | 只在低运动区段多压，主体段保原速 | 全保留 | 主体不变 | 动作集中在中段时用 |

**度量纪律**：`measure.py` 只吃原速 `out.mp4`。变速片是给人看的对齐结果，
拿它做帧对帧度量会把「时间被压缩」错记成「运动变小」。
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = next(p for p in Path(__file__).resolve().parents if (p / "Tool" / "ffmpeg.py").exists())
sys.path.insert(0, str(ROOT / "Tool"))
from ffmpeg import find_exe  # noqa: E402


def probe(p: Path):
    exe = find_exe()
    o = subprocess.run([str(exe), "-hide_banner", "-i", str(p)],
                       capture_output=True, text=True, errors="replace").stderr
    fps = 24.0
    m = re.search(r"(\d+(?:\.\d+)?)\s+fps", o)
    if m:
        fps = float(m.group(1))
    return fps


def frame_count(p: Path, fps: float) -> int:
    exe = find_exe()
    o = subprocess.run([str(exe), "-hide_banner", "-i", str(p)],
                       capture_output=True, text=True, errors="replace").stderr
    m = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", o)
    if not m:
        return 0
    dur = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
    return int(round(dur * fps))


def low_motion_window(metrics: Path, gen_dur: float, span: float):
    """从 metrics.json 的 series 里找一段 span 秒的低运动窗口，返回 (a, b)。

    没有 metrics 就退回中段。
    """
    if not metrics.exists():
        return gen_dur * 0.35, gen_dur * 0.35 + span
    m = json.loads(metrics.read_text(encoding="utf-8"))
    series = m.get("series") or []
    pts = [(s["t"], sum(s["zones"]) / len(s["zones"])) for s in series if s.get("zones")]
    if len(pts) < 3:
        return gen_dur * 0.35, gen_dur * 0.35 + span
    step = pts[1][0] - pts[0][0]
    k = max(1, int(round(span / step)))
    best, bi = float("inf"), 0
    for i in range(len(pts) - k + 1):
        v = sum(p[1] for p in pts[i:i + k]) / k
        if v < best:
            best, bi = v, i
    a = pts[bi][0] - step / 2
    return max(0.0, a), max(0.0, a) + span


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--gen", required=True)
    ap.add_argument("--target", type=float, required=True, help="目标时长（秒）")
    ap.add_argument("--mode", default="uniform",
                    choices=["cut", "uniform", "interp", "zone"])
    ap.add_argument("--out", required=True)
    ap.add_argument("--metrics", default=None, help="zone 模式用，默认取 gen 同目录的 metrics.json")
    ap.add_argument("--fps", type=float, default=24.0)
    a = ap.parse_args()

    gen = Path(a.gen).resolve()
    out = Path(a.out).resolve()
    if not gen.exists():
        print(f"输入不存在: {gen}", file=sys.stderr)
        return 2
    out.parent.mkdir(parents=True, exist_ok=True)

    fps = a.fps
    n = frame_count(gen, fps)
    gen_dur = n / fps if n else 0.0
    if gen_dur <= 0:
        print("读不出时长", file=sys.stderr)
        return 2

    exe = find_exe()
    base = ("-c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p -movflags +faststart -an")
    common = [str(exe), "-y", "-hide_banner", "-loglevel", "error", "-i", str(gen)]

    if abs(gen_dur - a.target) < 0.5 / fps:          # 已经对齐，只重封装
        cmd = common + ["-t", f"{a.target:.4f}", "-c", "copy", str(out)]
        mode_used, ratio = "passthrough", 1.0
    elif a.mode == "cut":
        cmd = common + ["-t", f"{a.target:.4f}"] + base.split() + [str(out)]
        mode_used, ratio = "cut", 1.0
    elif a.mode == "uniform":
        r = a.target / gen_dur
        vf = f"setpts=PTS*{r:.6f},fps={fps}"
        cmd = common + ["-vf", vf] + base.split() + [str(out)]
        mode_used, ratio = "uniform", 1.0 / r
    elif a.mode == "interp":
        r = a.target / gen_dur
        # minterpolate 需要后一帧才能插值，末尾会少 1–2 帧；先 clone 补尾再裁回目标长度
        vf = (f"setpts=PTS*{r:.6f},tpad=stop_mode=clone:stop_duration=0.4,"
              f"minterpolate=fps={fps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1")
        cmd = common + ["-vf", vf, "-t", f"{a.target:.4f}"] + base.split() + [str(out)]
        mode_used, ratio = "interp", 1.0 / r
    else:  # zone
        metrics = Path(a.metrics) if a.metrics else gen.parent / "metrics.json"
        span = min(1.0, gen_dur * 0.3)
        za, zb = low_motion_window(metrics, gen_dur, span)
        # 三段：前(a) / 低运动段(a→b) / 后。低运动段多压，其余段按剩余量分摊。
        slow_in, slow_out = za, zb
        slow_target = span * 0.45                       # 这 1s 压到 0.45s
        rest_in = gen_dur - span
        rest_target = a.target - slow_target
        r_rest = rest_target / rest_in if rest_in > 0 else 1.0
        r_slow = slow_target / span
        # 每段必须 setpts=PTS-STARTPTS 后再乘系数，否则各段保留原时间戳、concat 会累加成两倍长
        vf = (f"[0:v]trim=0:{slow_in:.4f},setpts=(PTS-STARTPTS)*{r_rest:.6f}[p1];"
              f"[0:v]trim={slow_in:.4f}:{slow_out:.4f},setpts=(PTS-STARTPTS)*{r_slow:.6f}[p2];"
              f"[0:v]trim={slow_out:.4f},setpts=(PTS-STARTPTS)*{r_rest:.6f}[p3];"
              f"[p1][p2][p3]concat=n=3:v=1:a=0,fps={fps}[v]")
        cmd = common + ["-filter_complex", vf, "-map", "[v]",
                        "-t", f"{a.target:.4f}"] + base.split() + [str(out)]
        mode_used, ratio = f"zone({slow_in:.2f}-{slow_out:.2f}s→{slow_target:.2f}s)", slow_target / span

    r = subprocess.run(cmd, capture_output=True, text=True, errors="replace")
    if r.returncode != 0 or not out.exists():
        print("ffmpeg 失败：\n" + r.stderr[-1200:], file=sys.stderr)
        return 1

    n2 = frame_count(out, fps)
    print(json.dumps({
        "mode": mode_used, "gen_dur": round(gen_dur, 4), "target": a.target,
        "out_dur": round(n2 / fps, 4), "frames_in": n, "frames_out": n2,
        "speed": round(gen_dur / a.target, 4) if a.target else 1.0,
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
