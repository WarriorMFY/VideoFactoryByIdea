"""Circle12 组合 prompt：镜头卡（外挂机位） + 地貌卡可视行。

只取近景能覆盖的 4 行：水系 / 植被带 / 动物种群 / 灵脉与异常。
尺度与格局 / 地形骨架 / 气候带 不送——近景里不可见，送了会把画面拉回航拍。

[已废弃] 本脚本抽取字段重拼句子，违反 AGENTS.md 的直送规则，仅用于复现阶段 1 历史产物；新卡一律整卡拼接。

用法：python Log/Circle12/Tool/make_prompt_near.py [chain-02-near-a|chain-03-near-b|chain-04-near-c]
输出：terrain-huangfeng-valley-near/<chain>/video/prompt-near-video.txt
      chain-02 额外写 chain-01-precheck/image/prompt-near-image.txt
"""
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
CARD = Path(__file__).resolve().parents[1]
VID_DIR = CARD / "terrain-huangfeng-valley-near"
IMG_DIR = VID_DIR / "chain-01-precheck" / "image"
VISIBLE = ("水系", "植被带", "动物种群", "灵脉与异常")

IMAGE_HEAD = "画面为一帧近景实拍照片。"
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
    ver = sys.argv[1] if len(sys.argv) > 1 else "chain-02-near-a"
    cam = rows(VID_DIR / ver / "card-camera.md")
    states = [v for _, v in cam if "景别" in v]
    if not states:
        raise SystemExit("镜头卡没有可用的镜头状态行")
    if len(set(states)) != 1:
        raise SystemExit("四帧镜头状态不一致，不能当静止镜头送验")
    cam_state = strip_keys(states[0])
    print("CAMERA", cam_state)

    picked = [(k, v) for k, v in rows(VID_DIR / ver / "card.md") if k in VISIBLE]
    names = [k for k, _ in picked]
    print("VISIBLE_ROWS", names)
    if sorted(names) != sorted(VISIBLE):
        raise SystemExit("可视行缺失：期望 %s，实际 %s" % (VISIBLE, names))

    core = "。".join(v.rstrip("。") for _, v in picked) + "。"
    lens = "镜头：" + cam_state
    body = lens + "\n" + core + "\n" + TAIL

    jobs = [("video", VIDEO_HEAD, VID_DIR / ver / "video")]
    if ver == "chain-02-near-a":
        jobs.append(("image", IMAGE_HEAD, IMG_DIR))
    for suffix, head, folder in jobs:
        folder.mkdir(parents=True, exist_ok=True)
        p = folder / ("prompt-near-%s.txt" % suffix)
        p.write_text("[VERIFY] " + head + "\n" + body + "\n", encoding="utf-8")
        print("OUT", p.relative_to(CARD), len(p.read_text(encoding="utf-8")), "chars")
    return 0


if __name__ == "__main__":
    sys.exit(main())
