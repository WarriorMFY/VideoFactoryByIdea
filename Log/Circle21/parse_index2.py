"""Parse RunningHub official llms.txt (markdown link format) into category tree."""
import io, re, json, collections, sys

SRC = r"F:\AgentWorkArea\WorkBuddy\CardStudio\Log\Circle21\llms_index_en.txt"
text = io.open(SRC, encoding="utf-8").read()

pat = re.compile(r"- ([^\[]*)\[(\S+)\]\((https://[^)]+)\)")
rows = []
for m in pat.finditer(text):
    cat = " ".join(m.group(1).split())
    name = m.group(2)
    url = m.group(3)
    segs = [s.strip() for s in cat.split(">")] if cat else []
    rows.append({"category": cat, "segs": segs, "name": name, "url": url})

print("entries:", len(rows))

# category level counts
for depth in (2, 3, 4):
    c = collections.Counter(" > ".join(r["segs"][:depth]) for r in rows if len(r["segs"]) >= depth)
    print(f"\n== depth {depth} ({len(c)} groups) ==")
    for k, v in c.most_common(40):
        print(f"{v:4d}  {k}")

json.dump(rows, io.open(r"F:\AgentWorkArea\WorkBuddy\CardStudio\Log\Circle21\doc_index.json", "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
