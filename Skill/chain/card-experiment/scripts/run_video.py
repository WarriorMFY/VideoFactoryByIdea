"""文生视频：读 prompt → H3 通道出片，prompt 快照先落盘再提交。

用法：
  python run_video.py --prompt <chain>/video/prompt-video.txt --out <chain>/video/<tag>.mp4 \
      [--dur 1|5|6] [--ratio "16:9 (Widescreen)"] [--app 2085304953094107137] \
      [--node key=value ...] [--ledger <ledger.json>] [--timeout 1800]

时长索引：205:select 1=5s、5=9s、6=10s；换通道前先 --info 查节点。
"""
import argparse
import subprocess
import sys
from pathlib import Path

ROOT = next(p for p in Path(__file__).resolve().parents if (p / "Skill").is_dir() and (p / "Tool").is_dir())
sys.stdout.reconfigure(encoding="utf-8")

import rh_api  # noqa: E402

APP_ID = "2085304953094107137"
DEFAULT_NODES = {
    "250:prompt": None,
    "115:aspect_ratio": "16:9 (Widescreen)",
    "225:select": "1",
    "205:select": "1",
}


def resolve(p):
    p = Path(p)
    return p if p.is_absolute() else ROOT / p


def remain_point():
    from credential import load_key
    try:
        return rh_api.account_status(load_key())
    except SystemExit:
        return None


def main():
    ap = argparse.ArgumentParser(description="文生视频（MiniMax H3）")
    ap.add_argument("--prompt", required=True)
    ap.add_argument("--out", required=True, help="输出 mp4 路径，同目录写 <out>.prompt.txt")
    ap.add_argument("--tag", help="账本 tag，默认取输出文件名")
    ap.add_argument("--app", default=APP_ID)
    ap.add_argument("--dur", default="1", help="205:select：1=5s、5=9s、6=10s")
    ap.add_argument("--ratio", default="16:9 (Widescreen)")
    ap.add_argument("--node", action="append", default=[], metavar="KEY=VALUE")
    ap.add_argument("--ledger")
    ap.add_argument("--timeout", type=int, default=1800)
    a = ap.parse_args()

    src = resolve(a.prompt)
    if not src.exists():
        raise SystemExit("prompt 不存在：" + str(src))
    out = resolve(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)

    from credential import load_key
    key = load_key()          # 先验凭据：缺 key 不留快照、不提交

    prompt = src.read_text(encoding="utf-8").rstrip("\n")
    snapshot = Path(str(out) + ".prompt.txt")
    snapshot.write_text(prompt, encoding="utf-8")
    print("PROMPT_CHARS", len(prompt), "SNAPSHOT", snapshot.name, flush=True)

    nodes = dict(DEFAULT_NODES)
    nodes["115:aspect_ratio"] = a.ratio
    nodes["205:select"] = str(a.dur)
    for item in a.node:
        k, _, v = item.partition("=")
        nodes[k.strip()] = v
    nodes["250:prompt"] = prompt

    before = remain_point() if a.ledger else None

    node_list = rh_api.node_info(key, a.app)
    for k, v in nodes.items():
        nid, _, field = k.partition(":")
        hit = [n for n in node_list if n["nodeId"] == nid and n["fieldName"] == field]
        if not hit:
            sys.exit("节点缺失：%s（先查实际节点名再改 channels.md）" % k)
        hit[0]["fieldValue"] = v

    tid = rh_api.submit(key, a.app, node_list)
    final = rh_api.poll(key, tid)
    charged = rh_api.cost(final)
    print("CHARGED_POINT", charged, flush=True)

    got = rh_api.artifacts(final)
    if not got:
        print("NO_RESULT", str(final)[:300], flush=True)
        return 1
    url, ext = got[0]
    if ext and not out.suffix:
        out = out.with_suffix("." + ext)
    rh_api.download(url, str(out))
    print("OUTPUT_FILE", out, flush=True)

    if a.ledger:
        after = remain_point()
        cost = charged if charged is not None else (
            before - after if None not in (before, after) else None)
        if cost is None:
            print("LEDGER_WARN 无法确定消耗，未记账")
        else:
            note = src.name + ("" if charged is not None else "（余额差）")
            cmd = [sys.executable, str(Path(__file__).with_name("ledger.py")),
                   "--ledger", str(a.ledger), "add",
                   a.tag or out.stem, str(round(float(cost), 2)), note]
            if before is not None:
                cmd += ["--before", str(before)]
            subprocess.run(cmd)
    return 0


if __name__ == "__main__":
    sys.exit(main())
