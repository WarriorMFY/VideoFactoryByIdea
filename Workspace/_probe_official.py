"""诊断探针：走「全能图片G-2-文生图-官方稳定版」标准端点，同 prompt、3:4、1k、medium。

目的：确认官方通道是否比低价渠道版稳定（尺寸唯一）。参数：张数（默认 1）。
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "Skill" / "RHclaw" / "runninghub" / "scripts"))

import runninghub as rh  # noqa: E402
from PIL import Image  # noqa: E402

EP = "rhart-image-g-2-official/text-to-image"
N = int(sys.argv[1]) if len(sys.argv) > 1 else 1
SRC = ROOT / "Log/Circle8/output/v3-fixed10/prompt.txt"
OUT = ROOT / "Log/Circle8/output/probe-official"
OUT.mkdir(parents=True, exist_ok=True)

prompt = SRC.read_text(encoding="utf-8")
key = rh.require_api_key(None)
rows = []
for i in range(N):
    tag = f"{i + 1:02d}"
    payload = {"prompt": prompt, "aspectRatio": "3:4", "resolution": "1k",
               "quality": "medium"}
    resp = rh.api_post(key, f"{rh.BASE_URL}/{EP}", payload, timeout=120)
    tid = str(resp.get("taskId"))
    print("TASK_ID", tid, flush=True)
    final = rh.poll_task(key, tid)
    usage = final.get("usage") or {}
    items = final.get("results") or []
    url = items[0].get("url") or items[0].get("outputUrl") if items else None
    if not url:
        print("NO_RESULT", json.dumps(final, ensure_ascii=False)[:400])
        break
    dst = OUT / f"official-{tag}.png"
    rh.download_file(url, str(dst))
    with Image.open(dst) as im:
        size = f"{im.width}x{im.height}"
    print("RESULT", tag, size, "charged", usage.get("chargedPoint"), flush=True)
    rows.append({"tag": tag, "task": tid, "size": size,
                 "charged": usage.get("chargedPoint")})

(OUT / "probe.json").write_text(
    json.dumps({"endpoint": EP, "aspect": "3:4", "resolution": "1k",
                "quality": "medium", "runs": rows}, ensure_ascii=False, indent=2),
    encoding="utf-8")
