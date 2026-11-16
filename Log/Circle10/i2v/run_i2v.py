"""副实验 C：肖像图固定（1086），景别当变量，用 Vidu Q2 Turbo 图生视频。

两条：
  c1 保持特写——只要呼吸，镜头不动
  c2 拉到全身——镜头匀速后拉，从胸像到全身

用法：python Log/Circle10/i2v/run_i2v.py <prompt 文件> <tag> [振幅]
"""
import os
import re
import subprocess
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
FIRST = ROOT / "RAG/portraits/figure-symmetric-cartographer/02-pass-1086x1448.png"
os.environ["PYTHONUTF8"] = "1"
os.environ["PYTHONIOENCODING"] = "utf-8"

m = re.search(r"apikey:\s*(\S+)", (ROOT / "AGENTS.md").read_text(encoding="utf-8"))
os.environ["RUNNINGHUB_API_KEY"] = m.group(1)

src = HERE / sys.argv[1]
tag = sys.argv[2]
amp = sys.argv[3] if len(sys.argv) > 3 else "small"
prompt = src.read_text(encoding="utf-8").strip()

outdir = HERE / "output"
video = outdir / f"{tag}.mp4"
(outdir / f"{tag}.mp4.prompt.txt").write_text(prompt, encoding="utf-8")

cmd = [
    sys.executable,
    str(ROOT / "Skill" / "RHClaw" / "runninghub" / "scripts" / "runninghub.py"),
    "--endpoint", "vidu/image-to-video-q2-turbo",
    "--prompt", prompt,
    "--image", str(FIRST),
    "--param", "duration=5",
    "--param", "resolution=720p",
    "--param", "movementAmplitude=" + amp,
    "--param", "bgm=false",
    "-o", str(video),
]
print("ENDPOINT vidu/image-to-video-q2-turbo  amp", amp, "prompt", len(prompt), "字符")
r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", timeout=1800)
print("RC", r.returncode)
print(r.stdout[-3000:])
if r.stderr:
    print("--- STDERR ---")
    print(r.stderr[-1500:])
