"""诊断探针：同一 prompt、只把画幅改成 1:1，跑 N 张，看方形是否也分成两种尺寸。

目的：区分三种可能
  H1 两条「1k」公式（1.0MP vs 1.5MP）→ 方形应为 1024x1024 与 1253x1253
  H2 只有 3:4 的取整不同 → 方形应全部相同
  H3 两个不同模型 → 方形尺寸可同可不同，但风格会分成两派

不改卡片，只读现有 prompt。参数：张数（默认 4）。
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "Log" / "Circle8"))

import run_portrait as rp  # noqa: E402
from PIL import Image  # noqa: E402

N = int(sys.argv[1]) if len(sys.argv) > 1 else 4
SRC = ROOT / "Log/Circle8/output/v3-fixed10/prompt.txt"
OUT = ROOT / "Log/Circle8/output/probe-square"
OUT.mkdir(parents=True, exist_ok=True)

rp.SETTINGS = [("18", "aspectRatio", "1:1"), ("18", "resolution", "1k")]
prompt = SRC.read_text(encoding="utf-8")
(OUT / "prompt.txt").write_text(prompt, encoding="utf-8")
print(f"探针画幅 1:1，prompt {len(prompt)} 字，共 {N} 张")

key = rp.require_api_key(None)
rows = []
for i in range(N):
    tag = f"{i + 1:02d}"
    info = rp.run_once(key, prompt, OUT / f"probe-{tag}.png")
    with Image.open(OUT / f"probe-{tag}.png") as im:
        size = f"{im.width}x{im.height}"
    print("RESULT", tag, size, info)
    rows.append({"tag": tag, "size": size, "info": info})

(OUT / "probe.json").write_text(
    json.dumps({"aspect": "1:1", "resolution": "1k", "runs": rows},
               ensure_ascii=False, indent=2), encoding="utf-8")
print("尺寸分布:", json.dumps({r["size"]: sum(1 for x in rows if x["size"] == r["size"])
                               for r in rows}, ensure_ascii=False))
