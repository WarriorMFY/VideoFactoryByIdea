"""副实验 A：只发肖像卡，不带固定变量卡。

与父目录 v1 的唯一差别是投递体：去掉「视频固定变量卡」的前段，只剩肖像卡正文。
其余（通道、画幅、时长、参数、跑两次）完全相同，用来回答
「取景／运动这些约束是不是身份漂移的成因」。

用法：python Log/Circle10/bare-portrait/make_prompt.py
"""
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[3]
BASE = ROOT / "RAG/portraits/figure-symmetric-cartographer/card.md"
OUT = ROOT / "Log/Circle10/bare-portrait/prompt-bare.txt"


def body(path):
    t = path.read_text(encoding="utf-8").replace("\r\n", "\n")
    if t.startswith("---"):
        return t.split("---", 2)[2].strip()
    return t.strip()


def main():
    base = body(BASE)
    OUT.write_text(base, encoding="utf-8")
    print("肖像卡正文字符", len(base), "字节", len(base.encode("utf-8")))
    print("前段（固定变量）", 0, "字符——本次不投")
    print("OUT", OUT)


if __name__ == "__main__":
    main()
