import json
import os
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

root = Path(".").resolve()
sys.path.insert(0, str(root / "Skill/RHClaw/runninghub/scripts"))
os.environ["PYTHONUTF8"] = "1"

import runninghub as rh

key = rh.resolve_api_key(None)
print("KEY_OK={}".format(bool(key)))

tasks = ["2121119316345835522", "2121121938201071617", "2121117698741207042"]

for tid in tasks:
    url = rh.BASE_URL + rh.POLL_ENDPOINT
    print("=== {} ===".format(tid))
    try:
        data = rh.api_post(key, url, {"apiKey": key, "taskId": tid})
        print(json.dumps(data, ensure_ascii=False, indent=2))
    except SystemExit:
        print("(api_post exited)")