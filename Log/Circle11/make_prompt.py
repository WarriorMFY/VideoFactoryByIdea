"""组装送验 Prompt：验证用固定变量块 + 卡片正文逐字照抄。

规则（延续既有实践）：
  - 卡片右列文本一字不改、不换算、不调语序
  - 去键名：左列维度名不送，只送右列内容
  - 唯一允许增加的是防干扰块；本轮的防干扰块经用户裁定「两段都附」，
    单独成段并标记 [VERIFY]，入库时剔除

用法：python Log/Circle11/make_prompt.py card-v1.md
"""
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
HERE = Path(__file__).resolve().parent

IMAGE_HEAD = ("画面为固定不动的远景，地貌整体完整入画，画面干净、无特效无遮挡；"
              "画面内无人物、无文字、无水印。")

VIDEO_HEAD = ("画面为固定不动的远景，一镜到底、无推拉摇移、无剪辑，地貌整体完整入画，"
              "画面干净、无特效无遮挡；画面内无人物、无文字、无水印；"
              "全片仅枝叶与水面自然摆动。")

# v3-b 用："固定远景"被模型读成航拍，补否定式硬约束（仍只属验证块）
LOCK_HEAD = ("机位固定不动、无航拍、无前进后退、无推拉摇移、无变焦、无剪辑，一镜到底；"
             "地貌整体完整入画，画面干净、无特效无遮挡；"
             "画面内无人物、无文字、无水印；全片仅枝叶与水面自然摆动。")

# 越界词（元卡片 §二）。积雪属地面覆盖，放行。
BAN = {
    "人物": ["人", "男", "女", "弟子", "修士", "老者", "少年", "韩立"],
    "服装": ["衣", "袍", "裙", "甲"],
    "镜头": ["镜头", "景别", "特写", "全景", "推拉", "摇移", "景深", "焦距", "mm"],
    "光线大气": ["阳光", "月光", "光线", "光照", "逆光", "侧光", "柔光", "明暗", "阴影",
                "雾", "云", "霞", "烟霾", "晴天", "阴天", "下雨"],
    "方位": ["左", "右"],
}
# 卡片里合法但会被子串误伤的词
ALLOW = ["积雪", "雨后"]


def rows(md_text):
    out = []
    for line in md_text.splitlines():
        s = line.strip()
        if not s.startswith("|"):
            continue
        cells = [c.strip() for c in s.strip("|").split("|")]
        if len(cells) != 2 or set(cells[0]) <= set("- :") or cells[0] == "维度":
            continue
        out.append((cells[0], cells[1]))
    return out


def scan(text):
    warn = []
    probe = text
    for w in ALLOW:
        probe = probe.replace(w, "")
    for k, words in BAN.items():
        for w in words:
            if w in probe:
                warn.append("{}: {}".format(k, w))
    return warn


def main():
    stem = sys.argv[1] if len(sys.argv) > 1 else "card-v1.md"
    path = HERE / stem if not Path(stem).is_absolute() else Path(stem)
    text = path.read_text(encoding="utf-8")
    body = text.split("---", 2)[2] if text.startswith("---") else text
    rs = rows(body)
    if not rs:
        raise SystemExit("未解析到两列表格")

    core = "。".join(c for _, c in rs) + "。"
    for kind, head in (("image", IMAGE_HEAD), ("video", VIDEO_HEAD), ("video-lock", LOCK_HEAD)):
        prompt = "[VERIFY] " + head + "\n" + core
        out = HERE / "prompt-{}-{}.txt".format(path.stem.replace("card-", ""), kind)
        out.write_text(prompt, encoding="utf-8")
        print("==", out.name, "chars", len(prompt), "lines", prompt.count("\n") + 1)
    print("ROWS", len(rs))
    warn = scan(core)
    print("BAN_HITS", warn if warn else "none")
    print("--- CORE ---")
    print(core)
    return 0


if __name__ == "__main__":
    sys.exit(main())
