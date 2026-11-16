"""副实验 C 第三次：用「MiniMax+H3+首帧图生视频」应用（2113790012012720129）。

节点：140:image（首帧）、115:aspect_ratio、115:megapixels、133:duration、142:prompt。
首帧固定 1086，只改 prompt 里的景别要求。

用法：python Log/Circle10/i2v/run_frame_i2v.py <prompt 文件> <tag>
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
    "--run", "2113790012012720129",
    "--node", "142:value=" + prompt,
    "--node", "133:value=5",
    "--node", "115:aspect_ratio=3:4 (Portrait Standard)",
    "--node", "115:megapixels=0.6",
    "--file", "140:image=" + str(FIRST),
    "-o", str(video),
]
print("APP 2113790012012720129（H3 首帧图生视频）首帧 1086")
r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", timeout=1800)
print("RC", r.returncode)
print(r.stdout[-2500:])
if r.stderr:
    print("--- STDERR ---")
    print(r.stderr[-1500:])
