"""最后一处形近字：用卡原文的「烧伤」覆盖「伤感」。"""
import io
import re

card = io.open("Log/Circle8/figure-veiled-cartographer.md", encoding="utf-8").read()
burn = next(w for w in set(re.findall(r".伤", card)) if w[1] == chr(0x4F24))

p = "Log/Circle8/log.md"
t = io.open(p, encoding="utf-8").read()
t = re.sub(r"只比「.感是否在遮布侧」", "只比「" + burn + "是否在遮布侧」", t)
io.open(p, "w", encoding="utf-8").write(t)

print("残留:", {b: t.count(b) for b in ["伤感", "兟", "颅"] if t.count(b)} or "clean")
for i, line in enumerate(t.splitlines(), 1):
    if "遮布侧」这类" in line:
        print(i, line)
