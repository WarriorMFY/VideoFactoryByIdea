"""RunningHub 账户查询（正确口径）：以 remainPoint 为可用积分。

runninghub_app.py 的 --check 只看 remainMoney（钱包现金），因此余额为 0 时会误报
no_balance。本工具打印账户原始字段，用于核对真实可用积分。

    python Skill/hub/generation/runninghub/scripts/account.py
"""
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.stdout.reconfigure(encoding="utf-8")

import rh_credential  # noqa: E402
import runninghub as rh  # noqa: E402


def api_key():
    k = os.environ.get("RUNNINGHUB_API_KEY", "").strip()
    if k:
        return k, "env"
    if rh_credential.CRED.exists():
        return rh_credential.load_key(), "credential.txt"
    return None, None


def main():
    key, src = api_key()
    if not key:
        print("未找到 API key：设置 RUNNINGHUB_API_KEY，或把 credential.example.txt 复制为 credential.txt 并填 key")
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
