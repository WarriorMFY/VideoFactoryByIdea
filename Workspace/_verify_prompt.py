import re
import sys
from pathlib import Path

# 本脚本比对「Prompt 第 3 行」与「卡片 K2 原文」，依赖 Circle2 的卡片
# `Doc/Cards/90-cases/shield-sword-finisher/action-shield-sword-thrust-v2.md`。
# 该卡片已随 Circle7 规格重构删除（Doc/Cards 只留 spec.md + Template/），
# 本脚本因此失效，留作历史工具：要复跑请先从 git 历史（c06e3bb 之前）取回卡片，
# 并把下面 CARD 指回原路径。

sys.stdout.reconfigure(encoding="utf-8")

CARD = Path("Doc/Cards/90-cases/shield-sword-finisher/action-shield-sword-thrust-v2.md")
PROMPT = Path("Log/Circle2/prompt.txt")
GUARD = "画面干净"

card = CARD.read_text(encoding="utf-8")
rows = {}
for line in card.splitlines():
    m = re.match(r"^\|\s*(K[0-4])\s*/\s*[^|]*\|\s*(.+?)\s*\|\s*$", line)
    if m:
        rows[m.group(1)] = m.group(2).strip()

plines = PROMPT.read_text(encoding="utf-8").splitlines()
l3 = plines[1].strip()
l4 = plines[5].strip()

ok = True

i = l3.find(GUARD)
l3_core = (l3[:i] if i >= 0 else l3).strip().rstrip("。").strip()
k2 = rows["K2"].rstrip("。").strip()
if l3_core == k2:
    print("L3  = 卡片 K2 原文         PASS")
else:
    ok = False
    print("L3  != 卡片 K2 原文         FAIL")
    a, b = l3_core, k2
    for n in range(min(len(a), len(b))):
        if a[n] != b[n]:
            print("  首个差异在第 {} 字".format(n + 1))
            print("  卡片:", b[max(0, n - 12):n + 12])
            print("  Prompt:", a[max(0, n - 12):n + 12])
            break
    else:
        print("  长度不同：卡片 {} 字，Prompt {} 字".format(len(b), len(a)))
        print("  多出:", a[len(b):] if len(a) > len(b) else "(无)")

miss = []
for k in ("K0", "K1", "K2", "K3", "K4"):
    if rows[k].rstrip("。").strip() not in l4:
        miss.append(k)
print("L4  包含 K0-K4 全部原文    " + ("PASS" if not miss else "FAIL 缺 " + ",".join(miss)))
if miss:
    ok = False

print("RESULT", "PASS" if ok else "FAIL")
sys.exit(0 if ok else 1)