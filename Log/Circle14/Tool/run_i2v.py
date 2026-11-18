"""Circle14 首帧图生视频：动作卡正文（整卡直送）＋ 起始帧 → MiniMax H3 首帧图生视频。

用法：python Log/Circle14/Tool/run_i2v.py <卡片.md|链目录> <起始帧.jpg> <tag> [时长s=5] [比例=3:4 (Portrait Standard)] [megapixels=0.6]
链目录模式下读 <链目录>/video/prompt-video.txt，输出也落在该目录。
"""
import hashlib
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE))
sys.stdout.reconfigure(encoding="utf-8")
os.environ["PYTHONUTF8"] = "1"
os.environ["PYTHONIOENCODING"] = "utf-8"

import credit  # noqa: E402


def body(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    if text.startswith("---"):
        parts = text.split("---", 2)
        if len(parts) == 3:
            text = parts[2]
    return text.strip("\n") + "\n"


def main() -> int:
    if len(sys.argv) < 4:
        raise SystemExit(__doc__)
    card = Path(sys.argv[1])
    frame = Path(sys.argv[2])
    tag = sys.argv[3]
    duration = sys.argv[4] if len(sys.argv) > 4 else "5"
    aspect = sys.argv[5] if len(sys.argv) > 5 else "3:4 (Portrait Standard)"
    megapixels = sys.argv[6] if len(sys.argv) > 6 else "0.6"
    if not card.is_absolute():
        card = HERE.parent / card
    if not frame.is_absolute():
        frame = HERE.parent / frame
    if card.is_dir():
        outdir = card / "video"
        prompt = (outdir / "prompt-video.txt").read_text(encoding="utf-8").rstrip("\n")
        note = "prompt-video.txt"
    else:
        outdir = HERE / "i2v-boat-poling" / "video"
        prompt = body(card)
        note = card.name

    outdir.mkdir(parents=True, exist_ok=True)
    video = outdir / (tag + ".mp4")
    snapshot = outdir / (tag + ".mp4.prompt.txt")
    snapshot.write_text(prompt, encoding="utf-8")
    print("PROMPT_CHARS", len(prompt))
    print("PROMPT_SHA1", hashlib.sha1(prompt.encode("utf-8")).hexdigest()[:12])
    print("START_FRAME", frame.name, frame.stat().st_size, "B")
    print("PARAM", "duration=" + duration, "aspect=" + aspect, "mp=" + megapixels)

    before = credit.remain_point()
    print("BAL_BEFORE", before)

    env = dict(os.environ)
    env["RUNNINGHUB_API_KEY"] = credit.api_key()
    cmd = [
        sys.executable,
        str(ROOT / "Skill" / "RHclaw" / "runninghub" / "scripts" / "runninghub_app.py"),
        "--run", "2113790012012720129",
        "--file", "140:image=" + str(frame),
        "--node", "142:value=" + prompt,
        "--node", "133:value=" + duration,
        "--node", "115:aspect_ratio=" + aspect,
        "--node", "115:megapixels=" + megapixels,
        "-o", str(video),
    ]
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8",
                       errors="replace", timeout=1800, env=env)
    log = (r.stdout or "") + ("\n--- STDERR ---\n" + r.stderr if r.stderr else "")
    (outdir / (tag + ".run.log")).write_text(log, encoding="utf-8")
    print("RC", r.returncode)
    print(log[-2000:])

    after = credit.remain_point()
    print("BAL_AFTER", after)
    charged = None
    m = re.search(r"chargedPoint[\"':=\s]+([0-9.]+)", log)
    if m:
        charged = float(m.group(1))
    if charged is None and before is not None and after is not None:
        charged = round(float(before) - float(after), 2)
    if charged is None:
        raise SystemExit("无法确定消耗，未记账")
    print("CHARGED", charged)
    credit.add(tag, charged, note, before=before, after=after)
    return 0 if r.returncode == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
