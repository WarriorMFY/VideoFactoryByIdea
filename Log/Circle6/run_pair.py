"""Circle6 投递：动作卡＋场景卡双卡直发，MiniMax H3 480P/5s/16:9 一镜到底。

用法：
  python Log/Circle6/run_pair.py Log/Circle6/prompt-pair-v1.txt pair-1
实发文本会同时落一份 output/<tag>.mp4.prompt.txt 快照（与 Circle5 口径一致）。
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

src = ROOT / sys.argv[1] if len(sys.argv) > 1 else ROOT / "Log" / "Circle6" / "prompt-pair.txt"
tag = sys.argv[2] if len(sys.argv) > 2 else "pair-1"
prompt = src.read_text(encoding="utf-8").rstrip("\n")

outdir = ROOT / "Log" / "Circle6" / "output"
outdir.mkdir(parents=True, exist_ok=True)
video = outdir / f"{tag}.mp4"
(outdir / f"{tag}.mp4.prompt.txt").write_text(prompt, encoding="utf-8")

print("PROMPT_LEN", len(prompt))
print("SNAPSHOT", outdir / f"{tag}.mp4.prompt.txt")

cmd = [
    sys.executable,
    str(ROOT / "Skill" / "RHClaw" / "runninghub" / "scripts" / "runninghub_app.py"),
    "--run", "2085304953094107137",
    "--node", "250:prompt=" + prompt,
    "--node", "115:aspect_ratio=16:9 (Widescreen)",
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
