"""Circle14 直送拼接：镜头卡 + 地貌卡，只剥 frontmatter，正文逐字节拼接。

用法：python Log/Circle14/Tool/compose.py <链目录>（相对 Log/Circle14 或绝对路径）
输入：<链>/card-camera.md、<链>/card.md
输出：<链>/video/prompt-video.txt
"""
import hashlib
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
HERE = Path(__file__).resolve().parents[1]  # Log/Circle14


def body(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    if text.startswith("---"):
        end = text.find("\n---", 3)
        if end != -1:
            text = text[end + 4:]
    return text.strip("\n")


def main() -> int:
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    chain = Path(sys.argv[1])
    if not chain.is_absolute():
        chain = HERE / chain

    cam = body(chain / "card-camera.md")
    terrain = body(chain / "card.md")
    out_text = cam + "\n\n" + terrain + "\n"

    # 逐行断言：两张卡正文每一行都原样出现，顺序为镜头卡在前、地貌卡在后
    for label, text in (("camera", cam), ("terrain", terrain)):
        for line in text.splitlines():
            if line.strip() and line not in out_text:
                raise SystemExit("VERBATIM_FAIL {}: {}".format(label, line[:60]))
    if out_text.find(cam) == -1 or out_text.find(terrain) < out_text.find(cam):
        raise SystemExit("ORDER_FAIL")

    out_dir = chain / "video"
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / "prompt-video.txt"
    out.write_text(out_text, encoding="utf-8")

    print("CHAIN", chain.name)
    print("CAMERA_CHARS", len(cam), "TERRAIN_CHARS", len(terrain), "TOTAL", len(out_text))
    for name in ("card-camera.md", "card.md"):
        raw = (chain / name).read_bytes()
        print("SHA1", name, hashlib.sha1(raw).hexdigest()[:12], len(raw), "bytes")
    print("OUT", out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
