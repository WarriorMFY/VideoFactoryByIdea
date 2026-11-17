"""直送拼接：只剥 YAML frontmatter，正文逐字节拼入，不做任何抽取与改写。

用法：
  python compose.py --main card-instance.md --fixed card-fixed.md --anti card-anti.md \
                    --out <chain>/video/prompt-video.txt
  python compose.py --mode main --main card-instance.md --out <chain>/video/prompt-video.txt

断言：VERBATIM / ORDER / NO_REWRITE / AUX_SHARE<=10（full 模式）。
任一失败立即退出，不写盘后继续。
"""
import argparse
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")


def body(path):
    """只剥 YAML frontmatter，其余一字不动。"""
    lines = path.read_text(encoding="utf-8").splitlines()
    if lines and lines[0].strip() == "---":
        for i in range(1, len(lines)):
            if lines[i].strip() == "---":
                return "\n".join(lines[i + 1:]).strip("\n")
    return "\n".join(lines).strip("\n")


def fail(msg):
    raise SystemExit("COMPOSE_FAIL: " + msg)


def main():
    ap = argparse.ArgumentParser(description="卡片直送拼接（full=三卡，main=只主卡）")
    ap.add_argument("--main", required=True, help="主卡 md")
    ap.add_argument("--fixed", help="固定变量卡 md")
    ap.add_argument("--anti", help="反向卡 md")
    ap.add_argument("--mode", choices=("full", "main"), default="full")
    ap.add_argument("--out", required=True, help="投递体输出路径")
    a = ap.parse_args()

    main_path = Path(a.main)
    main_text = body(main_path)
    if not main_text:
        fail("主卡正文为空：" + str(main_path))

    if a.mode == "main":
        if a.fixed or a.anti:
            fail("mode=main 时不得传伴随卡")
        pos = main_text + "\n"
        write(a.out, pos)
        back = Path(a.out).read_text(encoding="utf-8")
        if back != pos:
            fail("NO_REWRITE")
        _report(0, 0, len(main_text), back, a.out, None)
        return 0

    if not (a.fixed and a.anti):
        fail("mode=full 需要同时给 --fixed 与 --anti")
    fixed_text = body(Path(a.fixed))
    anti_text = body(Path(a.anti))
    if not fixed_text or not anti_text:
        fail("伴生卡正文为空")

    cards = [
        ("【固定变量卡】", fixed_text),
        ("【反向卡】", anti_text),
        ("【主卡】", main_text),
    ]
    pos = "\n\n".join(tag + "\n" + text for tag, text in cards) + "\n"
    write(a.out, pos)
    back = Path(a.out).read_text(encoding="utf-8")

    if back != pos:
        fail("NO_REWRITE")
    for tag, text in cards:
        if text not in back:
            fail("VERBATIM：" + tag + " 正文未完整出现")
    starts = [back.index(tag) for tag, _ in cards]
    if starts != sorted(starts):
        fail("ORDER：卡序与声明不一致")

    aux = len(fixed_text) + len(anti_text)
    ratio = 100.0 * aux / len(main_text)
    _report(len(fixed_text), len(anti_text), len(main_text), back, a.out, (aux, ratio))
    if ratio > 10.0:
        fail("AUX_SHARE %.1f%% > 10%%（伴生卡 %d 字，主卡 %d 字）"
             % (ratio, aux, len(main_text)))
    return 0


def write(out, pos):
    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(pos, encoding="utf-8")


def _report(fixed_len, anti_len, main_len, back, out, aux):
    print("FIXED", fixed_len, "ANTI", anti_len, "MAIN", main_len)
    if aux:
        print("AUX_SHARE %.1f%%（上限 10%%）" % aux[1])
    print("OUT_LEN", len(back), "字符")
    print("VERBATIM_OK True")
    print("ORDER_OK True")
    print("NO_REWRITE True")
    print("OUT", Path(out))


if __name__ == "__main__":
    sys.exit(main())
