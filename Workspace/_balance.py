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
headers = {"Content-Type": "application/json", "Authorization": "Bearer " + key}
result = rh.curl_post_json(rh.ACCOUNT_STATUS_URL, {"apikey": key}, headers, timeout=20)
resp = json.loads(result.stdout)
data = resp.get("data", resp)

for k in ("remainPoint", "remainCoins", "remainMoney", "apiType"):
    if k in data:
        print("{}={}".format(k, data[k]))

print("ALL_KEYS=" + ",".join(sorted(data.keys())))