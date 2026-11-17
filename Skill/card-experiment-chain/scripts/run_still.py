"""文生图：读 prompt → G-2.0 通道出图，prompt 快照随图落盘。

用法：
  python run_still.py --prompt <chain>/image/prompt-image.txt --out <chain>/image/<tag>.png \
      [--ratio 16:9] [--resolution 1k] [--app 2046794551444119554] [--ledger <ledger.json>]

输出：
  <out> 与 <out>.prompt.txt
"""
import argparse
import hashlib
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "Skill" / "RHclaw" / "runninghub" / "scripts"))
sys.stdout.reconfigure(encoding="utf-8")

import runninghub_app as app  # noqa: E402
from runninghub import require_api_key, poll_task  # noqa: E402

APP_ID = "2046794551444119554"
INSTANCE = "default"


def resolve(p):
    p = Path(p)
    return p if p.is_absolute() else ROOT / p


def build_nodes(api_key, prompt, ratio, resolution):
    nodes = app.get_node_info(api_key, APP_ID)
    for field, value in (("aspectRatio", ratio), ("resolution", resolution)):
        hit = [n for n in nodes if n["nodeId"] == "18" and n["fieldName"] == field]
        if not hit:
            raise SystemExit("节点缺失 18:" + field)
        hit[0]["fieldValue"] = value
    node = next(n for n in nodes if n["nodeId"] == "18" and n["fieldName"] == "prompt")
    node["fieldValue"] = prompt
    assert node["fieldValue"] == prompt, "prompt 被改动"
    return nodes


def remain_point():
    import json
    import runninghub as rh
    import os

    key = os.environ.get("RUNNINGHUB_API_KEY", "").strip()
    if not key:
        for line in (ROOT / "AGENTS.md").read_text(encoding="utf-8").splitlines():
            if "apikey" in line.lower() and ":" in line:
                key = line.split(":", 1)[1].strip()
                if key:
                    break
    headers = {"Content-Type": "application/json", "Authorization": "Bearer " + key}
    r = rh.curl_post_json(rh.ACCOUNT_STATUS_URL, {"apikey": key}, headers, timeout=20)
    if r.returncode != 0:
        return None
    return json.loads(r.stdout).get("data", {}).get("remainPoint")


def main():
    ap = argparse.ArgumentParser(description="文生图（G-2.0）")
    ap.add_argument("--prompt", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--ratio", default="16:9")
    ap.add_argument("--resolution", default="1k")
    ap.add_argument("--app", default=APP_ID)
    ap.add_argument("--instance", default=INSTANCE)
    ap.add_argument("--ledger", help="可选：记账到该 ledger.json")
    a = ap.parse_args()

    src = resolve(a.prompt)
    if not src.exists():
        raise SystemExit("prompt 不存在：" + str(src))
    out = resolve(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)

    prompt = src.read_text(encoding="utf-8").rstrip("\n")
    snapshot = Path(str(out) + ".prompt.txt")
    snapshot.write_text(prompt, encoding="utf-8")
    print("PROMPT_CHARS", len(prompt), "SNAPSHOT", snapshot.name, flush=True)

    api_key = require_api_key(None)
    before = remain_point()
    nodes = build_nodes(api_key, prompt, a.ratio, a.resolution)
    data = app.submit_task(api_key, a.app, nodes, a.instance)
    tid = str(data["taskId"])
    print("TASK_ID", tid, flush=True)
    final = poll_task(api_key, tid)
    charged = (final.get("usage") or {}).get("chargedPoint")
    print("CHARGED_POINT", charged, flush=True)

    found = [(r.get("url") or r.get("outputUrl"), r.get("outputType", ""))
             for r in (final.get("results") or [])]
    found = [(u, e) for u, e in found if u]
    if not found:
        print("NO_RESULT", str(final)[:300], flush=True)
        return 1
    url, ext = found[0]
    if not out.suffix:
        out = out.with_suffix("." + (ext or "png"))
    app.download_file(url, str(out))
    print("OUTPUT_FILE", out, flush=True)
    print("PROMPT_SHA12",
          hashlib.sha256(prompt.encode("utf-8")).hexdigest()[:12].upper(), flush=True)

    if a.ledger:
        after = remain_point()
        cost = charged if charged is not None else (before - after if None not in (before, after) else None)
        if cost is None:
            print("LEDGER_WARN 无法确定消耗，未记账", flush=True)
        else:
            import subprocess
            note = "%s%s" % (src.name, "" if charged is not None else "（余额差）")
            subprocess.run([sys.executable, str(Path(__file__).with_name("ledger.py")),
                            "--ledger", str(a.ledger), "add", out.stem,
                            str(round(float(cost), 2)), note])
    return 0


if __name__ == "__main__":
    sys.exit(main())
