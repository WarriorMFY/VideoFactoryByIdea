"""Circle14 从「完整地貌卡 + 镜头覆盖表」派生一条 shot 的送验 prompt。

与 Circle13 的差别：不再先写一张裁切卡，而是读完整卡 card.md + shots.md，
按覆盖表列出的维度名逐字取原文——卡不动，镜头覆盖层才是可变量。

用法：python Log/Circle14/make_shot_prompt.py S2
输出：文生视频/terrain-huangfeng-valley/<shot>/prompt-video.txt
"""
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
CARD = Path(__file__).resolve().parent
CARD_DIR = CARD / "文生视频" / "terrain-huangfeng-valley"

VIDEO_HEAD = "画面为一帧近景实拍，一镜到底。"
TAIL = "画面内无人物、无文字、无水印。"
VISIBLE = ("尺度与格局", "地形骨架", "气候带", "水系", "植被带", "动物种群", "灵脉与异常")


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


def shot_plan(path):
    """覆盖表是 6 列：shot / 用途 / 景别层 / 覆盖维度 / 时长 / 状态。"""
    plan = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if not s.startswith("|") or set(s) <= set("|- "):
            continue
        cells = [c.strip() for c in s.strip("|").split("|")]
        if len(cells) >= 4 and re.fullmatch(r"S\d+", cells[0]):
            plan[cells[0]] = cells[3]
    return plan


def strip_keys(text):
    return re.sub(r"(景别|机位|运镜|焦点|切换)=", "", text)


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    shot = sys.argv[1]

    table = shot_plan(CARD_DIR / "shots.md")
    if shot not in table:
        raise SystemExit("覆盖表里没有 shot %s，现有：%s" % (shot, list(table)))
    dims = [d.strip() for d in re.split(r"[、,＋+]", table[shot]) if d.strip()]
    print("SHOT", shot, "DIMS", dims)

    cam = rows(CARD_DIR / "card-camera.md")
    states = [v for _, v in cam if "景别" in v]
    if not states or len(set(states)) != 1:
        raise SystemExit("镜头卡四帧状态不一致，或未找到镜头状态行")
    cam_state = strip_keys(states[0])

    card = {k: v for k, v in rows(CARD_DIR / "card.md") if k in VISIBLE}
    missing = [d for d in dims if d not in card]
    if missing:
        raise SystemExit("card.md 里找不到这些维度：%s" % missing)
    picked = [(d, card[d]) for d in sorted(dims, key=VISIBLE.index)]
    for d, _ in picked:
        print("  ROW", d)

    core = "。".join(v.rstrip("。") for _, v in picked) + "。"
    body = "镜头：" + cam_state + "\n" + core + "\n" + TAIL
    out_dir = CARD_DIR / shot
    out_dir.mkdir(parents=True, exist_ok=True)
    p = out_dir / "prompt-video.txt"
    p.write_text("[VERIFY] " + VIDEO_HEAD + "\n" + body + "\n", encoding="utf-8")
    print("OUT", p.relative_to(CARD), len(p.read_text(encoding="utf-8")), "chars")
    return 0


if __name__ == "__main__":
    sys.exit(main())
