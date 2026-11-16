"""拼装送验 Prompt：固定变量段（前置）+ 基础肖像卡正文。"""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]
FIX = ROOT / "Log/Circle8/portrait-fixed-variables.md"
BASE = ROOT / "Log/Circle8/figure-symmetric-cartographer.md"
OUT = ROOT / "Log/Circle8/output/prompt-portrait-fixed.txt"


def body(text):
    return text.split("---", 2)[2].strip() if text.startswith("---") else text.strip()


def fixed_block(text):
    rows = [ln.strip() for ln in body(text).splitlines()
            if ln.strip().startswith("|") and not re.match(r"^\|[\s:-]+\|", ln.strip())]
    cells = [[c.strip() for c in r.strip("|").split("|")] for r in rows[1:]]
    return "".join(c[1] for c in cells)


block = fixed_block(FIX.read_text(encoding="utf-8"))
card = body(BASE.read_text(encoding="utf-8"))
prompt = block + "\n\n" + card
OUT.write_text(prompt, encoding="utf-8")
print(f"固定变量段 {len(block)} 字，基础卡正文 {len(card)} 字，合计 {len(prompt)} 字\n")
print("=" * 60)
print(prompt)
