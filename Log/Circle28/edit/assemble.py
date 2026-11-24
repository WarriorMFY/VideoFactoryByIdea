"""Circle28 现场器材：两段 672×928@24 拼成成片。

- 源已是成片规格，不缩放、不裁画面、不 trim（spec 画幅定稿 672×928）
- 丢弃音轨：本圈不做声音
- 镜1 锁 S1-v1：与 v2 同首帧近同轨迹（逐帧 mean_ncc 0.8075），v2 多花 4.42 未换来朝向
"""
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent  # Log/Circle28
FF = ROOT.parents[1] / "Tool" / "ffmpeg.py"
TMP = ROOT / "_tmp"
TMP.mkdir(exist_ok=True)
SRC = [ROOT / "video" / "runs" / "S1-v1" / "out.mp4",
       ROOT / "video" / "runs" / "S2-v1" / "out.mp4"]

for i, p in enumerate(SRC, 1):
    shutil.copy(p, TMP / f"v{i}.mp4")

out = ROOT / "edit" / "final.mp4"
out.parent.mkdir(exist_ok=True)

cmd = [
    sys.executable, str(FF), "-y",
    "-i", str(TMP / "v1.mp4"), "-i", str(TMP / "v2.mp4"),
    "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0[v]",
    "-map", "[v]", "-c:v", "libx264", "-crf", "18", "-preset", "medium",
    "-pix_fmt", "yuv420p", "-r", "24", "-movflags", "+faststart",
    str(out),
]
r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
if r.returncode != 0:
    print("拼接失败\n" + r.stderr[-1200:])
    sys.exit(1)

probe = subprocess.run([sys.executable, str(FF), "-i", str(out)],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
info = [ln.strip() for ln in probe.stderr.splitlines() if "Duration" in ln or "Stream" in ln]
print("ok ->", out)
print("\n".join(info))
