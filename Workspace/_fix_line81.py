"""把指标文档里被写坏的字，按卡片原文回填（避免手打生僻字再错）。"""
import io
import re

CARD = "Log/Circle8/figure-veiled-cartographer.md"
DOC = "Log/Circle8/portrait-consistency-metrics.md"

card = io.open(CARD, encoding="utf-8").read()
good = re.search(r"下.至耳根", card).group(0)          # 从卡里取正确写法
print("取自卡片的原词:", good)

doc = io.open(DOC, encoding="utf-8").read()
fixed = re.sub(r"遮布侧下.至耳根", "遮布侧" + good, doc)
io.open(DOC, "w", encoding="utf-8").write(fixed)

for i, line in enumerate(fixed.splitlines(), 1):
    if "R1.特征.1" in line:
        print(i, line)
