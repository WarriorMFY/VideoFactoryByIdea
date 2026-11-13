import os
import re
import subprocess
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

root = Path(".").resolve()
os.environ["PYTHONPATH"] = str(root / "Skill/RHClaw/runninghub/scripts")
os.environ["PYTHONUTF8"] = "1"
os.environ["PYTHONIOENCODING"] = "utf-8"

agents = (root / "AGENTS.md").read_text(encoding="utf-8")
match = re.search(r"apikey:\s*(\S+)", agents)
os.environ["RUNNINGHUB_API_KEY"] = match.group(1)

prompt = (root / "Log/Circle1/prompt.txt").read_text(encoding="utf-8").splitlines()[0].strip()
print("PROMPT_LEN={}".format(len(prompt)))
print(prompt)

cmd = [
    sys.executable,
    "Workspace/_rh_app.py",
    "--run",
    "2046794551444119554",
    "--node",
    "18:prompt=" + prompt,
    "--instance-type",
    "lite",
    "-o",
    "Log/Circle1/output/style-dark-fantasy_prop_01.png",
]
subprocess.run(cmd)