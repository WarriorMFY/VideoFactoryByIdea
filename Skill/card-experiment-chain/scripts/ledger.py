"""预算账本：按循环记账，触线即停。

用法：
  python ledger.py --ledger Log/Circle12/ledger.json status
  python ledger.py --ledger Log/Circle12/ledger.json --budget 60 add <tag> <charged> [note]

口径：
  - 首次调用时初始化 ledger.json（记录 start_remain、budget）
  - 余额以 remainPoint 为准；单次消耗优先用任务回传 chargedPoint
  - 累计 charged >= budget 时 status 打印 STOP
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "Skill" / "RHclaw" / "runninghub" / "scripts"))
sys.stdout.reconfigure(encoding="utf-8")

import runninghub as rh  # noqa: E402


def api_key():
    k = os.environ.get("RUNNINGHUB_API_KEY", "").strip()
    if k:
        return k
    for line in (ROOT / "AGENTS.md").read_text(encoding="utf-8").splitlines():
        if "apikey" in line.lower() and ":" in line:
            v = line.split(":", 1)[1].strip()
            if v:
                return v
    raise SystemExit("no api key")


def remain_point():
    key = api_key()
    headers = {"Content-Type": "application/json", "Authorization": "Bearer " + key}
    r = rh.curl_post_json(rh.ACCOUNT_STATUS_URL, {"apikey": key}, headers, timeout=20)
    if r.returncode != 0:
        raise SystemExit("账户查询失败: " + (r.stdout or r.stderr)[:200])
    return json.loads(r.stdout).get("data", {}).get("remainPoint")


def load(path, budget):
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    led = {
        "start_remain": remain_point(),
        "budget": float(budget),
        "started_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "items": [],
    }
    save(path, led)
    return led


def save(path, led):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(led, ensure_ascii=False, indent=2), encoding="utf-8")


def status(path, led):
    used = sum(float(i.get("charged") or 0) for i in led["items"])
    print("ledger={}".format(path))
    print("start_remain={}".format(led["start_remain"]))
    print("now_remain={}".format(remain_point()))
    print("tasks={} used={:.2f} budget={:.2f} left={:.2f}".format(
        len(led["items"]), used, led["budget"], led["budget"] - used))
    for i in led["items"]:
        print("  {ts}  {tag:<14} charged={charged}  {note}".format(**i))
    if used >= led["budget"]:
        print("STOP 预算已触线，不得再提交任务")
    return 0


def add(path, led, tag, charged, note=""):
    before = remain_point()
    led["items"].append({
        "ts": time.strftime("%Y-%m-%d %H:%M:%S"),
        "tag": tag,
        "charged": float(charged),
        "note": note,
        "bal_before": before,
        "bal_after": remain_point(),
    })
    save(path, led)
    return status(path, led)


def main():
    ap = argparse.ArgumentParser(description="循环预算账本")
    ap.add_argument("--ledger", required=True, help="ledger.json 路径")
    ap.add_argument("--budget", type=float, default=50.0, help="首次初始化时的预算")
    ap.add_argument("cmd", nargs="?", default="status", choices=("status", "add"))
    ap.add_argument("tag", nargs="?")
    ap.add_argument("charged", nargs="?")
    ap.add_argument("note", nargs="?", default="")
    a = ap.parse_args()

    path = Path(a.ledger)
    if not path.is_absolute():
        path = ROOT / path
    led = load(path, a.budget)

    if a.cmd == "status":
        return status(path, led)
    if a.cmd == "add" and a.tag and a.charged is not None:
        return add(path, led, a.tag, a.charged, a.note)
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main())
