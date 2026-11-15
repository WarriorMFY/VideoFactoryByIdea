"""双卡直发（动作卡＋场景卡）：两张卡原文原封不动拼成一次投递。

口径完全沿用 Circle5 的 make_dual_prompt.py：整卡入投、一字不改、不做 markdown 剥离。
顺序＝基础卡在前、辅助卡在后。
差异只在标签与默认路径：本脚本的辅助卡是场景卡（空间维度），不是镜头卡。

用法：
  python Log/Circle6/make_pair_prompt.py --out Log/Circle6/prompt-pair-v1.txt
"""
import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ACTION = ROOT / "RAG" / "actions" / "execution-counter-straight-strike-v2" / "card.md"
SCENE = ROOT / "Doc" / "Cards" / "20-assets" / "scenes" / "scene-aux-counter-straight-strike-v2.md"
OUT = ROOT / "Log" / "Circle6" / "prompt-pair.txt"


def read(p: Path) -> str:
    return p.read_text(encoding="utf-8").rstrip("\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--action", default=str(ACTION))
    ap.add_argument("--scene", default=str(SCENE))
    ap.add_argument("--out", default=str(OUT))
    a = ap.parse_args()

    act = read(Path(a.action))
    scn = read(Path(a.scene))

    pos = "【动作卡】\n" + act + "\n\n【场景卡】\n" + scn

    out = Path(a.out)
    out.write_text(pos + "\n", encoding="utf-8")

    back = out.read_text(encoding="utf-8")
    assert act in back, "动作卡原文未完整出现"
    assert scn in back, "场景卡原文未完整出现"
    assert back.startswith("【动作卡】"), "动作卡未在前"

    print("ACTION", Path(a.action).name, len(act), "字符")
    print("SCENE ", Path(a.scene).name, len(scn), "字符")
    print("POS_LEN", len(pos), "字符")
    print("SCENE_SHARE %.1f%%" % (100 * len(scn) / len(pos)))
    print("VERBATIM_OK True")
    print("NO_STRIP True")
    print("OUT", out)
    print("--- 前 4 行 ---")
    print("\n".join(pos.splitlines()[:4]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
