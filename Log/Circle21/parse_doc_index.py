"""Parse RunningHub official llms.txt index into a category tree with counts."""
import io, re, json, collections, sys

SRC = sys.argv[1]
lines = io.open(SRC, encoding="utf-8").read().splitlines()

ents = []
for ln in lines:
    s = ln.strip()
    if not s.startswith("- "):
        continue
    # format: - A > B > C > name <link ... text="X" />: desc
    body = s[2:]
    m = re.search(r'text="([^"]*)"', body)
    name = m.group(1) if m else body.split("<")[0].strip()
    path = body.split("<")[0].strip()
    segs = [p.strip() for p in path.split(">")]
    ents.append(segs)

tree = collections.Counter()
for segs in ents:
    if len(segs) >= 2:
        tree[" > ".join(segs[:-1])] += 1

print("total entries:", len(ents))
print("\n== top-level ==")
top = collections.Counter(segs[0] for segs in ents if len(segs) >= 2)
for k, v in top.most_common():
    print(f"{v:5d}  {k}")

print("\n== level-2 under Standard Model API ==")
l2 = collections.Counter(" > ".join(segs[:2]) for segs in ents if len(segs) >= 3 and segs[0].startswith("Standard"))
for k, v in l2.most_common():
    print(f"{v:5d}  {k}")

print("\n== level-3 under Video Generation & Processing ==")
l3 = collections.Counter(" > ".join(segs[:3]) for segs in ents
                         if len(segs) >= 4 and segs[1:3] == ["Video Generation & Processing"])
for k, v in l3.most_common():
    print(f"{v:5d}  {k}")

json.dump(ents, io.open(r"F:\AgentWorkArea\WorkBuddy\CardStudio\Log\Circle21\doc_index_paths.json", "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
