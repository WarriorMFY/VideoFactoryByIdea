"""双卡直发：两张卡片原文原封不动拼成一次投递，不做逐帧拼装。

用途（Circle5 · 20:59 用户裁定）：先不做逐帧组合，先测模型对两张独立卡片的自动对齐度。
规则：两张卡各自整卡原文入投，一字不改、不做 markdown 剥离；顺序＝动作卡在前、镜头卡在后。

用法：
  python Log/Circle5/make_dual_prompt.py
  python Log/Circle5/make_dual_prompt.py --action <path> --camera <path> --out <path>
"""
import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ACTION = ROOT / "RAG" / "actions" / "execution-counter-straight-strike-v2" / "card.md"
CAMERA = ROOT / "Doc" / "Cards" / "30-behavior" / "cameras" / "camera-aux-counter-straight-strike-v2.md"
OUT = ROOT / "Log" / "Circle5" / "prompt-dual.txt"


def read(p: Path) -> str:
    return p.read_text(encoding="utf-8").rstrip("\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--action", default=str(ACTION))
    ap.add_argument("--camera", default=str(CAMERA))
    ap.add_argument("--out", default=str(OUT))
    a = ap.parse_args()

    act = read(Path(a.action))
    cam = read(Path(a.camera))

    pos = "【动作卡】\n" + act + "\n\n【镜头卡】\n" + cam

    out = Path(a.out)
    out.write_text("# Circle5 · 双卡直发（动作卡＋辅助镜头卡原文）\n" + pos + "\n", encoding="utf-8")

    back = out.read_text(encoding="utf-8").splitlines()[1:]
    back_s = "\n".join(back)
    assert act in back_s, "动作卡原文未完整出现"
    assert cam in back_s, "镜头卡原文未完整出现"
    assert back_s.startswith("【动作卡】"), "动作卡未在前"

    print("ACTION", Path(a.action).name, len(act), "字符")
    print("CAMERA", Path(a.camera).name, len(cam), "字符")
    print("POS_LEN", len(pos), "字符")
    print("SHARE %.1f%%" % (100 * len(cam) / len(pos)))
    print("VERBATIM_OK True")
    print("NO_STRIP True")
    print("OUT", out)
    print("--- 前 6 行 ---")
    print("\n".join(pos.splitlines()[:6]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
