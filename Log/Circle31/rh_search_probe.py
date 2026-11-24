"""只读探测 RunningHub 站内搜索/市场接口：标签树、工作流搜索、模型搜索（零积分）。

发现路径：Workspace/rh_js_cache/2F_lVkei.js 里的 yz() 服务定义：
  /api/portal/template/tags  /api/portal/tag/tree  /api/search/workflow
  /api/portal/template/list  /api/portal/model/list  /api/search/model
"""
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


def post(path, payload):
    req = urllib.request.Request(
        BASE + path, data=json.dumps(payload).encode(), method="POST",
        headers={"Content-Type": "application/json", "User-Agent": UA,
                 "Origin": BASE, "Referer": BASE + "/workflows", "Authorization": KEY},
    )
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            return json.loads(r.read().decode("utf-8", "replace"))
    except Exception as e:
        return {"code": "ERR", "msg": str(e)}


def show(label, path, payloads):
    print(f"\n=== {label}  {path}")
    for p in payloads:
        j = post(path, p)
        if j.get("code") != 0:
            print("  ", p, "->", j.get("code"), str(j.get("msg"))[:120])
            continue
        d = j.get("data") or {}
        recs = d.get("records") or d.get("list") or []
        print("  ", p, f"total={d.get('total')} n={len(recs)}")
        if recs and isinstance(recs[0], dict):
            print("    fields:", ",".join(list(recs[0].keys())[:20]))
            for r in recs[:3]:
                print("    -", r.get("title") or r.get("name"), "|", r.get("webappId") or r.get("id"))


if __name__ == "__main__":
    show("tag tree", "/api/portal/tag/tree", [{}])
    show("template tags", "/api/portal/template/tags", [{}, {"type": "workflow"}])
    show("search workflow", "/api/search/workflow", [
        {"current": 1, "size": 10, "keyword": "视频生视频"},
        {"current": 1, "size": 10, "searchKey": "视频生视频"},
        {"current": 1, "size": 10, "name": "视频生视频"},
    ])
    show("model list", "/api/portal/model/list", [{"current": 1, "size": 10}])
    show("search model", "/api/search/model", [
        {"current": 1, "size": 10, "keyword": "video"},
    ])
