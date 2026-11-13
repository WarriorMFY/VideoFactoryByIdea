"""L3 前置校验：确认送验 Prompt 与卡片原文逐字一致。

用法：
    python verify_prompt.py <card.md> <prompt.txt>

prompt.txt 约定（按段落标记切分，不依赖行号）：
    # L3 · 任意说明
    <该帧原文 + 防干扰句>
    --no <可选负向词>

    # L4 · 任意说明
    K0 ... K4 依次拼接 + 防干扰句
"""

import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

GUARD = "画面干净"


def load_rows(card_path):
    rows = {}
    for line in Path(card_path).read_text(encoding="utf-8").splitlines():
        m = re.match(r"^\|\s*(K[0-4])\s*/\s*[^|]*\|\s*(.+?)\s*\|\s*$", line)
        if m:
            rows[m.group(1)] = m.group(2).strip()
    return rows


def load_sections(prompt_path):
    sections, cur = {}, None
    for line in Path(prompt_path).read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if s.startswith("#"):
            cur = "L3" if "L3" in s else ("L4" if "L4" in s else None)
            if cur:
                sections[cur] = []
            continue
        if cur and s and not s.startswith("--no"):
            if not sections[cur]:
                sections[cur].append(s)
    return {k: v[0] for k, v in sections.items() if v}


def main(card_path, prompt_path):
    rows = load_rows(card_path)
    missing = [k for k in ("K0", "K1", "K2", "K3", "K4") if k not in rows]
    if missing:
        print("卡片缺帧:", ",".join(missing))
        return 1

    sec = load_sections(prompt_path)
    ok = True

    if "L3" not in sec:
        print("L3  未找到 # L3 段        FAIL")
        ok = False
    else:
        l3 = sec["L3"]
        i = l3.find(GUARD)
        core = (l3[:i] if i >= 0 else l3).strip().rstrip("。").strip()
        want = rows["K2"].rstrip("。").strip()
        if core == want:
            print("L3  = 卡片 K2 原文         PASS")
        else:
            ok = False
            print("L3  != 卡片 K2 原文         FAIL")
            for n in range(min(len(core), len(want))):
                if core[n] != want[n]:
                    print("  首个差异在第 {} 字".format(n + 1))
                    print("  卡片:", want[max(0, n - 12):n + 12])
                    print("  Prompt:", core[max(0, n - 12):n + 12])
                    break
            else:
                print("  长度不同：卡片 {} 字，Prompt {} 字".format(len(want), len(core)))

    l4 = sec.get("L4", "")
    miss = [k for k in ("K0", "K1", "K2", "K3", "K4") if rows[k].rstrip("。").strip() not in l4]
    print("L4  包含 K0-K4 全部原文    " + ("PASS" if not miss else "FAIL 缺 " + ",".join(miss)))
    if miss:
        ok = False

    print("RESULT", "PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(2)
    sys.exit(main(sys.argv[1], sys.argv[2]))
