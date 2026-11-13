import subprocess
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

lines = Path("Log/Circle2/prompt.txt").read_text(encoding="utf-8").splitlines()
prompt = lines[5].strip()
Path("Workspace/_l4_prompt_sent.txt").write_text(prompt, encoding="utf-8")
print("PROMPT_LEN", len(prompt))

Path("Log/Circle2/output").mkdir(parents=True, exist_ok=True)

cmd = [
    sys.executable,
    r"Skill\RHClaw\runninghub\scripts\runninghub_app.py",
    "--run", "2085304953094107137",
    "--node", "250:prompt=" + prompt,
    "--node", "115:aspect_ratio=16:9 (Widescreen)",
    "--node", "225:select=1",
    "--node", "205:select=1",
    "-o", r"Log\Circle2\output\l4-v2.mp4",
]
print("NODES: 5s / 480P / 16:9")
r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", timeout=1800)
print("RC", r.returncode)
print("--- STDOUT ---")
print(r.stdout)
print("--- STDERR ---")
print(r.stderr[-3000:])