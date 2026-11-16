"""同一张肖像卡、同一 Prompt，独立生成两张，用于跨片一致性观察。

通道固定为前几轮在用的 AI 应用：
  app 2046794551444119554 = 全能图片G-2.0-文生图-低价渠道版
  node 18:prompt / 18:aspectRatio=3:4 / 18:resolution=1k，实例类型 default
标准模型 API 对本账号不可用（Gemini 系 40310 下架、国产系 1014 需企业 Key）。

不做 Prompt 改写：直接把 card.md 正文（frontmatter 之后）原样送验。
两次任务除 Task 自身随机性外无任何差异，产物名 portrait-a / portrait-b。
用法：python Log/Circle8/run_portrait.py
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "Skill" / "RHclaw" / "runninghub" / "scripts"))

import runninghub_app as app  # noqa: E402
from runninghub import require_api_key, poll_task  # noqa: E402

CARD = ROOT / "Log/Circle8/figure-symmetric-cartographer.md"
OUT = ROOT / "Log/Circle8/output"
APP_ID = "2046794551444119554"
INSTANCE = "default"
SETTINGS = [("18", "aspectRatio", "3:4"), ("18", "resolution", "1k")]
PROMPT_NODE = ("18", "prompt")


def card_prompt(path):
    text = path.read_text(encoding="utf-8")
    if text.startswith("---"):
        return text.split("---", 2)[2].strip()
    return text.strip()


def run_once(api_key, prompt, target):
    nodes = app.get_node_info(api_key, APP_ID)
    for nid, field, value in SETTINGS:
        hit = [n for n in nodes if n["nodeId"] == nid and n["fieldName"] == field]
        if not hit:
            raise SystemExit(f"节点缺失 {nid}:{field}")
        hit[0]["fieldValue"] = value
    node = next(n for n in nodes if n["nodeId"] == PROMPT_NODE[0]
                and n["fieldName"] == PROMPT_NODE[1])
    node["fieldValue"] = prompt
    assert node["fieldValue"] == prompt, "prompt 被改动"

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
        print("NO_RESULT", json.dumps(final, ensure_ascii=False)[:400], flush=True)
        return None
    url, ext = found[0]
    out = pathlib.Path(target).with_suffix("." + (ext or "png"))
    app.download_file(url, str(out))
    print("OUTPUT_FILE", out, flush=True)
    return {"task": tid, "charged": usage.get("chargedPoint"), "file": out.name}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    prompt = card_prompt(CARD)
    (OUT / "prompt-portrait-shared.txt").write_text(prompt, encoding="utf-8")
    print(f"Prompt 取自 {CARD.name}，{len(prompt)} 字符，{prompt.count(chr(10)) + 1} 行", flush=True)

    api_key = require_api_key(None)
    runs = []
    for tag in ("c", "d"):
        (OUT / f"portrait-{tag}.png.prompt.txt").write_text(prompt, encoding="utf-8")
        print(f"== portrait-{tag} 开始 ==", flush=True)
        info = run_once(api_key, prompt, OUT / f"portrait-{tag}.png")
        if not info:
            return 1
        runs.append({"tag": tag, **info})

    total = sum(float(r["charged"] or 0) for r in runs)
    record = {
        "app_id": APP_ID,
        "instance": INSTANCE,
        "settings": {f"{n}:{f}": v for n, f, v in SETTINGS},
        "prompt_chars": len(prompt),
        "prompt_file": "prompt-portrait-shared.txt",
        "card_sha256_12": (
            __import__("hashlib").sha256(CARD.read_bytes()).hexdigest()[:12].upper()
        ),
        "runs": runs,
        "charged_total": round(total, 2),
    }
    (OUT / "runs-symmetric.json").write_text(json.dumps(record, ensure_ascii=False, indent=2),
                                            encoding="utf-8")
    print(json.dumps(record, ensure_ascii=False, indent=2), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
