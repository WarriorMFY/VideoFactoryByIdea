"""L4 送验：整段 prompt 原样提交到 Seedance2.0-Mini 文生视频端点。

要点（沿用 Circle3 的教训）：
  1. 不截断：读 prompt-l4.txt 的第二行（整段），不按「第一行」切。
  2. 逐字自检：传给 runner 的字符串必须与文件内容完全相等。
  3. 只走 Seedance2.0-Mini，不擅自换通道。

用法：python Log/Circle4/run_l4_seedance.py [--resolution 480p] [--duration 5]
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROMPT = ROOT / "Log" / "Circle4" / "prompt-l4.txt"
RUNNER = "Skill/RHClaw/runninghub/scripts/runninghub.py"
ENDPOINT = "rhart-video/sparkvideo-2.0-mini/text-to-video"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--resolution", default="480p")
    ap.add_argument("--duration", default="5")
    ap.add_argument("--ratio", default="16:9")
    ap.add_argument("--out", default=str(ROOT / "Log" / "Circle4" / "output" / "l4-seedance-mini.mp4"))
    a = ap.parse_args()

    lines = PROMPT.read_text(encoding="utf-8").splitlines()
    text = lines[1]
    assert text and len(text) > 100, "L4 段为空或被截断"
    # 落快照并核对：发出去的字符串与快照逐字一致
    snap = Path(a.out + ".prompt.txt")
    snap.parent.mkdir(parents=True, exist_ok=True)
    snap.write_text(text, encoding="utf-8")
    assert snap.read_text(encoding="utf-8") == text
    print("PROMPT_LEN", len(text))
    print("SNAPSHOT_OK True")

    cmd = [sys.executable, RUNNER, "--endpoint", ENDPOINT,
           "--prompt", text,
           "--param", "resolution=" + a.resolution,
           "--param", "duration=" + a.duration,
           "--param", "ratio=" + a.ratio,
           "--param", "generateAudio=false",
           "--output", a.out]
    print("ENDPOINT", ENDPOINT)
    print("PARAMS", a.resolution, a.duration, a.ratio, "audio=false")
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", timeout=1800)
    print("RC", r.returncode)
    print(r.stdout[-3000:])
    if r.returncode:
        print("STDERR", r.stderr[-2000:])
    return r.returncode


if __name__ == "__main__":
    sys.exit(main())
