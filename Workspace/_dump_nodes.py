"""只读：dump 一次 AI 应用的节点默认值，用来判断每次提交的 payload 是否真的一样。"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "Skill" / "RHclaw" / "runninghub" / "scripts"))

import runninghub_app as app  # noqa: E402
from runninghub import require_api_key  # noqa: E402

APP_ID = "2046794551444119554"
key = require_api_key(None)
nodes = app.get_node_info(key, APP_ID)
print(f"节点数 {len(nodes)}")
for n in nodes:
    v = str(n.get("fieldValue", ""))
    v = v[:60] + "…" if len(v) > 60 else v
    print(f"  {n.get('nodeId'):>6}:{n.get('fieldName'):<16} = {v}")
