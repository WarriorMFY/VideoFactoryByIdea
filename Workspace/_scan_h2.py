import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

root = Path("Doc/Cards")
out = []
for p in sorted(root.rglob("*.md")):
    lines = p.read_text(encoding="utf-8").splitlines()
    h2 = [l[3:].strip() for l in lines if l.startswith("## ")]
    if h2:
        out.append("{} -> {}".format(p.relative_to(root).as_posix(), " / ".join(h2)))

Path("Workspace/_h2_scan.txt").write_text("\n".join(out), encoding="utf-8")
print("FILES_WITH_H2", len(out))