"""清掉本轮手打出的形近错字：从卡原文取正确词回填，再全量扫一遍。"""
import io
import re

CARD = "Log/Circle8/figure-veiled-cartographer.md"
FILES = ["Log/Circle8/log.md", "Log/Circle8/Circle.md",
         "Log/Circle8/portrait-consistency-metrics.md"]

word = re.search(r"下.至耳根", io.open(CARD, encoding="utf-8").read()).group(0)
print("卡原文取词:", word)

p = "Log/Circle8/log.md"
t = io.open(p, encoding="utf-8").read()
t = t.replace("遮布侧下颅至耳根", "遮布侧" + word)
t = re.sub(
    r"本轮批量改字时写坏了三个字：.*?从源文件取。",
    "本轮批量改字时写坏了三处字：`兑现`、`烧伤`、`" + word[:2] + "` 被写成形近字。"
    "用 `Workspace/_fix_line81.py` 从卡原文取词回填，现全文已无错字。教训：生僻字不回手打，从源文件取。",
    t, flags=re.S)
io.open(p, "w", encoding="utf-8").write(t)

bad = ["兟", "颅", "伤感", "下颅"]
for f in FILES:
    s = io.open(f, encoding="utf-8").read()
    hits = {b: s.count(b) for b in bad if s.count(b)}
    print(f, hits or "clean")
