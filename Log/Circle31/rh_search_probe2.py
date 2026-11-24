"""只读：定出 /api/search/workflow 的关键词字段名，并落一份带 tags/labels 的样本（UTF-8 存盘）。
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
OUT = Path(__file__).resolve().parent


def post(path, payload):
    req = urllib.request.Request(
        BASE + path, data=json.dumps(payload).encode(), method="POST",
        headers={"Content-Type": "application/json", "User-Agent": UA,
                 "Origin": BASE, "Referer": BASE + "/workflows", "Authorization": KEY},
    )
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


if __name__ == "__main__":
    base = {"current": 1, "size": 5}
    print("baseline", post("/api/search/workflow", base).get("data", {}).get("total"))
    for key in ("keyword", "searchContent", "searchKey", "title", "query", "name", "searchText"):
        try:
            j = post("/api/search/workflow", {**base, key: "video"})
            d = j.get("data") or {}
            print(f"{key:14s} -> code={j.get('code')} total={d.get('total')}")
        except Exception as e:
            print(f"{key:14s} -> ERR {e}")
    j = post("/api/search/workflow", {"current": 1, "size": 10, "sort": "HOTTEST"})
    (OUT / "search-sample.json").write_text(json.dumps(j, ensure_ascii=False, indent=1), encoding="utf-8")
    print("sample saved, n=", len((j.get("data") or {}).get("records") or []))
