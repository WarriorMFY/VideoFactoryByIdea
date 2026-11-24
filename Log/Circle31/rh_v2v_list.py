"""只读：拉全 RunningHub「视频生视频」类工作流（标签 1871131343570333697，8720 条），
按使用量排前 40 条再取 detail（webappId / usedModels），零积分。
"""
import json
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "Skill" / "hub" / "generation" / "runninghub" / "scripts"))
from rh_credential import load_key  # noqa: E402

KEY = load_key()
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36"
BASE = "https://www.runninghub.cn"
OUT = Path(__file__).resolve().parent
TAG = "1871131343570333697"


def post(path, payload):
    req = urllib.request.Request(
        BASE + path, data=json.dumps(payload).encode(), method="POST",
        headers={"Content-Type": "application/json", "User-Agent": UA,
                 "Origin": BASE, "Referer": BASE + "/workflows", "Authorization": KEY},
    )
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def slim(r):
    st = r.get("statisticsInfo") or {}
    return {
        "id": r.get("id"),
        "name": r.get("name"),
        "labels": r.get("labels"),
        "owner": (r.get("owner") or {}).get("name"),
        "use": int(st.get("useCount") or 0),
        "like": int(st.get("likeCount") or 0),
        "collect": int(st.get("collectCount") or 0),
        "pub": (r.get("publishTime") or "")[:10],
        "desc": (r.get("desc") or "")[:160],
    }


if __name__ == "__main__":
    rows, page, size, total = [], 1, 100, None
    while True:
        d = post("/api/search/workflow", {"current": page, "size": size, "tags": [TAG]}).get("data") or {}
        total = int(d.get("total") or 0)
        recs = d.get("records") or []
        if page == 1:
            print(f"total={total} page1_n={len(recs)}")
            if recs:
                size = len(recs)  # 服务端可能压页大小
        if not recs:
            break
        rows.extend(slim(r) for r in recs)
        if page % 10 == 0:
            print(f"  page {page} rows {len(rows)}")
        if total and len(rows) >= total:
            break
        page += 1
        if page > 500:
            print("  stop at 500 pages")
            break
        time.sleep(0.05)
    rows.sort(key=lambda x: -x["use"])
    (OUT / "v2v-workflows.json").write_text(
        json.dumps({"total": total, "fetched": len(rows), "rows": rows}, ensure_ascii=False, indent=1),
        encoding="utf-8")
    print(f"saved v2v-workflows.json fetched={len(rows)}")

    top = rows[:40]
    det = []
    for i, r in enumerate(top, 1):
        try:
            d = post("/api/portal/workflow/detail", {"workflowId": r["id"]}).get("data") or {}
        except Exception as e:
            print(f"  {r['id']} ERR {e}")
            d = {}
        det.append({**r, "webappId": d.get("webappId"), "usedModels": d.get("usedModels"),
                    "nodeCount": d.get("nodeCount"), "keys": None if i > 1 else sorted(d.keys())})
    (OUT / "v2v-top40.json").write_text(json.dumps(det, ensure_ascii=False, indent=1), encoding="utf-8")
    print("saved v2v-top40.json")
    print("detail keys:", det[0]["keys"])
