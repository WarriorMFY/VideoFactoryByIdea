"""副实验 B 投递：走秀固定变量卡 + 肖像卡，MiniMax H3 / 480P / 5s / 3:4。

用法：python Log/Circle10/runway/run_video.py r1-a
"""
import os
import re
import subprocess
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
os.environ["PYTHONPATH"] = str(ROOT / "Skill" / "RHClaw" / "runninghub" / "scripts")
os.environ["PYTHONUTF8"] = "1"
os.environ["PYTHONIOENCODING"] = "utf-8"

m = re.search(r"apikey:\s*(\S+)", (ROOT / "AGENTS.md").read_text(encoding="utf-8"))
os.environ["RUNNINGHUB_API_KEY"] = m.group(1)

src = HERE / "prompt-runway.txt"
tag = sys.argv[1] if len(sys.argv) > 1 else "r1-a"
prompt = src.read_text(encoding="utf-8").rstrip("\n")

outdir = HERE / "output"
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
