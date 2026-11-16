"""通用投递：指定 prompt 文件与 tag。

用法：python Log/Circle10/runway/run_variant.py prompt-半身.txt h1
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

if len(sys.argv) < 3:
    sys.exit("用法：run_variant.py <prompt 文件名> <tag>")
src = HERE / sys.argv[1]
tag = sys.argv[2]
prompt = src.read_text(encoding="utf-8").rstrip("\n")

outdir = HERE / "output"
video = outdir / f"{tag}.mp4"
snap = outdir / f"{tag}.mp4.prompt.txt"
snap.write_text(prompt, encoding="utf-8")
print("PROMPT", src.name, "CHARS", len(prompt), "BYTES", len(prompt.encode("utf-8")))

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
print(r.stdout)
if r.stderr:
    print("--- STDERR ---")
    print(r.stderr[-1500:])
