"""只读：查两个已完成任务的完整返回，看服务端是否暴露工作流/版本字段。"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "Skill" / "RHclaw" / "runninghub" / "scripts"))

from runninghub import require_api_key, poll_task  # noqa: E402

key = require_api_key(None)
for tid in ("2122215035463163905", "2122215209665187842"):
    final = poll_task(key, tid)
    keep = {k: v for k, v in final.items() if k != "results"}
    print("TASK", tid)
    print(json.dumps(keep, ensure_ascii=False)[:2000])
    if final.get("results"):
        print("RESULTS", json.dumps(final["results"], ensure_ascii=False)[:600])
    print()
