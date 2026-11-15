"""从卡片逐字抽取关键帧右列原文，拼成 L4 送验 prompt。

原则：卡片是唯一真相。
正向文本 = 卡内声明（若有，逐字前置）+ 各帧右列原文按序拼接 + 角色映射（可选）+ 镜头规则 + 画质尾缀。
拼接只做标点连接，不改写、不增删卡内任何词。

帧号不硬编码：扫卡片表格里 `| K<数字> /` 开头的行，按出现顺序取。
声明不硬编码：取卡内第一个 `【…声明】` 行（老卡是【空间基准声明】，新卡是【兼容性声明】）。

用法：
  python Log/Circle4/make_l4_prompt.py                    # 默认卡（紫禁城五帧），带角色映射
  python Log/Circle4/make_l4_prompt.py --pure             # 默认卡的纯卡片版
  python Log/Circle4/make_l4_prompt.py --card <path> --frames K0,K1,K2 --no-cast --out <path>
"""
import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CARD = ROOT / "Log" / "Circle4" / "execution-martial-arts-single-palm-push.md"
DEFAULT_OUT = ROOT / "Log" / "Circle4" / "prompt-l4.txt"

# 角色映射（仅紫禁城卡用，用户指定，通道级，不改卡）：卡内主体A → 主体1，主体B → 主体2
CAST_CHINA = ("角色映射：主体1=林黛玉，主体2=孙悟空；卡内主体A即主体1（林黛玉），"
              "卡内主体B即主体2（孙悟空），二者一一对应，全片不得互换。")

# 视频专用镜头规则：与 L3 同为固定内容「清晰看出动作主体的所有动作细节」，
# 另接视频必需的一镜到底（不切镜）。长度仍受 1/10 上限约束。
SHOT = "清晰看出动作主体的所有动作细节，一镜到底不切镜。"

TAIL = "画面干净，无特效、无遮挡，中性写实画风，动作清晰可读。"

FRAME_RE = re.compile(r"^\|\s*(K\d+)\s*/")
DECL_RE = re.compile(r"【[^】]*声明】")


def frames_of(card_text: str):
    out = []
    for line in card_text.splitlines():
        m = FRAME_RE.match(line.strip())
        if m and m.group(1) not in out:
            out.append(m.group(1))
    if not out:
        raise SystemExit("卡内未找到任何 `| K<n> /` 关键帧行")
    return out


def frame_right(card_text: str, frame: str) -> str:
    for line in card_text.splitlines():
        if line.startswith("| " + frame + " /"):
            cols = [c.strip() for c in line.strip().strip("|").split("|")]
            if len(cols) != 2:
                raise SystemExit(f"{frame} 行不是 2 列: {len(cols)}")
            return cols[1]
    raise SystemExit(f"未找到帧 {frame}")


def declaration(card_text: str) -> str:
    """逐字取卡内第一处 `【…声明】` 行，仅去掉 markdown 的引用符与加粗标记。无声明返回空串。"""
    for line in card_text.splitlines():
        s = line.strip()
        if DECL_RE.search(s):
            d = s.lstrip("> ").replace("**", "").strip()
            if not DECL_RE.match(d):
                raise SystemExit("声明行格式异常: " + d[:40])
            return d
    return ""


def strip_md(s: str) -> str:
    """只剥 markdown 加粗标记；用于把表格原文送进 prompt 时去掉排版噪声。"""
    return s.replace("**", "")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--card", default=str(DEFAULT_CARD))
    ap.add_argument("--frames", default=None, help="逗号分隔，默认扫卡自动取")
    ap.add_argument("--out", default=str(DEFAULT_OUT))
    ap.add_argument("--pure", action="store_true", help="纯卡片版：只发声明＋各帧原文")
    ap.add_argument("--no-cast", action="store_true", help="不加角色映射")
    a = ap.parse_args()

    card = Path(a.card)
    text = card.read_text(encoding="utf-8")
    frames = ([f.strip() for f in a.frames.split(",")] if a.frames else frames_of(text))
    basis = declaration(text)
    raws = [frame_right(text, f) for f in frames]
    parts = [strip_md(r) for r in raws]
    body = "。".join(parts)
    out = Path(a.out)

    cast = "" if a.no_cast else CAST_CHINA

    if a.pure:
        pos = basis + body + "。"
        out.write_text("# L4 · 纯卡片版（%s）\n" % "/".join(frames) + pos + "\n", encoding="utf-8")
        back = out.read_text(encoding="utf-8").splitlines()[1]
        assert back == pos
        for t in (CAST_CHINA, SHOT, TAIL):
            assert t not in back, "纯卡片版出现了附加提示词"
        if basis:
            assert back.startswith(basis), "纯卡片版未以卡内声明打头"
        for p in parts:
            assert p in back
        print("MODE pure")
        print("CARD", card.name)
        print("FRAMES", frames)
        print("DECL_LEN", len(basis))
        print("FRAME_LENS", [len(p) for p in parts])
        print("POS_LEN", len(pos))
        print("OUT", out)
        print("VERBATIM_OK True")
        print("NO_EXTRA True")
        print("DECL_OK", bool(basis))
        print("--- POS ---")
        print(pos)
        return 0

    pos = basis + body + "。" + cast + SHOT + TAIL
    if len(SHOT) * 10 > len(body):
        raise SystemExit(
            f"镜头规则超长：{len(SHOT)} 字，超过动作原文 {len(body)} 字的 1/10（上限 {len(body)//10} 字）"
        )
    out.write_text(
        "# L4 · %s（%s，正向＝卡内声明＋各帧右列原文逐字按序拼接＋%s镜头规则＋画质尾缀）\n"
        % ("/".join(frames), card.name, "角色映射＋" if cast else "")
        + pos + "\n",
        encoding="utf-8",
    )

    back = out.read_text(encoding="utf-8").splitlines()[1]
    assert back == pos, "写出的正向与拼装结果不一致"
    if basis:
        assert back.startswith(basis), "正向未以卡内声明打头"
    for raw, p in zip(raws, parts):
        assert p in back, "某帧原文在拼装体中缺失或已被改写"
        assert p == strip_md(raw), "剥离标记改动了原文内容"
    if cast:
        assert cast in back, "角色映射尾缀缺失"
    assert SHOT in back and TAIL in back, "镜头规则或画质尾缀缺失"

    print("CARD", card.name)
    print("FRAMES", frames)
    print("DECL_LEN", len(basis))
    print("FRAME_LENS", [len(p) for p in parts])
    print("CAST_LEN", len(cast))
    print("SHOT_RATIO 1/%d" % (len(body) // len(SHOT)))
    print("POS_LEN", len(pos))
    print("OUT", out)
    print("VERBATIM_OK True")
    print("DECL_OK", bool(basis))
    print("--- POS ---")
    print(pos)


if __name__ == "__main__":
    sys.exit(main())
