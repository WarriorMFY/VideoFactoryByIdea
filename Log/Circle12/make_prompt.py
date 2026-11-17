"""Circle13 组合 prompt：外挂镜头卡 + 该版地貌卡的全部可视行。

与 Circle12 不同：不再断言「必须是 4 行」，而是把该版卡片里出现的每一行
按固定顺序（水系 → 植被带 → 动物种群 → 灵脉与异常）逐字拼进去。
裁切到 2 行的卡就送 2 行——这是本轮的自变量。

[已废弃] 本脚本抽取字段重拼句子，违反 AGENTS.md 的直送规则，仅用于复现阶段 2 历史产物。

用法：python Log/Circle12/make_prompt.py <卡名>/<链>（如 terrain-huangfeng-valley-near-shore/chain-01-a1）
输出：<卡名>/<链>/video/prompt-video.txt
"""
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
CARD = Path(__file__).resolve().parent
VISIBLE = ("水系", "植被带", "动物种群", "灵脉与异常")

VIDEO_HEAD = "画面为一帧近景实拍，一镜到底。"
TAIL = "画面内无人物、无文字、无水印。"


def rows(path):
    out = []
    for line in path.read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if not s.startswith("|") or set(s) <= set("|- "):
            continue
        cells = [c.strip() for c in s.strip("|").split("|")]
        if len(cells) == 2:
            out.append(cells)
    return out


def strip_keys(text):
    return re.sub(r"(景别|机位|运镜|焦点|切换)=", "", text)


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    name = sys.argv[1] if len(sys.argv) > 1 else "terrain-huangfeng-valley-near-shore/chain-01-a1"
    card_dir = CARD / name
    out_dir = card_dir / "video"

    cam = rows(card_dir / "card-camera.md")
    states = [v for _, v in cam if "景别" in v]
    if not states:
        raise SystemExit("镜头卡没有可用的镜头状态行")
    if len(set(states)) != 1:
        raise SystemExit("四帧镜头状态不一致，不能当静止镜头送验")
    cam_state = strip_keys(states[0])
    print("CAMERA", cam_state)

    table = rows(card_dir / "card.md")
    picked = [(k, v) for k, v in table if k in VISIBLE]
    order = {k: i for i, k in enumerate(VISIBLE)}
    picked.sort(key=lambda kv: order[kv[0]])
    names = [k for k, _ in picked]
    unknown = [k for k, _ in table if k not in VISIBLE and k not in ("维度", "内容")]
    print("ROWS", names, len(names))
    if unknown:
        print("WARN 非可视行未送", unknown)
    if not picked:
        raise SystemExit("卡里没有可视行")

    core = "。".join(v.rstrip("。") for _, v in picked) + "。"
    body = "镜头：" + cam_state + "\n" + core + "\n" + TAIL

    out_dir.mkdir(parents=True, exist_ok=True)
    p = out_dir / "prompt-video.txt"
    p.write_text("[VERIFY] " + VIDEO_HEAD + "\n" + body + "\n", encoding="utf-8")
    print("OUT", p.relative_to(CARD), len(p.read_text(encoding="utf-8")), "chars")
    return 0


if __name__ == "__main__":
    sys.exit(main())
