"""Circle13 积分账本：预算 100，用于验证「元素容量守恒」与「时长是否解容量」。

用法：
  python Log/Circle13/credit.py status
  python Log/Circle13/credit.py add <tag> <charged> [note]

口径：
  - 余额以 remainPoint 为准（Tool/account.py 同源）
  - 单次消耗以任务返回的 chargedPoint 为准
  - 触线判定：累计 charged >= budget 时 status 打印 STOP
"""
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "Skill" / "RHclaw" / "runninghub" / "scripts"))
sys.stdout.reconfigure(encoding="utf-8")

import runninghub as rh  # noqa: E402

HERE = Path(__file__).resolve().parent
LEDGER = HERE / "ledger.json"
BUDGET = 100.0  # 2026-11-17 14:55 用户新给 100 分：拆条验容量 + 9s 验时长


def api_key():
    import os
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


def load():
    if LEDGER.exists():
        return json.loads(LEDGER.read_text(encoding="utf-8"))
    led = {
        "start_remain": remain_point(),
        "budget": BUDGET,
        "started_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "items": [],
    }
    LEDGER.write_text(json.dumps(led, ensure_ascii=False, indent=2), encoding="utf-8")
    return led


def save(led):
    LEDGER.write_text(json.dumps(led, ensure_ascii=False, indent=2), encoding="utf-8")


def status():
    led = load()
    used = sum(float(i.get("charged") or 0) for i in led["items"])
    n = len(led["items"])
    print("start_remain={}".format(led["start_remain"]))
    print("now_remain={}".format(remain_point()))
    print("tasks={} used={:.2f} budget={:.2f} left={:.2f}".format(
        n, used, led["budget"], led["budget"] - used))
    for i in led["items"]:
        print("  {ts}  {tag:<14} charged={charged}  {note}".format(**i))
    if used >= led["budget"]:
        print("STOP 预算已触线，不得再提交任务")
    return 0


def add(tag, charged, note=""):
    led = load()
    led["items"].append({
        "ts": time.strftime("%Y-%m-%d %H:%M:%S"),
        "tag": tag,
        "charged": float(charged),
        "note": note,
    })
    save(led)
    return status()


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    if cmd == "status":
        return status()
    if cmd == "add" and len(sys.argv) >= 4:
        return add(sys.argv[2], sys.argv[3], sys.argv[4] if len(sys.argv) > 4 else "")
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main())
