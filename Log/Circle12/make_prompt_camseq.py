"""三卡直送：固定变量卡 → 反向卡 → 主卡，三份正文逐字节入投。

口径（同 Circle6 / Circle10）：只去 YAML frontmatter，整段正文原样拼入，
不解析字段、不抽行、不改写句子、不增减标点；顺序＝辅助卡在前、主卡在后。
写盘后断言三段正文原样出现且顺序正确。

用法：python Log/Circle12/make_prompt_camseq.py
输出：terrain-huangfeng-valley/chain-02-camseq/video/prompt-video.txt
"""
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
HERE = Path(__file__).resolve().parent
CARD_DIR = HERE / "terrain-huangfeng-valley" / "chain-02-camseq"
OUT = CARD_DIR / "video" / "prompt-video.txt"

CARDS = (
    ("【固定变量卡】", CARD_DIR / "card-fixed-variables.md"),
    ("【反向卡】", CARD_DIR / "card-anti.md"),
    ("【主卡】", CARD_DIR / "card-camseq.md"),
)


def body(path):
    """只剥 YAML frontmatter，其余一字不动。"""
    lines = path.read_text(encoding="utf-8").splitlines()
    if lines and lines[0].strip() == "---":
        for i in range(1, len(lines)):
            if lines[i].strip() == "---":
                return "\n".join(lines[i + 1:]).strip("\n")
    return "\n".join(lines).strip("\n")


def main():
    parts = []
    bodies = []
    for tag, path in CARDS:
        text = body(path)
        if not text:
            raise SystemExit("卡正文为空：" + str(path))
        bodies.append(text)
        parts.append(tag + "\n" + text)
    pos = "\n\n".join(parts) + "\n"

    out = OUT
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(pos, encoding="utf-8")

    back = out.read_text(encoding="utf-8")
    for (tag, path), text in zip(CARDS, bodies):
        assert text in back, "正文未完整出现：" + path.name
    order = [back.index(t) for t, _ in CARDS]
    assert order == sorted(order), "卡序错误"
    assert back.startswith("【固定变量卡】"), "固定变量卡未在前"

    print("FIXED", len(bodies[0]), "ANTI", len(bodies[1]), "MAIN", len(bodies[2]))
    aux = len(bodies[0]) + len(bodies[1])
    ratio = 100.0 * aux / len(bodies[2])
    print("AUX_SHARE %.1f%%（上限 10%%，见 AGENTS.md 规则）" % ratio)
    assert ratio <= 10.0, "伴生卡总长超过主卡 10%%：%.1f%%" % ratio
    print("OUT_LEN", len(back), "字符")
    print("VERBATIM_OK True")
    print("NO_REWRITE True")
    print("OUT", out.relative_to(HERE))
    return 0


if __name__ == "__main__":
    sys.exit(main())
