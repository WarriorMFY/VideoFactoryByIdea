"""看两个同家族图生图应用的默认入参。"""
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "Skill" / "RHclaw" / "runninghub" / "scripts"))

import runninghub_app as app  # noqa: E402
from runninghub import require_api_key  # noqa: E402

KEY = require_api_key(None)
for wid in ("2046794946094571522", "2093629860844498946"):
    print(f"\n== {wid} ==")
    try:
        nodes = app.get_node_info(KEY, wid)
    except SystemExit:
        print("  取不到节点（可能需先在网页跑过一次）")
        continue
    for n in nodes:
        print(f"  {n.get('nodeId')}:{n.get('fieldName')} = {str(n.get('fieldValue'))[:60]!r}"
              f"  // {n.get('description')}")
