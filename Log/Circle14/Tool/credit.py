"""Circle14 积分账本：余额以 remainPoint 为准，单次以 chargedPoint / 余额差为准。

用法：
  python Log/Circle14/Tool/credit.py status
  python Log/Circle14/Tool/credit.py add <tag> <charged> [note]
"""
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "Skill" / "hub" / "generation" / "runninghub" / "scripts"))
sys.stdout.reconfigure(encoding="utf-8")

import runninghub as rh  # noqa: E402

HERE = Path(__file__).resolve().parents[1]
LEDGER = HERE / "ledger.json"


def api_key() -> str:
    import os
    key = os.environ.get("RUNNINGHUB_API_KEY", "").strip()
    if key:
        return key
    cred = ROOT / "Skill" / "chain" / "card-experiment" / "credential.txt"
    for line in cred.read_text(encoding="utf-8").splitlines():
        if line.startswith("RUNNINGHUB_API_KEY="):
            return line.split("=", 1)[1].strip()
    raise SystemExit("no api key")


def remain_point() -> float | None:
    key = api_key()
    headers = {"Content-Type": "application/json", "Authorization": "Bearer " + key}
    r = rh.curl_post_json(rh.ACCOUNT_STATUS_URL, {"apikey": key}, headers, timeout=20)
    if r.returncode != 0:
        raise SystemExit("账户查询失败: " + (r.stdout or r.stderr)[:200])
    return json.loads(r.stdout).get("data", {}).get("remainPoint")


def load() -> dict:
    return json.loads(LEDGER.read_text(encoding="utf-8"))


def save(led: dict) -> None:
    LEDGER.write_text(json.dumps(led, ensure_ascii=False, indent=2), encoding="utf-8")


def status() -> int:
    led = load()
    used = sum(float(i.get("charged") or 0) for i in led["items"])
    print("start_remain={}".format(led["start_remain"]))
    print("now_remain={}".format(remain_point()))
    print("tasks={} used={:.2f} budget={:.2f} left={:.2f}".format(
        len(led["items"]), used, led["budget"], led["budget"] - used))
    for i in led["items"]:
        print("  {ts}  {tag:<18} charged={charged}  {note}".format(**i))
    if used >= led["budget"]:
        print("STOP 预算已触线，不得再提交任务")
    return 0


def add(tag: str, charged: float, note: str = "", before: float | None = None,
        after: float | None = None) -> int:
    led = load()
    item = {"ts": time.strftime("%Y-%m-%d %H:%M:%S"), "tag": tag,
            "charged": float(charged), "note": note}
    if before is not None and after is not None:
        item["bal_before"] = before
        item["bal_after"] = after
    led["items"].append(item)
    save(led)
    return status()


def main() -> int:
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    if cmd == "status":
        return status()
    if cmd == "add" and len(sys.argv) >= 4:
        return add(sys.argv[2], float(sys.argv[3]), sys.argv[4] if len(sys.argv) > 4 else "")
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main())
