"""查看 AI 应用的可改节点（不提交任务，不消耗积分）。

用法：python Log/Circle11/probe_nodes.py 2046794551444119554
"""
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "Skill" / "RHclaw" / "runninghub" / "scripts"))
sys.stdout.reconfigure(encoding="utf-8")

import runninghub_app as app  # noqa: E402


def api_key():
    k = os.environ.get("RUNNINGHUB_API_KEY", "").strip()
    if k:
        return k
    m = re.search(r"apikey:\s*(\S+)", (ROOT / "AGENTS.md").read_text(encoding="utf-8"))
    return m.group(1)


wid = sys.argv[1] if len(sys.argv) > 1 else "2046794551444119554"
nodes = app.get_node_info(api_key(), wid)
print("NODE_COUNT", len(nodes))
for n in nodes:
    print("{nodeId:>5} | {fieldName:<16} | {fieldValue}".format(**{
        "nodeId": n.get("nodeId"),
        "fieldName": n.get("fieldName"),
        "fieldValue": str(n.get("fieldValue"))[:80],
    }))
