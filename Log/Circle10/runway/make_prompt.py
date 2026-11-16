"""副实验 B 投递体：走秀固定变量卡（前）+ 肖像卡正文（后）。

肖像卡逐字节不动，仅去 frontmatter；顺序沿用 Circle8/10 的「副卡在前」。
用法：python Log/Circle10/runway/make_prompt.py
"""
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
AUX = HERE / "fixed-variables-runway.md"
BASE = ROOT / "RAG/portraits/figure-symmetric-cartographer/card.md"
OUT = HERE / "prompt-runway.txt"


def body(path):
    t = path.read_text(encoding="utf-8").replace("\r\n", "\n")
    if t.startswith("---"):
        return t.split("---", 2)[2].strip()
    return t.strip()


def fixed_sentences(path):
    out = []
    for line in body(path).splitlines():
        s = line.strip()
        if not s.startswith("|"):
            continue
        cells = [c.strip() for c in s.strip("|").split("|")]
        if len(cells) != 2:
            continue
        left, right = cells
        if left in ("变量", "---") or set(left) <= set("-: "):
            continue
        out.append(right)
    return out


def main():
    segs = fixed_sentences(AUX)
    head = "".join(segs)
    base = body(BASE)
    prompt = head + "\n\n" + base
    OUT.write_text(prompt, encoding="utf-8")
    print("固定语句段数", len(segs))
    print("前段字符", len(head))
    print("肖像卡正文字符", len(base))
    print("合计字符", len(prompt), "字节", len(prompt.encode("utf-8")))
    print("OUT", OUT)
    for k, v in enumerate(segs, 1):
        print("  %2d %s" % (k, v[:40]))


if __name__ == "__main__":
    main()
