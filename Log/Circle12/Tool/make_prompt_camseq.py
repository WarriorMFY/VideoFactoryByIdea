"""卡直送：只剥 YAML frontmatter，整段正文原样入投，不抽字段、不改写。

两种模式：
  full（默认）＝固定变量卡 → 反向卡 → 主卡，写 chain-02，断言顺序与伴生卡占比 ≤10%
  main        ＝只发主卡，不带标签行，写 chain-03，断言写盘内容与卡正文逐字节相同

用法：
  python Log/Circle12/Tool/make_prompt_camseq.py
  python Log/Circle12/Tool/make_prompt_camseq.py main
"""
import shutil
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
HERE = Path(__file__).resolve().parents[1]
BASE = HERE / "terrain-huangfeng-valley"
FULL = BASE / "chain-02-camseq"
ONLY = BASE / "chain-03-camseq-main"

CARDS = (
    ("【固定变量卡】", FULL / "card-fixed-variables.md"),
    ("【反向卡】", FULL / "card-anti.md"),
    ("【主卡】", FULL / "card-camseq.md"),
)


def body(path):
    """只剥 YAML frontmatter，其余一字不动。"""
    lines = path.read_text(encoding="utf-8").splitlines()
    if lines and lines[0].strip() == "---":
        for i in range(1, len(lines)):
            if lines[i].strip() == "---":
                return "\n".join(lines[i + 1:]).strip("\n")
    return "\n".join(lines).strip("\n")


def write(out, pos):
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(pos, encoding="utf-8")
    back = out.read_text(encoding="utf-8")
    assert back == pos, "写盘内容被改动：" + str(out)
    return back


def main_full():
    parts, bodies = [], []
    for tag, path in CARDS:
        text = body(path)
        if not text:
            raise SystemExit("卡正文为空：" + str(path))
        bodies.append(text)
        parts.append(tag + "\n" + text)
    out = FULL / "video" / "prompt-video.txt"
    back = write(out, "\n\n".join(parts) + "\n")

    for (tag, path), text in zip(CARDS, bodies):
        assert text in back, "正文未完整出现：" + path.name
    order = [back.index(t) for t, _ in CARDS]
    assert order == sorted(order), "卡序错误"
    assert back.startswith("【固定变量卡】"), "固定变量卡未在前"

    aux = len(bodies[0]) + len(bodies[1])
    ratio = 100.0 * aux / len(bodies[2])
    print("FIXED", len(bodies[0]), "ANTI", len(bodies[1]), "MAIN", len(bodies[2]))
    print("AUX_SHARE %.1f%%（上限 10%%，见 AGENTS.md 规则）" % ratio)
    assert ratio <= 10.0, "伴生卡总长超过主卡 10%%：%.1f%%" % ratio
    print("OUT_LEN", len(back), "字符")
    print("VERBATIM_OK True")
    print("NO_REWRITE True")
    print("OUT", out.relative_to(HERE))
    return 0


def main_only():
    src = CARDS[2][1]
    text = body(src)
    if not text:
        raise SystemExit("主卡正文为空：" + str(src))
    snap = ONLY / "card-camseq.md"
    snap.parent.mkdir(parents=True, exist_ok=True)
    if not snap.exists():
        shutil.copyfile(src, snap)
        print("SNAPSHOT", snap.relative_to(HERE))
    out = ONLY / "video" / "prompt-video.txt"
    pos = text + "\n"
    back = write(out, pos)

    assert back.startswith("# 镜头-地貌卡"), "主卡标题未在前"
    assert "【固定变量卡】" not in back and "【反向卡】" not in back, "伴生卡未剔除"
    print("MAIN", len(text))
    print("OUT_LEN", len(back), "字符")
    print("VERBATIM_OK True")
    print("NO_REWRITE True")
    print("MODE main（只发主卡）")
    print("OUT", out.relative_to(HERE))
    return 0


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "full"
    if mode == "main":
        return main_only()
    if mode == "full":
        return main_full()
    raise SystemExit("未知模式：%s（可选 full / main）" % mode)


if __name__ == "__main__":
    sys.exit(main())
