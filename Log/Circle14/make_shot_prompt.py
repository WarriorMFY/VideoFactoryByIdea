"""Circle14 从「设定卡 + 镜头覆盖卡」派生一条 shot 的送验 prompt。

单一真相源：
  card.md         设定卡（7 行，不改）
  card-shots.md   镜头覆盖卡（按景别层切 shot，给出逐字可送验的行写法）
  card-camera.md  镜头卡（四帧五元组）

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


def rows(path):
    """两列表格（用于设定卡与镜头卡）。"""
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


def load_shots(path):
    """解析 card-shots.md 的分节结构：## S1 · 谷底近岸 / 表格字段 / **行写法** 列表。"""
    shots = {}
    cur = None
    for line in path.read_text(encoding="utf-8").splitlines():
        s = line.strip()
        m = re.match(r"^##\s+(S\d+)\b", s)
        if m:
            cur = {"name": m.group(1), "fields": {}, "rows": []}
            shots[cur["name"]] = cur
            continue
        if cur is None:
            continue
        if s.startswith("|"):
            cells = [c.strip() for c in s.strip("|").split("|")]
            if len(cells) == 2:
                cur["fields"][cells[0]] = cells[1]
            continue
        m = re.match(r"^-\s*([^：:]+)[：:]\s*(.+)$", s)
        if m and not s.startswith("- ["):
            cur["rows"].append((m.group(1).strip(), m.group(2).strip()))
    return shots


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    shot = sys.argv[1]

    shots = load_shots(CARD_DIR / "card-shots.md")
    if shot not in shots:
        raise SystemExit("覆盖卡里没有 %s，现有：%s" % (shot, list(shots)))
    plan = shots[shot]
    dims = [k for k, _ in plan["rows"]]
    print("SHOT", shot, "DIMS", dims)
    if not plan["rows"]:
        raise SystemExit("覆盖卡该 shot 下没有行写法")
    if len(plan["rows"]) > 3:
        raise SystemExit("该 shot 超过 3 行，超出单条容量")

    cam_file = plan["fields"].get("外挂镜头卡", "").strip().strip("`")
    if not cam_file or "缺失" in cam_file:
        raise SystemExit("该 shot 未指定可用的外挂镜头卡：%r" % cam_file)
    print("CAMERA_CARD", cam_file)

    cam = rows(CARD_DIR / cam_file)
    states = [v for _, v in cam if "景别" in v]
    if not states or len(set(states)) != 1:
        raise SystemExit("镜头卡四帧状态不一致，或未找到镜头状态行")
    cam_state = strip_keys(states[0])

    core = "。".join(v.rstrip("。") for _, v in plan["rows"]) + "。"
    body = "镜头：" + cam_state + "\n" + core + "\n" + TAIL
    out_dir = CARD_DIR / shot
    out_dir.mkdir(parents=True, exist_ok=True)
    p = out_dir / "prompt-video.txt"
    p.write_text("[VERIFY] " + VIDEO_HEAD + "\n" + body + "\n", encoding="utf-8")
    print("OUT", p.relative_to(CARD), len(p.read_text(encoding="utf-8")), "chars")
    return 0


if __name__ == "__main__":
    sys.exit(main())
