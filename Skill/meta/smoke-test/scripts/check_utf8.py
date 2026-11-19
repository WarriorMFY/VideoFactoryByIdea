# -*- coding: utf-8 -*-
"""检查改动文件是否为合法 UTF-8，且不含 U+FFFD 替换符（ANSI 事故的指纹）。

    python Skill/meta/smoke-test/scripts/check_utf8.py

范围：`git status --porcelain` 里的 `.md`／`.py`（含未跟踪）。无 git 时退化为全库扫描。
非 UTF-8 记 1 错、U+FFFD 记 1 错，缺末行换行只提示不计错。
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
SUFFIX = (".md", ".py")
SKIP_DIRS = {"_deps", "_deps_cv4", "_deps_matte", "Workspace", "__pycache__"}


def targets():
    r = subprocess.run(
        ["git", "status", "--porcelain"],
        cwd=ROOT, capture_output=True, text=True, encoding="utf-8",
    )
    if r.returncode != 0:
        return [p for p in ROOT.rglob("*")
                if p.suffix in SUFFIX and not (SKIP_DIRS & set(p.parts))]
    out = []
    for line in r.stdout.splitlines():
        rel = line[3:].strip().strip('"')
        if " -> " in rel:
            rel = rel.split(" -> ", 1)[1]
        p = ROOT / rel
        if p.is_file() and p.suffix in SUFFIX:
            out.append(p)
    return out


def main():
    files = targets()
    bad = 0
    for p in files:
        rel = p.relative_to(ROOT).as_posix()
        raw = p.read_bytes()
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError as e:
            print("NOT-UTF8 ", rel, e)
            bad += 1
            continue
        if "\ufffd" in text:
            print("REPLACED ", rel, text.count("\ufffd"))
            bad += 1
        if not raw.endswith(b"\n"):
            print("NO-EOL   ", rel)
    print("checked", len(files), "files, bad =", bad)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
