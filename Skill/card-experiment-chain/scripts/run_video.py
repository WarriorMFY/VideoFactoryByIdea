"""文生视频：读 prompt → H3 通道出片，prompt 快照先落盘再提交。

用法：
  python run_video.py --prompt <chain>/video/prompt-video.txt --out <chain>/video/<tag>.mp4 \
      [--dur 1|5|6] [--ratio "16:9 (Widescreen)"] [--app 2085304953094107137] \
      [--node key=value ...] [--ledger <ledger.json>] [--timeout 1800]

时长索引：205:select 1=5s、5=9s、6=10s；换通道前先 --info 查节点。
"""
import argparse
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.stdout.reconfigure(encoding="utf-8")

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
    try:
        sys.path.insert(0, str(ROOT / "Skill" / "RHclaw" / "runninghub" / "scripts"))
        import json
        import runninghub as rh

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
    except Exception:  # noqa: BLE001
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
    runner = ROOT / "Skill" / "RHclaw" / "runninghub" / "scripts" / "runninghub_app.py"
    cmd = [sys.executable, str(runner), "--run", a.app]
    for k, v in nodes.items():
        cmd += ["--node", "%s=%s" % (k, v)]
    cmd += ["-o", str(out)]

    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8",
                       timeout=a.timeout)
    print("RC", r.returncode)
    print("--- STDOUT ---")
    print(r.stdout)
    if r.stderr:
        print("--- STDERR ---")
        print(r.stderr[-1500:])

    tid = re.search(r"Task ID[:：]\s*(\d+)", r.stdout + r.stderr)
    if tid:
        print("TASK_ID", tid.group(1))
    charged = re.search(r"chargedPoint[\"':=\s]+([0-9.]+)", r.stdout + r.stderr)

    if a.ledger and r.returncode == 0:
        after = remain_point()
        cost = float(charged.group(1)) if charged else (
            before - after if None not in (before, after) else None)
        if cost is None:
            print("LEDGER_WARN 无法确定消耗，未记账")
        else:
            note = src.name + ("" if charged else "（余额差）")
            subprocess.run([sys.executable, str(Path(__file__).with_name("ledger.py")),
                            "--ledger", str(a.ledger), "add",
                            a.tag or out.stem, str(round(cost, 2)), note])
    return r.returncode


if __name__ == "__main__":
    sys.exit(main())
