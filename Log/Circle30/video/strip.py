"""Circle30 现场器材：两段视频抽 4 帧拼条，便于看动作与方向。
"""
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent  # Log/Circle30
FF = ROOT.parents[1] / "Tool" / "ffmpeg.py"
TMP = ROOT / "_tmp"
TMP.mkdir(exist_ok=True)
RUNS = {"V1": ROOT / "video" / "runs" / "V1-抹纸" / "out.mp4",
        "V2": ROOT / "video" / "runs" / "V2-压边" / "out.mp4"}
FRAMES = "select=eq(n\\,0)+eq(n\\,41)+eq(n\\,82)+eq(n\\,123)"

for key, mp4 in RUNS.items():
    for old in TMP.glob(f"{key}_*.png"):
        old.unlink()
    r = subprocess.run([sys.executable, str(FF), "-y", "-i", str(mp4),
                        "-vf", FRAMES, "-fps_mode", "passthrough", str(TMP / f"{key}_%02d.png")],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        print(f"[{key}] ffmpeg 失败\n{r.stderr[-800:]}")
        continue
    files = sorted(TMP.glob(f"{key}_*.png"))
    ims = [Image.open(f) for f in files]
    ims = [im.resize((round(im.width * 620 / im.height), 620), Image.LANCZOS) for im in ims]
    sheet = Image.new("RGB", (sum(i.width for i in ims) + 8 * (len(ims) - 1), 620), (18, 18, 18))
    x = 0
    for im in ims:
        sheet.paste(im, (x, 0))
        x += im.width + 8
    out = ROOT / "video" / f"{key}-strip.png"
    sheet.save(out)
    print(f"[{key}] {len(ims)} 帧 · 源尺寸 {ims[0].width}x{ims[0].height}(缩放后) -> {out}")
