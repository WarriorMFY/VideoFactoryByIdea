"""自包含跑图：建目录、快照两张卡、拼装、跑 N 张、落盘记录。参数：目录名 [张数]。"""
import json
import pathlib
import re
import shutil
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "Log" / "Circle8"))

from run_portrait import run_once, require_api_key  # noqa: E402

CARD = ROOT / "Log/Circle8/figure-symmetric-cartographer.md"
FIX = ROOT / "Log/Circle8/portrait-fixed-variables.md"
NAME = sys.argv[1] if len(sys.argv) > 1 else "v2-narrow"
N = int(sys.argv[2]) if len(sys.argv) > 2 else 2
START = sys.argv[3] if len(sys.argv) > 3 else "n"
OUT = ROOT / "Log/Circle8/output" / NAME
OUT.mkdir(parents=True, exist_ok=True)


def body(text):
    return text.split("---", 2)[2].strip() if text.startswith("---") else text.strip()


def fixed_block(text):
    rows = [ln.strip() for ln in body(text).splitlines()
            if ln.strip().startswith("|") and not re.match(r"^\|[\s:-]+\|", ln.strip())]
    cells = [[c.strip() for c in r.strip("|").split("|")] for r in rows[1:]]
    return "".join(c[1] for c in cells)


shutil.copy2(CARD, OUT / CARD.name)
shutil.copy2(FIX, OUT / FIX.name)

block = fixed_block(FIX.read_text(encoding="utf-8"))
card = body(CARD.read_text(encoding="utf-8"))
prompt = block + "\n\n" + card
(OUT / "prompt.txt").write_text(prompt, encoding="utf-8")
print(f"目录 {NAME}：固定变量段 {len(block)} 字，肖像卡正文 {len(card)} 字，合计 {len(prompt)} 字")

key = require_api_key(None)
runs = []
for i in range(N):
    tag = f"{int(START) + i:02d}" if START.isdigit() else chr(ord(START) + i)
    info = run_once(key, prompt, OUT / f"portrait-{tag}.png")
    runs.append({"tag": tag, "image": f"portrait-{tag}.png", "info": info})
    print("RESULT", tag, info)

REC = OUT / "runs.json"
old = json.loads(REC.read_text(encoding="utf-8")) if REC.exists() else {}
REC.write_text(
    json.dumps({"dir": NAME, "prompt_chars": len(prompt),
                "runs": old.get("runs", []) + runs}, ensure_ascii=False, indent=2),
    encoding="utf-8")
