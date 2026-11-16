"""直接从 app 列表的 invokeExample 里解析入参，筛出支持图片输入的应用。"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "Skill" / "RHclaw" / "runninghub" / "scripts"))

import runninghub_app as app  # noqa: E402
from runninghub import require_api_key  # noqa: E402

KEY = require_api_key(None)
DEC = json.JSONDecoder()

rows = {}
for sort in ("RECOMMEND", "HOTTEST"):
    for page in range(1, 7):
        try:
            data = app.list_apps(KEY, sort=sort, size=50, page=page)
        except SystemExit:
            break
        recs = data.get("records") or []
        if not recs:
            break
        for r in recs:
            ex = r.get("invokeExample") or ""
            wid = re.search(r"/run/ai-app/(\d+)", ex)
            if not wid:
                continue
            payload = None
            i = ex.find("--data-raw")
            if i != -1:
                j = ex.find("{", i)
                try:
                    payload, _ = DEC.raw_decode(ex[j:])
                except ValueError:
                    payload = None
            fields = []
            for n in (payload or {}).get("nodeInfoList", []):
                fields.append((str(n.get("nodeId")), n.get("fieldName"),
                               (n.get("description") or "").replace("\n", " ")[:12]))
            rows[wid.group(1)] = {"id": wid.group(1),
                                  "title": (r.get("title") or "").strip(),
                                  "fields": fields}
        if not data.get("hasNext"):
            break

print(f"共解析应用 {len(rows)} 个\n")
IMGWORD = re.compile(r"图像|图片|参考图|底图|原图|人脸|蒙版|参考", re.I)
PORTRAIT = re.compile(r"人像|肖像|写真|参考|图生图|换脸|角色|一致性|kontext|banana|character|face", re.I)

img_apps = []
for a in rows.values():
    imgs = [f for f in a["fields"] if IMGWORD.search(f[2] or "") or
            re.search(r"image|img|ref|mask", f[1] or "", re.I)]
    if imgs:
        img_apps.append((a, imgs))

print(f"支持图片输入的 {len(img_apps)} 个；其中疑似人像/参考类：\n")
for a, imgs in img_apps:
    if PORTRAIT.search(a["title"]):
        detail = "，".join(f"{n}:{f}({d})" for n, f, d in imgs)
        others = "，".join(f"{n}:{f}" for n, f, d in a["fields"] if (n, f, d) not in imgs)
        print(f"{a['id']}  {a['title']}")
        print(f"     图片入参：{detail}")
        print(f"     其余入参：{others}\n")

(ROOT / "Workspace" / "_apps_image.json").write_text(
    json.dumps([{"id": a["id"], "title": a["title"],
                 "fields": a["fields"], "image_fields": imgs}
                for a, imgs in img_apps], ensure_ascii=False, indent=2),
    encoding="utf-8")
print("全量落盘：Workspace/_apps_image.json")
