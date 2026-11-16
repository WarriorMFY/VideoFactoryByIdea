"""副实验 C（改走 AI 应用）：肖像图固定 1086 当首帧，景别当变量。

背景：标准模型 API 被拒（errorCode 1014，仅企业共享 Key 可用），图生视频只能走 AI 应用。
通道沿用本轮同一台 MiniMax H3 应用 2085304953094107137，节点 231 = 上传图像1。

用法：python Log/Circle10/i2v/run_app_i2v.py <prompt 文件> <tag>
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
    "--run", "2085304953094107137",
    "--node", "250:prompt=" + prompt,
    "--node", "115:aspect_ratio=3:4 (Portrait Standard)",
    "--node", "225:select=1",
    "--node", "205:select=1",
    "--file", "231:image=" + str(FIRST),
    "-o", str(video),
]
print("APP 2085304953094107137  首帧 1086  节点 231")
r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", timeout=1800)
print("RC", r.returncode)
print(r.stdout[-2500:])
if r.stderr:
    print("--- STDERR ---")
    print(r.stderr[-1500:])
