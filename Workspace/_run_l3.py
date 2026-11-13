import subprocess
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

lines = Path("Log/Circle2/prompt.txt").read_text(encoding="utf-8").splitlines()
pos = lines[1].strip()
neg = lines[2].strip()
if neg.startswith("--no"):
    neg = neg[4:].strip()

prompt = pos + "避免" + neg + "。"
Path("Workspace/_l3_prompt_sent.txt").write_text(prompt, encoding="utf-8")
print("PROMPT_LEN", len(prompt))

Path("Log/Circle2/output").mkdir(parents=True, exist_ok=True)

cmd = [
    sys.executable,
    r"Skill\RHClaw\runninghub\scripts\runninghub_app.py",
    "--run", "2046794551444119554",
    "--node", "18:aspectRatio=16:9",
    "--node", "18:resolution=1k",
    "--node", "18:prompt=" + prompt,
    "-o", r"Log\Circle2\output\l3-v2.png",
]
r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", timeout=900)
print("RC", r.returncode)
print("--- STDOUT ---")
print(r.stdout)
print("--- STDERR ---")
print(r.stderr[-3000:])