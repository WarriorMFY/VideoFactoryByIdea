"""只读：从本地 capabilities.json 统计「视频→视频」类端点（task=video-edit / video-to-video）。

零积分、零网络。输出每条的 name_cn / endpoint / 关键参数。
"""
import json
from collections import Counter
from pathlib import Path

CAP = Path(__file__).resolve().parents[2] / "Skill" / "hub" / "generation" / "runninghub" / "data" / "capabilities.json"


def main():
    data = json.loads(CAP.read_text(encoding="utf-8"))
    endpoints = data.get("endpoints") or data.get("data") or []
    if isinstance(endpoints, dict):
        endpoints = list(endpoints.values())
    tasks = Counter(e.get("task") for e in endpoints)
    print("task 分布:", dict(tasks))
    print()
    for e in endpoints:
        t = (e.get("task") or "").lower()
        ep = (e.get("endpoint") or "").lower()
        if "video-edit" in t or "video-to-video" in ep or "video2video" in ep:
            params = e.get("params") or []
            keys = ", ".join(
                f"{p['key']}{'*' if p.get('required') else ''}"
                + (f"[{p['min']}-{p['max']}]" if p.get("type") == "INT" and p.get("max") is not None else "")
                for p in params
            )
            print(f"- {e.get('name_cn')}")
            print(f"  {e.get('endpoint')}  task={e.get('task')}  pop={e.get('popularity')}")
            print(f"  params: {keys}")


if __name__ == "__main__":
    main()
