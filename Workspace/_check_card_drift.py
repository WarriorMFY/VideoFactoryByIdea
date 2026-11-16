"""核对肖像卡正文自 c/d 轮以来是否被改动（只读，不写任何文件）。"""
import hashlib
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "Log/Circle8/output"
CARD = ROOT / "Log/Circle8/figure-symmetric-cartographer.md"


def body(text):
    return text.split("---", 2)[2].strip() if text.startswith("---") else text.strip()


cur = body(CARD.read_text(encoding="utf-8"))
old = (OUT / "prompt-portrait-shared.txt").read_text(encoding="utf-8").strip()

print("当前卡：", CARD.stat().st_size, "字节 /", len(cur), "字 /",
      len(cur.splitlines()), "行 / sha256_12 =",
      hashlib.sha256(CARD.read_bytes()).hexdigest()[:12].upper())
print("c/d 轮正文：", len(old), "字")
print("两份正文相同？", cur == old)
print()

# 逐行 diff，指出差异落在哪一行
a, b = old.splitlines(), cur.splitlines()
for i, (x, y) in enumerate(zip(a, b), 1):
    if x != y:
        print(f"第 {i} 行有差异：")
        print("  旧:", x[:120])
        print("  新:", y[:120])
print("行数:", len(a), "->", len(b))

rec = json.loads((OUT / "runs-symmetric.json").read_text(encoding="utf-8"))
print("\nruns-symmetric.json 记录的卡 hash：", rec["card_sha256_12"])
