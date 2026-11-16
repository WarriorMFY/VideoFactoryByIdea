"""Circle10 投递：肖像卡＋视频固定变量卡，MiniMax H3 / 480P / 5s / 3:4 一镜到底。

两次投递读同一份 prompt 文件、参数完全相同，唯一变量是平台随机性（方案 A）。

用法：
  python Log/Circle10/run_video.py Log/Circle10/prompt-video-v1.txt v1-a
实发文本同时落 output/<tag>.mp4.prompt.txt 快照（与 Circle5/6 同口径）。
"""
import os
import re
import subprocess
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[2]
os.environ["PYTHONPATH"] = str(ROOT / "Skill" / "RHClaw" / "runninghub" / "scripts")
os.environ["PYTHONUTF8"] = "1"
os.environ["PYTHONIOENCODING"] = "utf-8"

m = re.search(r"apikey:\s*(\S+)", (ROOT / "AGENTS.md").read_text(encoding="utf-8"))
os.environ["RUNNINGHUB_API_KEY"] = m.group(1)

src = ROOT / sys.argv[1] if len(sys.argv) > 1 else ROOT / "Log" / "Circle10" / "prompt-video-v1.txt"
tag = sys.argv[2] if len(sys.argv) > 2 else "v1-a"
prompt = src.read_text(encoding="utf-8").rstrip("\n")

outdir = ROOT / "Log" / "Circle10" / "output"
outdir.mkdir(parents=True, exist_ok=True)
video = outdir / f"{tag}.mp4"
snap = outdir / f"{tag}.mp4.prompt.txt"
snap.write_text(prompt, encoding="utf-8")

print("PROMPT_CHARS", len(prompt), "BYTES", len(prompt.encode("utf-8")))
print("SNAPSHOT", snap)

cmd = [
    sys.executable,
    str(ROOT / "Skill" / "RHClaw" / "runninghub" / "scripts" / "runninghub_app.py"),
    "--run", "2085304953094107137",
    "--node", "250:prompt=" + prompt,
    "--node", "115:aspect_ratio=3:4 (Portrait Standard)",
    "--node", "225:select=1",
    "--node", "205:select=1",
    "-o", str(video),
]
r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", timeout=1800)
print("RC", r.returncode)
print("--- STDOUT ---")
print(r.stdout)
if r.stderr:
    print("--- STDERR ---")
    print(r.stderr[-2000:])
