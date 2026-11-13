import re
import sys
from pathlib import Path

root = Path(sys.argv[1] if len(sys.argv) > 1 else ".")

prompt_file = root / "prompt.txt"
submit_file = root / "submit.md"

if not prompt_file.exists() or not submit_file.exists():
    print("FAIL: prompt.txt 或 submit.md 不存在")
    sys.exit(2)


def norm(text):
    return text.replace("`", "").replace("~~", "").strip().lower()


line = prompt_file.read_text(encoding="utf-8").splitlines()[0]
segments = [s.strip() for s in re.split(r"[,，]", line) if s.strip()]

rows = []
in_table = False
for raw in submit_file.read_text(encoding="utf-8").splitlines():
    s = raw.strip()
    if s.startswith("| Prompt"):
        in_table = True
        continue
    if in_table:
        if not s.startswith("|"):
            break
        if re.fullmatch(r"\|[\s\-:|]+\|", s):
            continue
        cells = [c.strip() for c in s.strip("|").split("|")]
        if len(cells) >= 2 and not cells[0].startswith("~~"):
            rows.append(cells)

table_text = " @@ ".join(norm(r[0]) for r in rows)

missing = [seg for seg in segments if norm(seg) not in table_text]

orphan = []
for r in rows:
    key = norm(r[0])
    if not key:
        continue
    parts = [x.strip() for x in key.split(",") if x.strip()]
    if not all(any(part in norm(seg) or norm(seg) in part for seg in segments) for part in parts):
        orphan.append(r[0])

print("SEGMENTS={}".format(len(segments)))
print("TABLE_ROWS={}".format(len(rows)))
for seg in missing:
    print("MISSING_IN_TABLE: {}".format(seg))
for item in orphan:
    print("ORPHAN_IN_PROMPT: {}".format(item))

if missing or orphan:
    print("RESULT=FAIL")
    sys.exit(1)

print("RESULT=PASS")