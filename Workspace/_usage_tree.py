"""只读：展开每个任务的 taskUsageList（父+子），并查子任务的产物尺寸。

若子任务产物与父任务同尺寸 → 子任务只是内部执行体；
若子任务产物是另一种尺寸 → 两条分支都在同一次提交里跑过。
"""
import io
import json
import pathlib
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "Skill/RHclaw/runninghub/scripts"))

from PIL import Image  # noqa: E402
from runninghub import require_api_key, poll_task  # noqa: E402

DIR = ROOT / "Log/Circle8/output/v3-fixed10"
runs = json.loads((DIR / "runs.json").read_text(encoding="utf-8"))["runs"]
key = require_api_key(None)


def shot(task_id):
    final = poll_task(key, task_id)
    out = []
    for item in final.get("results") or []:
        url = item.get("url") or item.get("outputUrl")
        if not url:
            continue
        try:
            raw = urllib.request.urlopen(url, timeout=60).read()
            with Image.open(io.BytesIO(raw)) as im:
                out.append(f"{im.width}x{im.height}")
        except Exception as e:  # noqa: BLE001
            out.append(f"ERR {type(e).__name__}")
    return final.get("status"), out


print(f"{'tag':<4}{'本地':<11}{'节点':<4}{'taskId结尾':<9}{'状态':<9}{'产物':<12}")
for r in runs:
    tag, pid = r["tag"], r["info"]["task"]
    with Image.open(DIR / r["image"]) as im:
        local = f"{im.width}x{im.height}"
    final = poll_task(key, pid)
    tree = final.get("taskUsageList") or []
    print(f"{tag:<4}{local:<11}{'父':<4}{pid[-6:]:<9}{final.get('status'):<9}{local:<12}"
          f"{' 树内 ' + str(len(tree)) + ' 项'}")
    for node in tree:
        cid = str(node.get("taskId"))
        if cid == pid:
            continue
        st, sizes = shot(cid)
        print(f"    └─ 子 {cid[-6:]:<8}{st:<9}{' | '.join(sizes) or '无产物':<12}"
              f"charge={node.get('usage', {}).get('chargedPoint')}")
