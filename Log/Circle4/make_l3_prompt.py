"""从卡片逐字抽取 K0 右列原文，生成 L3 送验 prompt。

原则：卡片是唯一真相。
常规版正向文本 = 空间基准声明（卡内逐字，作参考体系前置）+ 该帧右列原文逐字 + 画质尾缀 + 镜头规则尾缀。
纯卡片版（--pure）= 只发卡内文字：空间基准声明 + 该帧右列原文，不带任何卡外提示词。
单帧生图必须带参考体系：模型不知道「左右」是谁的左右，声明先于动作原文给出。
尾缀与负向词属通道要求，不修改卡片原文，另记于提交快照。

用法：python Log/Circle4/make_l3_prompt.py [帧号，默认 K0]
      python Log/Circle4/make_l3_prompt.py K3 --pure
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CARD = ROOT / "Log" / "Circle4" / "execution-martial-arts-single-palm-push.md"

PURE = "--pure" in sys.argv


def _opt(name, default=None):
    if name in sys.argv:
        i = sys.argv.index(name)
        if i + 1 < len(sys.argv):
            return sys.argv[i + 1]
    return default


_REST = [a for a in sys.argv[1:] if not a.startswith("--") and not a.endswith(".md")
         and not a.endswith(".txt")]
FRAME = _REST[0] if _REST and _REST[0].startswith("K") else "K0"
CARD = Path(_opt("--card", str(CARD))) if _opt("--card") else CARD
OUT = Path(_opt("--out")) if _opt("--out") else ROOT / "Log" / "Circle4" / (
    "prompt-%s-pure.txt" % FRAME.lower() if PURE else "prompt-%s.txt" % FRAME.lower()
)

TAIL = "画面干净，主体占画面主导，动作清晰可读，无特效、无遮挡，中性画风。"

# 镜头规则：用户 22:16 定为固定内容，只有这一句，不写机位、不写景别、不加释义。
# 长度仍受硬限制：不得超过该帧动作原文的 1/10。详细验收写在技能里，不进 prompt。
# 只加在送验文本上，不回写卡片。
SHOT = "" if "--no-shot" in sys.argv else _opt("--shot", "清晰看出动作主体的所有动作细节。")

NEG = ("粒子特效，速度线，动态模糊，光晕，烟雾，前景遮挡，景深虚化，"
       "过度饱和，平涂，卡通描边，肢体穿模，多余肢体，水印，文字，"
       "特写，半身构图，胸像，肢体裁切，只拍上半身，双腿出画")


def frame_right(card_text: str, frame: str) -> str:
    for line in card_text.splitlines():
        if line.startswith("| " + frame + " /"):
            cols = [c.strip() for c in line.strip().strip("|").split("|")]
            if len(cols) != 2:
                raise SystemExit(f"{frame} 行不是 2 列: {len(cols)}")
            return cols[1]
    raise SystemExit(f"未找到帧 {frame}")


def space_basis(card_text: str) -> str:
    """逐字取卡内【空间基准声明】行，仅去掉 markdown 的引用符与加粗标记。"""
    decl = []
    for line in card_text.splitlines():
        s = line.strip()
        if s.startswith(">") and "【" in s and "声明】" in s:
            decl.append(s.lstrip("> ").replace("**", "").strip())
    for b in decl:
        if b.startswith("【空间基准声明】"):
            return b
    if decl:  # 无空间基准声明时，退用卡内第一条声明（如【兼容性声明】），仍逐字
        return decl[0]
    raise SystemExit("卡片既无【空间基准声明】也无其他声明")


def main():
    text = CARD.read_text(encoding="utf-8")
    k = frame_right(text, FRAME)
    basis = space_basis(text)

    if PURE:
        # 纯卡片版：只发卡内文字，无画质尾缀、无镜头规则、无负向词
        pos = basis + k + "。"
        OUT.write_text(
            f"# L3 · {FRAME} 单帧纯卡片版（空间基准声明＋{FRAME} 右列原文逐字，无任何卡外提示词）\n"
            + pos + "\n",
            encoding="utf-8",
        )
        back = OUT.read_text(encoding="utf-8").splitlines()[1]
        assert back == pos, "纯卡片版与拼装结果不一致"
        assert back.startswith(basis), "纯卡片版未以空间基准声明打头"
        assert k in back, "帧原文缺失"
        for t in (TAIL, SHOT):
            assert t not in back, "纯卡片版出现了卡外提示词"
        print("FRAME", FRAME)
        print("MODE pure")
        print("BASIS_LEN", len(basis))
        print("CARD_LEN", len(k))
        print("POS_LEN", len(pos))
        print("OUT", OUT)
        print("VERBATIM_OK True")
        print("BASIS_OK True")
        print("NO_EXTRA True")
        print("--- POS ---")
        print(pos)
        return 0

    pos = basis + k + TAIL + SHOT
    # 镜头规则不得压过动作：长度上限＝该帧动作原文的 1/10（用户 22:07 定）
    if SHOT and len(SHOT) * 10 > len(k):
        raise SystemExit(
            f"镜头规则超长：{len(SHOT)} 字，超过动作原文 {len(k)} 字的 1/10（上限 {len(k)//10} 字）"
        )
    OUT.write_text(
        f"# L3 · {FRAME} 单帧（Circle4 卡，正向＝空间基准声明＋{FRAME} 右列原文逐字＋画质尾缀＋镜头规则尾缀）\n"
        + pos + "\n"
        + "--no " + NEG + "\n",
        encoding="utf-8",
    )
    print("FRAME", FRAME)
    print("BASIS_LEN", len(basis))
    print("CARD_LEN", len(k))
    print("SHOT_LEN", len(SHOT), "RATIO", ("1/%d" % round(len(k) / len(SHOT), 1)) if SHOT else "NA（本帧不挂镜头规则）")
    print("POS_LEN", len(pos))
    print("OUT", OUT)
    # 自检：参考体系打头且逐字同源，动作原文紧随其后逐字不变
    back = OUT.read_text(encoding="utf-8").splitlines()[1]
    assert back.startswith(basis), "正向文本未以空间基准声明打头"
    assert back == basis + k + TAIL + SHOT, "正向文本与拼装结果不一致"
    assert basis not in TAIL + SHOT, "声明的归属位置错乱"
    print("VERBATIM_OK True")
    print("BASIS_OK True")
    print("--- BASIS ---")
    print(basis)
    print("--- CARD ---")
    print(k)
    print("--- POS ---")
    print(pos)


if __name__ == "__main__":
    sys.exit(main())
