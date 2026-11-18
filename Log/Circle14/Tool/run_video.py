"""Circle14 文生视频：直送 prompt → MiniMax H3 加速版，480P / 5s / 16:9。

用法：python Log/Circle14/Tool/run_video.py <链目录> <tag>
输出落在 <链>/video/，账本记到 Log/Circle14/ledger.json。
"""
import json
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


def main() -> int:
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    chain = Path(sys.argv[1])
    if not chain.is_absolute():
        chain = HERE / chain
    tag = sys.argv[2]
    src = chain / "video" / "prompt-video.txt"
    if not src.exists():
        raise SystemExit("prompt 不存在，先跑 compose.py: " + str(src))
    prompt = src.read_text(encoding="utf-8").rstrip("\n")

    video = chain / "video" / (tag + ".mp4")
    snapshot = chain / "video" / (tag + ".mp4.prompt.txt")
    snapshot.write_text(prompt, encoding="utf-8")
    print("PROMPT_CHARS", len(prompt))
    print("PROMPT_SHA1", __import__("hashlib").sha1(prompt.encode("utf-8")).hexdigest()[:12])

    before = credit.remain_point()
    print("BAL_BEFORE", before)

    env = dict(os.environ)
    env["RUNNINGHUB_API_KEY"] = credit.api_key()
    cmd = [
        sys.executable,
        str(ROOT / "Skill" / "RHclaw" / "runninghub" / "scripts" / "runninghub_app.py"),
        "--run", "2085304953094107137",
        "--node", "250:prompt=" + prompt,
        "--node", "115:aspect_ratio=16:9 (Widescreen)",
        "--node", "225:select=1",
        "--node", "205:select=1",
        "-o", str(video),
    ]
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8",
                       errors="replace", timeout=1800, env=env)
    log = (r.stdout or "") + ("\n--- STDERR ---\n" + r.stderr if r.stderr else "")
    (chain / "video" / (tag + ".run.log")).write_text(log, encoding="utf-8")
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
    credit.add(tag, charged, src.name, before=before, after=after)
    return 0 if r.returncode == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
