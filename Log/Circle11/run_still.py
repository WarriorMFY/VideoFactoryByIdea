"""Circle11 文生图：地貌卡 → G-2.0 通道出图（16:9 横构图）。

用法：
  python Log/Circle11/run_still.py a          # 读 prompt-v1-image.txt，出 a.png
  python Log/Circle11/run_still.py b 4:3      # 指定比例

每张自动写账本（chargedPoint）。快照 <tag>.png.prompt.txt 与 Circle5/6/10 同口径。
"""
import hashlib
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "Skill" / "RHclaw" / "runninghub" / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.stdout.reconfigure(encoding="utf-8")

import runninghub_app as app  # noqa: E402
from runninghub import require_api_key, poll_task  # noqa: E402

HERE = Path(__file__).resolve().parent
OUT = HERE / "output"
APP_ID = "2046794551444119554"
INSTANCE = "default"


def build_nodes(api_key, prompt, ratio):
    nodes = app.get_node_info(api_key, APP_ID)
    for field, value in (("aspectRatio", ratio), ("resolution", "1k")):
        hit = [n for n in nodes if n["nodeId"] == "18" and n["fieldName"] == field]
        if not hit:
            raise SystemExit("节点缺失 18:" + field)
        hit[0]["fieldValue"] = value
    node = next(n for n in nodes if n["nodeId"] == "18" and n["fieldName"] == "prompt")
    node["fieldValue"] = prompt
    assert node["fieldValue"] == prompt, "prompt 被改动"
    return nodes


def main():
    tag = sys.argv[1] if len(sys.argv) > 1 else "a"
    ratio = sys.argv[2] if len(sys.argv) > 2 else "16:9"
    src = HERE / (sys.argv[3] if len(sys.argv) > 3 else "prompt-v1-image.txt")
    OUT.mkdir(parents=True, exist_ok=True)

    prompt = src.read_text(encoding="utf-8").strip()
    (OUT / "{}.png.prompt.txt".format(tag)).write_text(prompt, encoding="utf-8")
    print("prompt {} 字 / {} 行".format(len(prompt), prompt.count("\n") + 1), flush=True)

    api_key = require_api_key(None)
    nodes = build_nodes(api_key, prompt, ratio)
    data = app.submit_task(api_key, APP_ID, nodes, INSTANCE)
    tid = str(data["taskId"])
    print("TASK_ID", tid, flush=True)
    final = poll_task(api_key, tid)
    usage = final.get("usage") or {}
    charged = usage.get("chargedPoint")
    print("CHARGED_POINT", charged, flush=True)

    found = [(r.get("url") or r.get("outputUrl"), r.get("outputType", ""))
             for r in (final.get("results") or [])]
    found = [(u, e) for u, e in found if u]
    if not found:
        print("NO_RESULT", str(final)[:300], flush=True)
        return 1
    url, ext = found[0]
    out = OUT / "{}.{}".format(tag, ext or "png")
    app.download_file(url, str(out))
    h = hashlib.sha256(prompt.encode("utf-8")).hexdigest()[:12].upper()
    print("OUTPUT_FILE", out, flush=True)
    print("PROMPT_SHA12", h, flush=True)

    try:
        import credit
        credit.add(tag, charged if charged is not None else 0, src.name)
    except Exception as e:  # noqa: BLE001
        print("LEDGER_WARN", e, flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
