"""副实验 C 第二次尝试：改用专用图生视频应用（全能视频X-图生视频-官方稳定版-v1.5）。

上一版用 H3 应用的 231 号图像节点，输出从一件黑衬衫胸口起手，说明该节点并不当首帧用。
本应用只有 4 个节点：3=LoadImage、1=prompt、1=duration、1=resolution，是标准首帧图生视频。

用法：python Log/Circle10/i2v/run_app_i2v2.py <prompt 文件> <tag>
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
os.environ["PYTHONPATH"] = str(ROOT / "Skill" / "RHClaw" / "runninghub" / "scripts")
os.environ["PYTHONUTF8"] = "1"
os.environ["PYTHONIOENCODING"] = "utf-8"

m = re.search(r"apikey:\s*(\S+)", (ROOT / "AGENTS.md").read_text(encoding="utf-8"))
os.environ["RUNNINGHUB_API_KEY"] = m.group(1)

src = HERE / sys.argv[1]
tag = sys.argv[2]
prompt = src.read_text(encoding="utf-8").strip()

outdir = HERE / "output"
video = outdir / f"{tag}.mp4"
(outdir / f"{tag}.mp4.prompt.txt").write_text(prompt, encoding="utf-8")

cmd = [
    sys.executable,
    str(ROOT / "Skill" / "RHClaw" / "runninghub" / "scripts" / "runninghub_app.py"),
    "--run", "2061787954460323842",
    "--node", "1:prompt=" + prompt,
    "--node", "1:duration=5",
    "--node", "1:resolution=720p",
    "--file", "3:image=" + str(FIRST),
    "-o", str(video),
]
print("APP 2061787954460323842（全能视频X 图生视频 v1.5）首帧 1086")
r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", timeout=1800)
print("RC", r.returncode)
print(r.stdout[-2500:])
if r.stderr:
    print("--- STDERR ---")
    print(r.stderr[-1500:])
