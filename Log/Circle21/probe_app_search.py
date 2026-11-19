import json, os, sys, urllib.request

RH = r"F:\AgentWorkArea\WorkBuddy\CardStudio\Skill\hub\generation\runninghub\scripts"
sys.path.insert(0, RH)
from rh_credential import load_key  # noqa

KEY = load_key()
URL = "https://www.runninghub.cn/openapi/v2/aiapp/list"

def probe(keyword, size=50, sort="HOTTEST", days=60):
    payload = {"current": 1, "size": size, "sort": sort, "days": days}
    if keyword:
        payload["keyword"] = keyword
    data = json.dumps(payload).encode()
    req = urllib.request.Request(URL, data=data, method="POST",
                                 headers={"Content-Type": "application/json",
                                          "Authorization": KEY})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            resp = json.loads(r.read().decode())
    except Exception as e:
        print(f"[{keyword}] HTTP-FAIL {e}")
        return
    if resp.get("code") != 0:
        print(f"[{keyword}] code={resp.get('code')} msg={resp.get('msg')}")
        return
    d = resp.get("data", {})
    recs = d.get("records") or []
    print(f"\n##### keyword={keyword!r} total={d.get('total')} returned={len(recs)}")
    for it in recs:
        print(f"  {it.get('webappId')} | {it.get('title')}")

for kw in sys.argv[1:]:
    probe(kw)
