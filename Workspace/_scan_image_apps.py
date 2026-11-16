"""扫一遍可用 AI 应用，找支持「图片输入」的应用（只读，不调生成）。"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "Skill" / "RHclaw" / "runninghub" / "scripts"))

import runninghub_app as app  # noqa: E402
from runninghub import require_api_key  # noqa: E402

API_KEY = require_api_key(None)
IMG = re.compile(r"image|img|photo|mask|参考图|图片|图像|底图|原图", re.I)
WANT = re.compile(r"图生图|参考|人像|肖像|换脸|kontext|banana|character|face|photo|image", re.I)

apps, seen = [], set()
for sort in ("RECOMMEND", "HOTTEST"):
    for page in (1, 2, 3):
        try:
            data = app.list_apps(API_KEY, sort=sort, size=50, page=page)
        except SystemExit:
            break
        rows = data.get("records") or data.get("list") or data.get("rows") or []
        if not rows:
            break
        for r in rows:
            wid = str(r.get("webappId") or r.get("id") or "")
            if wid and wid not in seen:
                seen.add(wid)
                apps.append({"id": wid, "name": r.get("name") or r.get("title") or "",
                             "hot": r.get("usedTimes") or r.get("hot") or ""})

print(f"抓到应用 {len(apps)} 个；带图生图/人像关键词的候选：")
cands = [a for a in apps if WANT.search(a["name"])]
for a in cands:
    print(f"  {a['id']}  {a['name']}")
print(f"候选 {len(cands)} 个，开始探节点（失败即跳过）\n")

found = []
for a in cands[:40]:
    try:
        nodes = app.get_node_info(API_KEY, a["id"])
    except SystemExit:
        continue
    img_nodes = [n for n in nodes if IMG.search(str(n.get("fieldName", "")))
                 or IMG.search(str(n.get("description", "") or ""))]
    if img_nodes:
        found.append({
            "id": a["id"], "name": a["name"],
            "image_fields": [f"{n.get('nodeId')}:{n.get('fieldName')}={str(n.get('fieldValue'))[:40]}"
                             for n in img_nodes],
            "all_fields": [f"{n.get('nodeId')}:{n.get('fieldName')}" for n in nodes],
        })

for f in found:
    print(f"{f['id']}  {f['name']}")
    for x in f["image_fields"]:
        print("    IMG ", x)
    print("    全部 ", ", ".join(f["all_fields"]))

(ROOT / "Workspace" / "_apps.json").write_text(
    json.dumps({"apps": apps, "image_apps": found}, ensure_ascii=False, indent=2),
    encoding="utf-8")
print(f"\n支持图片输入的 {len(found)} 个，明细见 Workspace/_apps.json")
