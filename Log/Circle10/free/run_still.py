"""自由任务 Step 1：出一张「全身 + 大长腿」首帧图。

通道沿用 G-2.0 文生图应用 2046794551444119554（node 18）。
构图参数是本次的关键：「大长腿」不写成形容词，而拆成三个视觉杠杆——
全身入画 / 机位在胸线 / 高腰裤腰线，再让模型在像素层面去兑现。

用法：python Log/Circle10/free/run_still.py <tag>
"""
import hashlib
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "Skill" / "RHclaw" / "runninghub" / "scripts"))

import runninghub_app as app  # noqa: E402
from runninghub import require_api_key, poll_task  # noqa: E402

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE / "output"
APP_ID = "2046794551444119554"
INSTANCE = "default"
SETTINGS = [("18", "aspectRatio", "3:4"), ("18", "resolution", "1k")]


def build_nodes(api_key, prompt):
    nodes = app.get_node_info(api_key, APP_ID)
    for nid, field, value in SETTINGS:
        hit = [n for n in nodes if n["nodeId"] == nid and n["fieldName"] == field]
        if not hit:
            raise SystemExit(f"节点缺失 {nid}:{field}")
        hit[0]["fieldValue"] = value
    node = next(n for n in nodes if n["nodeId"] == "18" and n["fieldName"] == "prompt")
    node["fieldValue"] = prompt
    assert node["fieldValue"] == prompt, "prompt 被改动"
    return nodes


def main():
    tag = sys.argv[1] if len(sys.argv) > 1 else "still-a"
    OUT.mkdir(parents=True, exist_ok=True)
    prompt = (HERE / "still-prompt.txt").read_text(encoding="utf-8").strip()
    (OUT / f"{tag}.png.prompt.txt").write_text(prompt, encoding="utf-8")
    print(f"prompt {len(prompt)} 字符 / {prompt.count(chr(10)) + 1} 行", flush=True)

    api_key = require_api_key(None)
    nodes = build_nodes(api_key, prompt)
    data = app.submit_task(api_key, APP_ID, nodes, INSTANCE)
    tid = str(data["taskId"])
    print("TASK_ID", tid, flush=True)
    final = poll_task(api_key, tid)
    usage = final.get("usage") or {}
    print("CHARGED_POINT", usage.get("chargedPoint"), flush=True)

    found = [(r.get("url") or r.get("outputUrl"), r.get("outputType", ""))
             for r in (final.get("results") or [])]
    found = [(u, e) for u, e in found if u]
    if not found:
        print("NO_RESULT", str(final)[:300], flush=True)
        return 1
    url, ext = found[0]
    out = OUT / f"{tag}.{ext or 'png'}"
    app.download_file(url, str(out))
    h = hashlib.sha256(prompt.encode("utf-8")).hexdigest()[:12].upper()
    print("OUTPUT_FILE", out, flush=True)
    print("PROMPT_SHA12", h, flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
