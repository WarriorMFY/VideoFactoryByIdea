"""Circle30 现场器材：两段 672×928@24 拼成成片。
- 不缩放（源尺寸已是成片规格），不裁画面，不 trim
- 丢弃音轨：本圈不做声音（core §6 声音三轨全未实测）
"""
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent  # Log/Circle30
FF = ROOT.parents[1] / "Tool" / "ffmpeg.py"
TMP = ROOT / "_tmp"
TMP.mkdir(exist_ok=True)
SRC = [ROOT / "video" / "runs" / "V1-抹纸" / "out.mp4",
       ROOT / "video" / "runs" / "V2-压边" / "out.mp4"]

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
