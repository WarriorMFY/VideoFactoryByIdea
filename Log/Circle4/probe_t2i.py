"""探测文生图 AI 应用通道：跑一次，回读 chargedPoint，用于横向比价。

用法：
  python Log/Circle4/probe_t2i.py --app 2061698064745852930 \
      --set "1:resolution=1k" --set "1:aspectRatio=16:9" \
      --prompt "..." --out Log/Circle4/output/_probe_v2.png
"""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "Skill" / "RHclaw" / "runninghub" / "scripts"))

import runninghub_app as app  # noqa: E402
from runninghub import require_api_key, poll_task  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--prompt", required=True)
    ap.add_argument("--set", action="append", default=[], help="nodeId:fieldName=value")
    ap.add_argument("--prompt-node", default="", help="默认取 fieldName 为 prompt 的节点")
    ap.add_argument("--out", default="")
    a = ap.parse_args()

    api_key = require_api_key(None)
    nl = app.get_node_info(api_key, a.app)

    for s in a.set:
        k, v = s.split("=", 1)
        nid, fld = k.split(":", 1)
        hit = [n for n in nl if n["nodeId"] == nid and n["fieldName"] == fld]
        if not hit:
            print("SET_MISS", nid, fld)
            continue
        hit[0]["fieldValue"] = v
        print("SET", nid, fld, "=", v)

    if a.prompt_node:
        nid, fld = a.prompt_node.split(":", 1)
        tgt = next(n for n in nl if n["nodeId"] == nid and n["fieldName"] == fld)
    else:
        tgt = next(n for n in nl if n["fieldName"] == "prompt")
    tgt["fieldValue"] = a.prompt
    assert tgt["fieldValue"] == a.prompt, "prompt 被改动"

    data = app.submit_task(api_key, a.app, nl, "default")
    tid = str(data["taskId"])
    final = poll_task(api_key, tid)

    usage = final.get("usage") or {}
    print("APP", a.app)
    print("TASK_ID", tid)
    print("CHARGED_POINT", usage.get("chargedPoint"))
    print("USAGE", json.dumps(usage, ensure_ascii=False))

    results = final.get("results") or []
    urls = [(r.get("url") or r.get("outputUrl"), r.get("outputType", "")) for r in results]
    urls = [(u, e) for u, e in urls if u]
    if not urls:
        print("NO_RESULT", json.dumps(final, ensure_ascii=False)[:400])
        return 1
    if a.out:
        url, ext = urls[0]
        out = Path(a.out).with_suffix("." + (ext or "png"))
        app.download_file(url, str(out))
        print("OUTPUT_FILE", out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
