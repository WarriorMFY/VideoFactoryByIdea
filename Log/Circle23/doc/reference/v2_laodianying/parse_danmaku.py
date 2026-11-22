# -*- coding: utf-8 -*-
"""解析 B 站弹幕 XML，按时间点归类并筛出有信息量的弹幕。"""
import re, io, json, sys

path = r"F:\AgentWorkArea\WorkBuddy\CardStudio\Log\Circle23\doc\v2_laodianying\danmaku.xml"
raw = io.open(path, "rb").read()
text = None
for enc in ("utf-8", "gbk", "gb18030", "utf-16"):
    try:
        text = raw.decode(enc)
        break
    except Exception:
        continue
if text is None:
    text = raw.decode("utf-8", "ignore")

items = re.findall(r'<d p="([^"]*)">(.*?)</d>', text, re.S)
print("total danmaku:", len(items))

NOISE = set(["哈哈", "哈哈哈", "233", "2333", "6", "666", "草", "啊", "awsl", "打卡", "沙发", "空降", "前方高能"])
rows = []
for p, t in items:
    f = p.split(",")
    try:
        tm = float(f[0])
    except Exception:
        tm = -1
    t = re.sub(r"\s+", "", t)
    if len(t) < 3 or t in NOISE:
        continue
    rows.append((tm, t, f))

print("meaningful:", len(rows))
# 按时间排序输出
with io.open(r"F:\AgentWorkArea\WorkBuddy\CardStudio\Log\Circle23\doc\v2_laodianying\danmaku_clean.txt", "w", encoding="utf-8") as fo:
    for tm, t, f in sorted(rows, key=lambda x: x[0]):
        fo.write("%6.1f  %s\n" % (tm, t))

# 高频词统计
from collections import Counter
cnt = Counter()
for tm, t, f in rows:
    for kw in ["原著", "黄生", "香玉", "绛雪", "牡丹", "老电影", "童年", "渣男", "三观", "尺度", "好看", "美", "恐怖", "结局", "字幕", "配音", "演技", "画质", "删减", "改编", "花妖", "书生", "媳妇", "老婆"]:
        if kw in t:
            cnt[kw] += 1
print("\n关键词热度:")
for k, v in cnt.most_common(30):
    print("  %-6s %d" % (k, v))

# 最长的 40 条（通常信息量最大）
print("\n=== 长弹幕（信息量最大）===")
for tm, t, f in sorted(rows, key=lambda x: -len(x[1]))[:45]:
    print("%6.1f  %s" % (tm, t))
