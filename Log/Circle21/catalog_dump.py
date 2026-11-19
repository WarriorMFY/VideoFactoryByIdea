"""Enumerate RunningHub endpoint catalog by task type with input modality signature."""
import json, io, collections, os

P = r"F:\AgentWorkArea\WorkBuddy\CardStudio\Skill\hub\generation\runninghub\data\capabilities.json"
d = json.load(io.open(P, encoding="utf-8"))
eps = d["endpoints"]

def sig(e):
    parts = []
    for p in e.get("params", []):
        t = p.get("type")
        k = p.get("key")
        if t in ("IMAGE", "VIDEO", "AUDIO", "MASK"):
            n = p.get("maxCount") or (1 if not p.get("multiple") else "n")
            parts.append(f"{t}:{k}" + (f"*{n}" if n not in (1, "n") else ""))
    return ", ".join(parts) if parts else "(text only)"

groups = collections.defaultdict(list)
for e in eps:
    groups[e.get("task")].append(e)

out = []
for task in sorted(groups, key=lambda t: -len(groups[t])):
    items = sorted(groups[task], key=lambda e: -(e.get("popularity") or 0))
    rep = items[0]
    out.append({
        "task": task,
        "count": len(items),
        "sample": rep.get("endpoint"),
        "sample_cn": rep.get("name_cn"),
        "modality": sig(rep),
        "with_media": sum(1 for i in items if any(p.get("type") in ("IMAGE", "VIDEO", "AUDIO") for p in i.get("params", []))),
        "endpoints": [i.get("endpoint") for i in items],
    })

for r in out:
    print(f"{r['task']:<26} n={r['count']:<3} media={r['with_media']:<3} {r['sample']:<48} {r['modality']}")

with io.open(r"F:\AgentWorkArea\WorkBuddy\CardStudio\Log\Circle21\catalog_by_task.json", "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
