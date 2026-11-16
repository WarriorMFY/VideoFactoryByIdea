"""Circle10 投递体拼装：视频固定变量卡（前）+ 肖像卡正文（后）。

顺序依据：伴生卡自述「第二列逐条首尾相接成一段，整段置于基础卡正文之前送出」，
沿用 Circle8 的实发拼装（v3-fixed10/prompt.txt），不沿用 Circle5/6 的「基础卡在前」。
肖像卡逐字节不动，仅去掉 frontmatter。

用法：python Log/Circle10/make_video_prompt.py [--out Log/Circle10/prompt-video-v1.txt]
"""
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[2]
AUX = ROOT / "Log/Circle10/portrait-video-fixed-variables.md"
BASE = ROOT / "RAG/portraits/figure-symmetric-cartographer/card.md"


def body(path):
    t = path.read_text(encoding="utf-8").replace("\r\n", "\n")
    if t.startswith("---"):
        return t.split("---", 2)[2].strip()
    return t.strip()


def fixed_sentences(path):
    """取「变量 | 固定语句」表第二列，跳过表头与分隔行，按原顺序首尾相接。"""
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
    out = Path(sys.argv[sys.argv.index("--out") + 1]) if "--out" in sys.argv else \
        ROOT / "Log/Circle10/prompt-video-v1.txt"

    segs = fixed_sentences(AUX)
    head = "".join(segs)
    base = body(BASE)
    prompt = head + "\n\n" + base

    out.write_text(prompt, encoding="utf-8")

    print("固定语句段数", len(segs))
    print("前段字符", len(head))
    print("肖像卡正文字符", len(base))
    print("合计字符", len(prompt), "字节", len(prompt.encode("utf-8")))
    print("肖像卡占比 %.1f%%" % (100 * len(base) / len(prompt)))
    print("OUT", out)
    for w in ("左", "右", "颈部", "肩宽"):
        if w in head:
            print("★ 前段含", w, "（需复核是否违反零左右/边界约定）")


if __name__ == "__main__":
    main()
