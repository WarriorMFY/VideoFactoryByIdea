"""RunningHub 账户查询（正确口径）：以 remainPoint 为可用积分，不修改 Skill/。

Skill/RHClaw 的 --check 只看 remainMoney（钱包现金），因此余额为 0 时会误报
no_balance。本工具打印账户原始字段，用于核对真实可用积分。

    python Tool/account.py
"""
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "Skill/RHClaw/runninghub/scripts"))
sys.stdout.reconfigure(encoding="utf-8")

import runninghub as rh  # noqa: E402


def api_key():
    k = os.environ.get("RUNNINGHUB_API_KEY", "").strip()
    if k:
        return k, "env"
    for line in (ROOT / "AGENTS.md").read_text(encoding="utf-8").splitlines():
        if "apikey" in line.lower() and ":" in line:
            k = line.split(":", 1)[1].strip()
            if k:
                return k, "AGENTS.md"
    return None, None


def main():
    key, src = api_key()
    if not key:
        print("未找到 API key：请设置 RUNNINGHUB_API_KEY，或在 AGENTS.md 的 #参数 中提供")
        return 2
    headers = {"Content-Type": "application/json", "Authorization": "Bearer " + key}
    r = rh.curl_post_json(rh.ACCOUNT_STATUS_URL, {"apikey": key}, headers, timeout=20)
    if r.returncode != 0:
        print("请求失败:", (r.stdout or r.stderr)[:300])
        return 1
    data = json.loads(r.stdout).get("data", {})
    print("key_source=" + src)
    for k in ("remainPoint", "remainCoins", "remainMoney", "currentTaskCounts", "apiType", "currency"):
        if k in data:
            print("{}={}".format(k, data[k]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
