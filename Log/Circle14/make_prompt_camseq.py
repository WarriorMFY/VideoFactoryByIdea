"""Circle14 从「镜头-地貌合一卡」派生一条切镜 prompt。

一张卡同时给镜头（逐段五元组）与地貌（逐段覆盖的维度行写法），
按段顺序拼接，段标签只写进度区间，文本本身逐字取自卡内。

用法：python Log/Circle14/make_prompt_camseq.py
输出：文生视频/terrain-huangfeng-valley/camseq/prompt-video.txt
"""
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
CARD = Path(__file__).resolve().parent
CARD_DIR = CARD / "文生视频" / "terrain-huangfeng-valley"
SRC = CARD_DIR / "card-camseq.md"
OUT = CARD_DIR / "camseq" / "prompt-video.txt"

HEAD = "画面为实拍视频，段间硬切，段内机位不动。"
TAIL = "画面内无人物、无文字、无水印。"
KEYS = ("景别", "机位", "运镜", "焦点", "切换")


def segments(path):
    out = []
    for line in path.read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if not s.startswith("|") or set(s) <= set("|- "):
            continue
        cells = [c.strip() for c in s.strip("|").split("|")]
        if len(cells) != 2 or not cells[0].startswith("镜头段"):
            continue
        body = cells[1]
        prog = re.search(r"进度＝([^；]+)", body)
        vals = []
        for k in KEYS:
            m = re.search(k + r"＝([^；]+)", body)
            if not m:
                raise SystemExit("段缺字段 %s：%s" % (k, cells[0]))
            vals.append(m.group(1))
        cover = body.split("覆盖＝", 1)[1] if "覆盖＝" in body else ""
        if "沿用" in cover:
            print("SKIP", cells[0], "落幅沿用上一段，不重复送")
            continue
        rows = re.findall(r"「([^」]+)」", cover)
        if not rows:
            raise SystemExit("段没有可送的覆盖行：%s" % cells[0])
        if len(rows) > 3:
            raise SystemExit("段超过 3 行：%s（%d 行）" % (cells[0], len(rows)))
        out.append((prog.group(1) if prog else "", vals, rows))
    return out


def main():
    segs = segments(SRC)
    if not segs:
        raise SystemExit("没有可送的镜头段")
    lines = [HEAD]
    for i, (prog, vals, rows) in enumerate(segs, 1):
        head = "第%d段（%s）：" % (i, prog) if prog else "第%d段：" % i
        lines.append(head + "；".join(vals) + "。画面：" + "。".join(r.rstrip("。") for r in rows) + "。")
    lines.append(TAIL)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("SEGMENTS", len(segs), "ROWS", [len(r) for _, _, r in segs])
    print("OUT", OUT.relative_to(CARD), len(OUT.read_text(encoding="utf-8")), "chars")
    return 0


if __name__ == "__main__":
    sys.exit(main())
