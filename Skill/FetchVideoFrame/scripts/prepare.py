"""抽帧拼图：从视频链接/本地文件按固定间隔抽帧，生成带时间戳的拼图供视觉判读。

用法：
  python prepare.py <视频链接|本地路径> --out <目录> [--step 0.5] [--per-sheet 20]
                    [--cell 240] [--start 1.0] [--end 3.0] [--max-frames 400]

输出：<out>/video.mp4（仅下载时）、frames/、sheet-*.png、meta.json
依赖：cv2/Pillow（本机在 Tool/_deps，脚本自动注入 sys.path）。
边界：只机械抽帧与拼图，不做任何内容判断，不修改源视频。
"""
import argparse
import json
import math
import re
import sys
import urllib.request
from pathlib import Path

DEPS = Path(__file__).resolve().parents[3] / "Tool" / "_deps"
if DEPS.is_dir():
    sys.path.insert(0, str(DEPS))
import cv2
from PIL import Image, ImageDraw

sys.stdout.reconfigure(encoding="utf-8")


def download(src: str, out: Path) -> Path:
    req = urllib.request.Request(src, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=120) as resp, out.open("wb") as fh:
        while True:
            chunk = resp.read(1 << 20)
            if not chunk:
                break
            fh.write(chunk)
    return out


def resolve_source(src: str, out: Path) -> tuple:
    if re.match(r"^https?://", src, re.I):
        out.mkdir(parents=True, exist_ok=True)
        dest = out / "video.mp4"
        return download(src, dest), True
    p = Path(src).expanduser()
    if not p.is_file():
        raise SystemExit("视频不存在：" + str(p))
    return p, False


def fmt_time(sec: float) -> str:
    m, s = divmod(sec, 60)
    return f"{int(m):02d}:{s:06.3f}"


def main() -> int:
    ap = argparse.ArgumentParser(description="抽帧拼图（机械，不判读）")
    ap.add_argument("source", help="视频链接或本地路径")
    ap.add_argument("--out", required=True, help="输出目录")
    ap.add_argument("--step", type=float, default=0.5)
    ap.add_argument("--per-sheet", type=int, default=20)
    ap.add_argument("--cell", type=int, default=240)
    ap.add_argument("--start", type=float, default=None)
    ap.add_argument("--end", type=float, default=None)
    ap.add_argument("--max-frames", type=int, default=400)
    a = ap.parse_args()
    if a.step <= 0 or a.per_sheet < 1 or a.cell < 32 or a.max_frames < 1:
        raise SystemExit("参数非法：step>0, per-sheet>=1, cell>=32, max-frames>=1")

    out = Path(a.out).expanduser()
    out.mkdir(parents=True, exist_ok=True)
    video, downloaded = resolve_source(a.source, out)

    cap = cv2.VideoCapture(str(video))
    if not cap.isOpened():
        raise SystemExit("打不开视频：" + str(video))
    fps = cap.get(cv2.CAP_PROP_FPS) or 24.0
    fps_assumed = cap.get(cv2.CAP_PROP_FPS) == 0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total / fps
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    t0 = max(0.0, a.start if a.start is not None else 0.0)
    t1 = min(duration, a.end if a.end is not None else duration)
    if t1 <= t0:
        raise SystemExit(f"时间范围非法：start={t0} end={t1} 视频时长={duration:.2f}")

    step_frames = max(1, round(a.step * fps))
    frame_nums = list(range(math.ceil(t0 * fps), min(total, math.floor(t1 * fps)) + 1, step_frames))
    stride = max(1, math.ceil(len(frame_nums) / a.max_frames))
    if stride > 1:
        frame_nums = frame_nums[::stride]
    if not frame_nums:
        raise SystemExit("该时间范围内没有可抽的帧")

    frames_dir = out / "frames"
    frames_dir.mkdir(exist_ok=True)
    frames = []
    for fi in frame_nums:
        cap.set(cv2.CAP_PROP_POS_FRAMES, fi)
        ok, frame = cap.read()
        if not ok:
            continue
        name = f"f{fi:06d}.png"
        cv2.imwrite(str(frames_dir / name), frame)
        frames.append({"file": "frames/" + name, "frame": fi, "time": round(fi / fps, 3)})
    cap.release()
    if not frames:
        raise SystemExit("抽帧失败：没有读到任何帧")

    cell_w = a.cell
    cell_h = max(1, round(cell_w * h / w))
    label_h = 20
    cols = 5
    sheets = []
    for page_start in range(0, len(frames), a.per_sheet):
        chunk = frames[page_start:page_start + a.per_sheet]
        rows = math.ceil(len(chunk) / cols)
        canvas = Image.new("RGB", (cols * cell_w, rows * (cell_h + label_h)), (24, 26, 30))
        draw = ImageDraw.Draw(canvas)
        for k, fr in enumerate(chunk):
            with Image.open(out / fr["file"]) as im:
                thumb = im.convert("RGB").resize((cell_w, cell_h))
            x, y = (k % cols) * cell_w, (k // cols) * (cell_h + label_h)
            canvas.paste(thumb, (x, y + label_h))
            draw.text((x + 6, y + 4), f"{fmt_time(fr['time'])} | f{fr['frame']}", fill=(235, 238, 242))
        sheet_name = f"sheet-{len(sheets) + 1:02d}.png"
        canvas.save(out / sheet_name)
        sheets.append(sheet_name)

    meta = {
        "source": str(video), "downloaded": downloaded, "fps": round(fps, 3),
        "fps_assumed": fps_assumed, "duration": round(duration, 3),
        "size": [w, h], "range": [round(t0, 3), round(t1, 3)],
        "step": a.step, "stride": stride, "frames": frames, "sheets": sheets,
    }
    (out / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print("VIDEO", video, "duration", round(duration, 3), "fps", round(fps, 3), "size", (w, h))
    print("FRAMES", len(frames), "stride", stride, "range", (round(t0, 3), round(t1, 3)))
    print("SHEETS", " ".join(sheets))
    print("META", out / "meta.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
