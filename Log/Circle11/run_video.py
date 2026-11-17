"""Circle11 文生视频：地貌卡 → MiniMax H3 加速版，480P / 5s / 16:9 / 一镜到底。

用法：python Log/Circle11/run_video.py v1-a [prompt文件]
"""
import os
import re
import subprocess
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
os.environ["PYTHONPATH"] = str(ROOT / "Skill" / "RHclaw" / "runninghub" / "scripts")
os.environ["PYTHONUTF8"] = "1"
os.environ["PYTHONIOENCODING"] = "utf-8"

m = re.search(r"apikey:\s*(\S+)", (ROOT / "AGENTS.md").read_text(encoding="utf-8"))
os.environ["RUNNINGHUB_API_KEY"] = m.group(1)

tag = sys.argv[1] if len(sys.argv) > 1 else "v1-a"
src = HERE / (sys.argv[2] if len(sys.argv) > 2 else "prompt-v3-video.txt")
# 205:select 是 input 索引：input1=5s、input5=9s；默认传 1 = 5 秒
dur = sys.argv[3] if len(sys.argv) > 3 else "1"
prompt = src.read_text(encoding="utf-8").rstrip("\n")

outdir = HERE / "output"
outdir.mkdir(parents=True, exist_ok=True)
video = outdir / "{}.mp4".format(tag)
(outdir / "{}.mp4.prompt.txt".format(tag)).write_text(prompt, encoding="utf-8")
print("PROMPT_CHARS", len(prompt), "SNAPSHOT", src.name)

cmd = [
    sys.executable,
    str(ROOT / "Skill" / "RHclaw" / "runninghub" / "scripts" / "runninghub_app.py"),
    "--run", "2085304953094107137",
    "--node", "250:prompt=" + prompt,
    "--node", "115:aspect_ratio=16:9 (Widescreen)",
    "--node", "225:select=1",
    "--node", "205:select=" + dur,
    "-o", str(video),
]
r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", timeout=1800)
print("RC", r.returncode)
print("--- STDOUT ---")
print(r.stdout)
if r.stderr:
    print("--- STDERR ---")
    print(r.stderr[-1500:])

charged = re.search(r"chargedPoint[\"':=\s]+([0-9.]+)", r.stdout + r.stderr)
if charged:
    print("CHARGED_POINT", charged.group(1))
    try:
        import credit
        credit.add(tag, charged.group(1), src.name)
    except Exception as e:  # noqa: BLE001
        print("LEDGER_WARN", e)
