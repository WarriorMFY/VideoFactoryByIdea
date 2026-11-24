"""只读：搜 RunningHub 应用市场里的「视频→视频」类应用（零积分；只列 title/webappId，不跑）。

用法：python Log/Circle31/v2v_search.py
"""
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "Skill" / "hub" / "generation" / "runninghub" / "scripts"))
from rh_credential import load_key  # noqa: E402

URL = "https://www.runninghub.cn/openapi/v2/aiapp/list"
KWS = ["视频生视频", "视频转视频", "video to video", "视频编辑", "视频续写", "视频重绘", "视频风格化"]


def probe(keyword, size=20, sort="HOTTEST", days=60):
    payload = {"current": 1, "size": size, "sort": sort, "days": days}
    if keyword:
        payload["keyword"] = keyword
    req = urllib.request.Request(
        URL, data=json.dumps(payload).encode(), method="POST",
        headers={"Content-Type": "application/json", "Authorization": load_key()},
    )
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
    print(f"\n##### {keyword!r} total={d.get('total')} returned={len(recs)}")
    for it in recs:
        desc = (it.get("description") or "").replace("\n", " ")[:60]
        print(f"  {it.get('webappId')} | {it.get('title')} | {desc}")


if __name__ == "__main__":
    for kw in (sys.argv[1:] or KWS):
        probe(kw)
