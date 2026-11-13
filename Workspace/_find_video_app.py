import json
import os
import subprocess
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

root = Path(".").resolve()
script = root / "Skill/RHClaw/runninghub/scripts/runninghub_app.py"
env = dict(os.environ)
env["PYTHONUTF8"] = "1"
env["PYTHONIOENCODING"] = "utf-8"

found = []
seen = set()

for page in range(1, 9):
    proc = subprocess.run(
        [sys.executable, str(script), "--list", "--sort", "HOTTEST",
         "--size", "50", "--page", str(page)],
        capture_output=True, env=env,
    )
    text = proc.stdout.decode("utf-8", errors="replace")
    try:
        data = json.loads(text)
    except Exception as exc:
        print("PAGE{}_PARSE_FAIL {}".format(page, exc))
        print(text[:200])
        continue

    for app in data.get("apps", []):
        title = app.get("title", "")
        wid = app.get("webappId", "")
        if wid in seen:
            continue
        low = title.lower()
        if "视频" in title or "video" in low or "animate" in low:
            seen.add(wid)
            found.append((wid, title))

out = root / "Workspace/_video_apps.txt"
lines = ["{}  {}".format(w, t) for w, t in found]
lines.append("TOTAL {}".format(len(found)))
out.write_text("\n".join(lines), encoding="utf-8")
print("WROTE {}".format(out))
