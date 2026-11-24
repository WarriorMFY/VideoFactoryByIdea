"""只读：定标签过滤字段名 + 拉全「视频生视频」类工作流清单（零积分）。

标签来自 /api/search/workflow 返回：{"id":"1871131343570333697","name":"视频生视频","labels":"Video-to-Video"}
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
TAG = "1871131343570333697"


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
    trials = {
        "labelIds": [TAG], "tagIds": [TAG], "tags": [TAG], "tagId": TAG,
        "labelId": TAG, "labels": [TAG], "labelsStr": TAG,
        "sort": "HOTTEST", "orderBy": "useCount",
    }
    for k, v in trials.items():
        try:
            d = post("/api/search/workflow", {**base, k: v}).get("data") or {}
            print(f"{k:12s} -> total={d.get('total')}")
        except Exception as e:
            print(f"{k:12s} -> ERR {e}")
