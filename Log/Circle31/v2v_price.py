"""只读：解析官方标准模型价目页快照，抽「视频→视频」家族（编辑/续写/迁移/插帧/超分/字幕）的目录价。

输入：Log/Circle31/standard-model-pricelist.txt（WebFetch 快照，2026-11-24）
块结构：### 标题 \\n 描述（含 ¥价格）… 下一块开头的 task 词会黏在上一块的价后，先剥掉。
"""
import re
from pathlib import Path

SRC = Path(__file__).resolve().parent / "standard-model-pricelist.txt"
TASKS = {
    "text-to-audio", "image-to-image", "reference-to-video", "image-to-video", "video-edit",
    "video-to-video", "text-to-image", "text-to-video", "image-to-text", "video-to-text",
    "audio-generation", "music-generation", "video-extend", "video-upscale", "lip-sync-video",
    "motion-control", "start-end-to-video", "multimodal-video", "video-transition",
    "video-effects", "video-frame-interpolation", "video-fps-increase", "video-subtitle-erase",
    "video-denoise", "text-to-speech", "voice-clone", "video-translate", "short-play-video",
}
KW = ("video-edit", "video-to-video", "续写", "编辑", "迁移", "插帧", "超分", "字幕", "风格化",
      "去水印", "扩展", "延长", "多模态视频", "特效", "转场", "视频生成", "动作")


def blocks(text):
    parts = re.split(r"^### ", text, flags=re.M)[1:]
    for p in parts:
        lines = p.strip().splitlines()
        title = lines[0].strip()
        body = " ".join(x.strip() for x in lines[1:] if x.strip())
        yield title, body


def main():
    text = SRC.read_text(encoding="utf-8", errors="replace")
    for title, body in blocks(text):
        prices = re.findall(r"¥\s*([\d.]+)\s*(/[^\s¥，。；]*)?", body)
        if not prices:
            continue
        price = "¥" + prices[-1][0] + (prices[-1][1] or "")
        tail = "".join(TASKS)  # 价后常黏下一块的 task 词
        desc = body
        for t in sorted(TASKS, key=len, reverse=True):
            desc = desc.replace("¥" + t, "¥" + t)
        if not any(k in title or k in body[:160] for k in KW):
            continue
        first = re.split(r"[。！；]", desc)[0][:80]
        print(f"{title}\n  价 {price}  |  {first}")


if __name__ == "__main__":
    main()
