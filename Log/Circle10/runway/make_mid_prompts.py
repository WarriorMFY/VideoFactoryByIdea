"""补中间景别：以走秀卡为母本，只换「动作 / 景别 / 构图」三行，生成两份固定景别投递体。

母本其余 9 条（场景、服装、镜头、光照、视线、表情、材质、排除、优先级）逐字沿用，
因此两份新投递体与 r1–r5 的唯一差别就是「人不再走近、景别不再变化」。

用法：python Log/Circle10/runway/make_mid_prompts.py
"""
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
AUX = HERE / "fixed-variables-runway.md"
BASE = ROOT / "RAG/portraits/figure-symmetric-cartographer/card.md"

OVERRIDE = {
    "半身": {
        "动作": "站定后向前迈两步随即停住，停在原地不再靠近镜头，双臂自然下垂，全程不转头、不侧身、不回头。",
        "景别": "全程为半身景，画面从头顶到腰线，人始终占满画幅高度的九成左右，五秒内景别不变化、不拉近、不切镜头、不准切到面部特写。",
        "构图": "人始终处在画面水平中央，头顶留白约占画幅高度的百分之八，腰线落在画面下缘附近，全程不出现第二个人。",
    },
    "七分身": {
        "动作": "站定后向前迈三步随即停住，停在原地不再靠近镜头，双臂自然下垂，全程不转头、不侧身、不回头。",
        "景别": "全程为七分身景，画面从头顶到膝盖上方，人始终占满画幅高度的九成左右，五秒内景别不变化、不拉近、不切镜头、不准切到面部特写。",
        "构图": "人始终处在画面水平中央，头顶留白约占画幅高度的百分之六，膝盖落在画面下缘附近，全程不出现第二个人。",
    },
}


def body(path):
    t = path.read_text(encoding="utf-8").replace("\r\n", "\n")
    if t.startswith("---"):
        return t.split("---", 2)[2].strip()
    return t.strip()


def rows(path):
    out = []
    for line in body(path).splitlines():
        s = line.strip()
        if not s.startswith("|"):
            continue
        cells = [c.strip() for c in s.strip("|").split("|")]
        if len(cells) != 2:
            continue
        if cells[0] in ("变量", "---") or set(cells[0]) <= set("-: "):
            continue
        out.append(cells)
    return out


def main():
    base = body(BASE)
    src = rows(AUX)
    for name, ov in OVERRIDE.items():
        segs, changed = [], []
        for left, right in src:
            if left in ov:
                segs.append(ov[left])
                changed.append((left, right, ov[left]))
            else:
                segs.append(right)
        prompt = "".join(segs) + "\n\n" + base
        out = HERE / f"prompt-{name}.txt"
        out.write_text(prompt, encoding="utf-8")
        print(f"\n### {name}  字符 {len(prompt)}  字节 {len(prompt.encode('utf-8'))}  → {out.name}")
        for k, old, new in changed:
            print(f"  改「{k}」")
            print(f"    旧 {old}")
            print(f"    新 {new}")


if __name__ == "__main__":
    main()
