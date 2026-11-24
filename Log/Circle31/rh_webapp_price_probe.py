"""只读：找 webapp 的“运行消耗（积分）”字段（零积分）。试 detail 类接口。"""
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "Skill" / "hub" / "generation" / "runninghub" / "scripts"))
from rh_credential import load_key  # noqa: E402

KEY = load_key()
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36"
BASE = "https://www.runninghub.cn"
WA = "1990029249488801793"  # SeedVR2 视频高清放大+补帧

PATHS = [
    "/api/portal/webapp/detail", "/api/portal/webapp/info", "/api/portal/webapp/getDetail",
    "/api/portal/template/detail", "/api/portal/workflow/webapp", "/api/portal/webapp/price",
    "/api/openapi/webapp/detail", "/api/portal/webapp/get",
    "/api/portal/model/detail", "/api/portal/template/info",
]


def post(path, payload):
    req = urllib.request.Request(
        BASE + path, data=json.dumps(payload).encode(), method="POST",
        headers={"Content-Type": "application/json", "User-Agent": UA,
                 "Origin": BASE, "Referer": BASE + "/workflows", "Authorization": KEY},
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            return json.loads(r.read().decode("utf-8", "replace"))
    except Exception as e:
        return {"code": "ERR", "msg": str(e)[:80]}


if __name__ == "__main__":
    for p in PATHS:
        for pl in ({"webappId": WA}, {"id": WA}, {"workflowId": WA}):
            j = post(p, pl)
            if j.get("code") != 0:
                print(f"{p:36s} {list(pl)[0]:11s} -> {j.get('code')} {str(j.get('msg'))[:60]}")
                continue
            d = j.get("data") or {}
            flat = json.dumps(d, ensure_ascii=False)
            hits = [k for k in ("price", "cost", "coin", "fee", "credit", "point", "amount", "integral")
                    if k in flat.lower()]
            print(f"{p:36s} {list(pl)[0]:11s} -> OK len={len(flat)} hits={hits}")
            print("    keys:", ",".join(list(d.keys())[:22]) if isinstance(d, dict) else type(d).__name__)
