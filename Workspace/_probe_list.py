"""探测 aiapp/list 的真实返回结构。"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "Skill" / "RHclaw" / "runninghub" / "scripts"))

import runninghub_app as app  # noqa: E402
from runninghub import require_api_key  # noqa: E402

key = require_api_key(None)
data = app.list_apps(key, sort="RECOMMEND", size=5, page=1)
print("data 顶层键:", list(data)[:20])
blob = json.dumps(data, ensure_ascii=False)
print("长度", len(blob))
print(blob[:2000])
