"""只读：把 10 个任务的账单字段与尺寸并列，找「执行者」留下的痕迹。"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "Skill/RHclaw/runninghub/scripts"))

from PIL import Image  # noqa: E402
from runninghub import require_api_key, poll_task  # noqa: E402

DIR = ROOT / "Log/Circle8/output/v3-fixed10"
runs = json.loads((DIR / "runs.json").read_text(encoding="utf-8"))["runs"]
key = require_api_key(None)

rows = []
for r in runs:
    with Image.open(DIR / r["image"]) as im:
        size = f"{im.width}x{im.height}"
    final = poll_task(key, r["info"]["task"])
    usage = final.get("usage") or {}
    keep = {k: v for k, v in final.items() if k not in ("results", "usage")}
    rows.append((r["tag"], size, usage, keep))
    print(f"{r['tag']} {size} usage={json.dumps(usage, ensure_ascii=False)}")
    if r["tag"] == "01":
        print("  顶层其他字段:", json.dumps(keep, ensure_ascii=False)[:900])

print("\n按尺寸分组后各字段取值：")
for size in sorted({x[1] for x in rows}):
    sub = [x[2] for x in rows if x[1] == size]
    print(f"\n{size}  共 {len(sub)} 个")
    keys = sorted({k for u in sub for k in u})
    for k in keys:
        vals = sorted({str(u.get(k)) for u in sub})
        print(f"  {k:<26} {vals}")
