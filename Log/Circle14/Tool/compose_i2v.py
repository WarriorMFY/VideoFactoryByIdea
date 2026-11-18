"""Circle14 链拼接：按给定顺序取卡片正文（剥 frontmatter）拼接，不抽字段、不改写。

用法：python Log/Circle14/Tool/compose_i2v.py <链目录> <卡1.md> <卡2.md> ...
输出：<链目录>/video/prompt-video.txt
"""
import hashlib
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
HERE = Path(__file__).resolve().parents[1]


def body(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    if text.startswith("---"):
        parts = text.split("---", 2)
        if len(parts) == 3:
            text = parts[2]
    return text.strip("\n")


def main() -> int:
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    chain = Path(sys.argv[1])
    if not chain.is_absolute():
        chain = HERE.parent / chain
    names = sys.argv[2:]

    parts = []
    for name in names:
        b = body(chain / name)
        parts.append(b)
        print("CARD", name, len(b), "chars")

    out = "\n\n".join(parts) + "\n"
    for name, b in zip(names, parts):
        for line in b.splitlines():
            if line.strip() and line not in out:
                raise SystemExit("LINE MISSING from " + name + ": " + line[:60])
    pos = [out.find(p) for p in parts]
    if pos != sorted(pos):
        raise SystemExit("ORDER BROKEN")

    dst = chain / "video" / "prompt-video.txt"
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(out, encoding="utf-8")
    print("PROMPT_CHARS", len(out))
    print("PROMPT_BYTES", len(out.encode("utf-8")))
    print("PROMPT_SHA1", hashlib.sha1(out.encode("utf-8")).hexdigest()[:12])
    print("OUT", dst)
    return 0


if __name__ == "__main__":
    sys.exit(main())
