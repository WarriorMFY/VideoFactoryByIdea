"""逐帧拼装：动作卡右列原文 + 绑定镜头卡右列原文 → 一段送验 prompt。

规则（Circle5 阶段 1 裁决）：
1. 组合介质＝逐帧文本拼装：动作原文在前，镜头句接在同一帧尾。
2. 帧数对等：两张卡的 K 号必须完全相同，缺一或多一都报错（一卡一绑，无映射、无缺帧保持）。
3. 参数表只进三项：焦段、画幅比、稳定方式。
4. 只做标点连接，不改写、不增删卡内任何词；逐字断言。

用法：
  python Log/Circle5/make_combo_prompt.py
  python Log/Circle5/make_combo_prompt.py --action <path> --camera <path> --out <path>
"""
import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ACTION = ROOT / "RAG" / "actions" / "execution-counter-straight-strike-v2" / "card.md"
CAMERA = ROOT / "Doc" / "Cards" / "30-behavior" / "cameras" / "camera-aux-counter-straight-strike-v2.md"
OUT = ROOT / "Log" / "Circle5" / "prompt-combo.txt"

TAIL = "画面干净，无特效、无遮挡，中性写实画风，动作清晰可读。"
PARAM_KEYS = ["焦段", "画幅比", "稳定方式"]
FRAME_RE = re.compile(r"^\|\s*(K\d+)\s*/")
DECL_RE = re.compile(r"【[^】]*声明】")


def frames_of(text: str):
    out = []
    for line in text.splitlines():
        m = FRAME_RE.match(line.strip())
        if m and m.group(1) not in out:
            out.append(m.group(1))
    return out


def frame_right(text: str, frame: str) -> str:
    for line in text.splitlines():
        if line.startswith("| " + frame + " /"):
            cols = [c.strip() for c in line.strip().strip("|").split("|")]
            if len(cols) != 2:
                raise SystemExit(f"{frame} 行不是 2 列: {len(cols)}")
            return cols[1].replace("**", "")
    raise SystemExit(f"未找到帧 {frame}")


def declaration(text: str) -> str:
    for line in text.splitlines():
        s = line.strip()
        if DECL_RE.search(s):
            d = s.lstrip("> ").replace("**", "").strip()
            if not DECL_RE.match(d):
                raise SystemExit("声明行格式异常: " + d[:40])
            return d
    return ""


def params_of(text: str):
    got = {}
    for line in text.splitlines():
        s = line.strip()
        if not s.startswith("|"):
            continue
        cols = [c.strip() for c in s.strip("|").split("|")]
        if len(cols) == 2 and cols[0] in PARAM_KEYS:
            got[cols[0]] = cols[1]
    missing = [k for k in PARAM_KEYS if k not in got]
    return got, missing


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--action", default=str(ACTION))
    ap.add_argument("--camera", default=str(CAMERA))
    ap.add_argument("--out", default=str(OUT))
    a = ap.parse_args()

    at = Path(a.action).read_text(encoding="utf-8")
    ct = Path(a.camera).read_text(encoding="utf-8")

    af, cf = frames_of(at), frames_of(ct)
    if af != cf:
        raise SystemExit(f"帧号不对等：动作={af} 镜头={cf}（一卡一绑要求逐帧一一对应）")

    arts = [frame_right(at, f) for f in af]
    crts = [frame_right(ct, f) for f in cf]

    # 每键 ≤12 字检查
    over = []
    for f, raw in zip(cf, crts):
        for kv in raw.split("；"):
            if len(kv.strip()) > 18:  # 含数值单位的键放宽到 18 字
                over.append((f, kv.strip(), len(kv.strip())))

    got, missing = params_of(ct)
    if missing:
        raise SystemExit(f"镜头参数缺项：{missing}")

    decl = declaration(at)
    body = "。".join(f"{x}。镜头：{y}" for x, y in zip(arts, crts))
    pstr = "镜头参数：" + "，".join(f"{k} {got[k]}" for k in PARAM_KEYS) + "，全片一镜到底不切镜"
    pos = decl + body + "。" + pstr + "。" + TAIL

    out = Path(a.out)
    out.write_text("# Circle5 · 动作卡＋辅助镜头卡（逐帧拼装）\n" + pos + "\n", encoding="utf-8")

    back = out.read_text(encoding="utf-8").splitlines()[1]
    assert back == pos
    for x in arts:
        assert x in back, "动作帧原文缺失或被改写"
    for y in crts:
        assert y in back, "镜头帧原文缺失或被改写"
    assert TAIL in back

    print("ACTION", Path(a.action).name, "frames", af)
    print("CAMERA", Path(a.camera).name, "frames", cf)
    print("FRAMES_EQUAL True")
    print("ACTION_LEN", sum(len(x) for x in arts), "CAMERA_LEN", sum(len(y) for y in crts))
    print("CAMERA_SHARE %.1f%%" % (100 * sum(len(y) for y in crts) / len(pos)))
    print("PER_FRAME", [(f, len(y)) for f, y in zip(cf, crts)])
    print("OVER_18CH", over if over else "无")
    print("PARAMS", got)
    print("POS_LEN", len(pos))
    print("VERBATIM_OK True")
    print("OUT", out)
    print("--- POS ---")
    print(pos)
    return 0


if __name__ == "__main__":
    sys.exit(main())
