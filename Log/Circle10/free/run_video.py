"""自由任务 Step 2：首帧图生视频。首帧 = 刚出的全身图，prompt 只写运动逻辑，不写长相。

通道「MiniMax+H3+首帧图生视频」2113790012012720129：
  node 140:image（首帧）/ 115:aspect_ratio / 115:megapixels / 133:duration / 142:prompt
注意该应用 prompt 节点字段是 value 不是 prompt（Circle10 i2v 踩过）。

用法：python Log/Circle10/free/run_video.py <首帧图> <tag>
"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
os.environ["PYTHONPATH"] = str(ROOT / "Skill" / "RHClaw" / "runninghub" / "scripts")
os.environ["PYTHONUTF8"] = "1"
os.environ["PYTHONIOENCODING"] = "utf-8"

m = re.search(r"apikey:\s*(\S+)", (ROOT / "AGENTS.md").read_text(encoding="utf-8"))
os.environ["RUNNINGHUB_API_KEY"] = m.group(1)

first = Path(sys.argv[1])
tag = sys.argv[2]
prompt = (HERE / "video-prompt.txt").read_text(encoding="utf-8").strip()

outdir = HERE / "output"
video = outdir / f"{tag}.mp4"
(outdir / f"{tag}.mp4.prompt.txt").write_text(prompt, encoding="utf-8")

cmd = [
    sys.executable,
    str(ROOT / "Skill" / "RHClaw" / "runninghub" / "scripts" / "runninghub_app.py"),
    "--run", "2113790012012720129",
    "--node", "142:value=" + prompt,
    "--node", "133:value=5",
    "--node", "115:aspect_ratio=3:4 (Portrait Standard)",
    "--node", "115:megapixels=0.6",
    "--file", "140:image=" + str(first),
    "-o", str(video),
]
print(f"首帧 {first.name} → {video.name}", flush=True)
r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", timeout=1800)
print("RC", r.returncode, flush=True)
print(r.stdout[-1200:], flush=True)
if r.stderr:
    print("--- STDERR ---", flush=True)
    print(r.stderr[-600:], flush=True)
