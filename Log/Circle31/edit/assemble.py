"""五镜拼成 25.0s：每段取前 120 帧（5.0s），硬切 concat，重编码一次。零积分。"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent          # Log/Circle31
FF = ROOT.parents[1] / "Tool" / "ffmpeg.py"
RUNS = [ROOT / "video" / "runs" / n / "out.mp4" for n in ("M1", "M2", "M3", "M4b", "M5")]
OUT = ROOT / "edit" / "final.mp4"
FRAMES = 120


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    fc = ";".join(f"[{i}:v]trim=end_frame={FRAMES},setpts=PTS-STARTPTS[v{i}]" for i in range(len(RUNS)))
    fc += ";[" + "][".join(f"v{i}" for i in range(len(RUNS))) + f"]concat=n={len(RUNS)}:v=1:a=0[v]"
    cmd = [sys.executable, str(FF), "-y"]
    for p in RUNS:
        cmd += ["-i", str(p)]
    cmd += ["-filter_complex", fc, "-map", "[v]",
            "-c:v", "libx264", "-crf", "18", "-preset", "medium",
            "-pix_fmt", "yuv420p", "-r", "24", "-movflags", "+faststart", str(OUT)]
    subprocess.run(cmd, check=True)
    print("->", OUT)


if __name__ == "__main__":
    main()
