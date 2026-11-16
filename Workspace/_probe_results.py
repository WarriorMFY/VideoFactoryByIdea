"""只读：逐任务拉取完整返回，看每个任务到底返回几个文件、各自尺寸多少。

不消耗积分（只查状态 + 下载已生成的产物）。
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

print(f"{'tag':<4}{'本地':<12}{'返回数':<7}{'各结果尺寸':<34}{'taskCost':<9}{'usage字段'}")
for r in runs:
    tag, tid = r["tag"], r["info"]["task"]
    with Image.open(DIR / r["image"]) as im:
        local = f"{im.width}x{im.height}"
    final = poll_task(key, tid)
    res = final.get("results") or []
    sizes = []
    for item in res:
        url = item.get("url") or item.get("outputUrl")
        if not url:
            continue
        try:
            raw = urllib.request.urlopen(url, timeout=60).read()
            with Image.open(io.BytesIO(raw)) as im:
                sizes.append(f"{im.width}x{im.height}({len(raw)//1024}K)")
        except Exception as e:  # noqa: BLE001
            sizes.append(f"ERR {type(e).__name__}")
    usage = final.get("usage") or {}
    print(f"{tag:<4}{local:<12}{len(res):<7}{' | '.join(sizes):<34}"
          f"{str(usage.get('taskCostTime')):<9}{','.join(sorted(usage))}")
    if tag == runs[0]["tag"]:
        print("  首个任务 results 原始结构：")
        print("  " + json.dumps(res, ensure_ascii=False)[:900])
