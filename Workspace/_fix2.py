"""把 T8 里残留的形近错字按卡原文纠正，并标注该条已被 T9 裁决。"""
import io
import re

CARD = "Log/Circle8/figure-veiled-cartographer.md"
LOG = "Log/Circle8/log.md"

card = io.open(CARD, encoding="utf-8").read()
burn = next(w for w in set(re.findall(r".伤", card)) if w[1] == chr(0x4F24))
print("卡原文取词:", burn)

t = io.open(LOG, encoding="utf-8").read()
t = re.sub(r".伤是否在遮布侧", burn + "是否在遮布侧", t)
t = t.replace("仍可抓「布在左、疤在右」这类错位；",
              "仍可抓「布在左、疤在右」这类错位（**T9 已决：整项废除，不采用此方案**）；")
io.open(LOG, "w", encoding="utf-8").write(t)

for i, line in enumerate(t.splitlines(), 1):
    if "遮布侧」这类" in line:
        print(i, line)
print("残留:", {b: t.count(b) for b in ["伤感", "兟", "颅"] if t.count(b)} or "clean")
