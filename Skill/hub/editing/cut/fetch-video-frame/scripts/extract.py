"""按时间窗导出关键帧与分段视频（时间窗由视觉判读给出，本脚本不判读）。

用法：
  python extract.py <目录> --windows '[{"start":1.2,"end":2.0,"label":"盾牌"}]'
  python extract.py <目录> --windows windows.json [--only frames|clips]

输入：<目录>/meta.json（prepare.py 产物）；windows 为 JSON 字符串或文件路径。
输出：<目录>/keyframes/、<目录>/clips/、<目录>/extract.json
边界：只读源视频；关键帧用 cv2 取精确帧，分段用 FFmpeg 无损流拷贝（切到关键帧，
      起止会偏移，脚本回读实际时间写回 manifest，不假装精确）；无命中给空数组，不编造。
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = next(p for p in Path(__file__).resolve().parents if (p / "Skill").is_dir() and (p / "Tool").is_dir())
DEPS = ROOT / "Tool" / "_deps"
if DEPS.is_dir():
    sys.path.insert(0, str(DEPS))
import cv2

sys.stdout.reconfigure(encoding="utf-8")


def ffmpeg_exe() -> Path:
    """FFmpeg 静态二进制，与 Tool/ffmpeg.py 同一来源。"""
    bins = sorted((DEPS / "imageio_ffmpeg" / "binaries").glob("ffmpeg-*.exe"))
    if not bins:
        raise SystemExit("未找到 FFmpeg，请先运行 python Tool/setup_deps.py")
    return bins[0]


def probe_duration(path: Path) -> float | None:
    """只读探测片段实际时长，用于校正流拷贝的起止偏移。"""
    # -f null - 让 FFmpeg 完整跑一遍，流信息（含 Duration）打印到 stderr
    cmd = [str(ffmpeg_exe()), "-hide_banner", "-i", str(path), "-f", "null", "-"]
    r = subprocess.run(cmd, capture_output=True, text=True, errors="replace")
    m = re.search(r"Duration:\s*(\d+):(\d+):(\d+\.\d+)", r.stderr)
    if not m:
        return None
    return int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3])


def load_windows(raw: str) -> list:
    p = Path(raw)
    if p.is_file():
        data = json.loads(p.read_text(encoding="utf-8"))
    else:
        data = json.loads(raw)
    if isinstance(data, dict):
        data = data.get("windows", [])
    if not isinstance(data, list):
        raise SystemExit("windows 必须是数组或含 windows 数组的对象")
    return data


def safe_label(s: str) -> str:
    s = re.sub(r"[\\/:*?\"<>|\s]+", "_", str(s)).strip("._")
    return (s or "hit")[:40]


def main() -> int:
    ap = argparse.ArgumentParser(description="按时间窗导出关键帧与片段")
    ap.add_argument("directory", help="prepare.py 的输出目录（含 meta.json）")
    ap.add_argument("--windows", required=True, help="JSON 字符串或 JSON 文件路径")
    ap.add_argument("--only", choices=["frames", "clips"], default=None, help="只导出某一类")
    a = ap.parse_args()

    out = Path(a.directory).expanduser()
    meta_path = out / "meta.json"
    if not meta_path.is_file():
        raise SystemExit("找不到 meta.json，请先跑 prepare.py：" + str(meta_path))
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    fps = meta["fps"]
    w, h = meta["size"]
    video = Path(meta["source"])

    windows = load_windows(a.windows)
    kdir, cdir = out / "keyframes", out / "clips"
    if a.only in (None, "frames"):
        kdir.mkdir(exist_ok=True)
    if a.only in (None, "clips"):
        cdir.mkdir(exist_ok=True)

    cap = cv2.VideoCapture(str(video))
    if not cap.isOpened():
        raise SystemExit("打不开视频：" + str(video))
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    results = []
    for i, win in enumerate(windows, 1):
        if not isinstance(win, dict) or "start" not in win or "end" not in win:
            raise SystemExit(f"第 {i} 个窗口缺 start/end")
        start, end = float(win["start"]), float(win["end"])
        if end < start or start < 0:
            raise SystemExit(f"第 {i} 个窗口时间非法：{start}~{end}")
        label = safe_label(win.get("label", "hit"))

        f_start = min(total - 1, round(start * fps))
        f_end = min(total - 1, round(end * fps))
        mid = f_start if end == start else (f_start + f_end) // 2
        actual_start, actual_end = round(f_start / fps, 3), round(f_end / fps, 3)
        item = {"index": i, "label": label, "requested": [start, end],
                "actual_start": actual_start, "actual_end": actual_end,
                "frame_start": f_start, "frame_end": f_end}

        if a.only in (None, "frames"):
            cap.set(cv2.CAP_PROP_POS_FRAMES, mid)
            ok, frame = cap.read()
            if not ok:
                raise SystemExit(f"第 {i} 个窗口关键帧读取失败")
            kpath = kdir / f"{i:02d}-{label}-{round(mid / fps, 3):.3f}s.png"
            # cv2.imwrite 在 Windows 下对中文路径会写出乱码文件名，改用 imencode + 二进制写
            ok_enc, buf = cv2.imencode(".png", frame)
            if not ok_enc:
                raise SystemExit(f"第 {i} 个窗口关键帧编码失败")
            kpath.write_bytes(buf.tobytes())
            item["keyframe"] = kpath.as_posix()

        if a.only in (None, "clips") and end > start:
            # FFmpeg 无损流拷贝：-ss 放在 -i 前为输入侧快速定位，-to 用绝对时间。
            # 流拷贝只能从关键帧起切，实际起止会偏移，故回读片段时长并写回 manifest。
            cpath = cdir / f"{i:02d}-{label}-{actual_start:.3f}-{actual_end:.3f}.mp4"
            cmd = [str(ffmpeg_exe()), "-y", "-v", "error",
                   "-ss", f"{start:.3f}", "-i", str(video),
                   "-to", f"{end - start:.3f}", "-c", "copy", str(cpath)]
            r = subprocess.run(cmd, capture_output=True, text=True, errors="replace")
            if r.returncode != 0 or not cpath.is_file() or cpath.stat().st_size == 0:
                raise SystemExit(f"FFmpeg 切段失败：{(r.stderr or '').strip()[:200]}")
            real_dur = probe_duration(cpath)
            item["clip"] = cpath.as_posix()
            item["clip_mode"] = "ffmpeg-stream-copy"   # 无损，起止对齐关键帧
            if real_dur is not None:
                item["clip_actual_duration"] = round(real_dur, 3)
                # 流拷贝的真实起点 ≈ 请求终点 - 实际时长，写回供判读时校正
                item["clip_estimated_start"] = round(end - real_dur, 3)
        results.append(item)

    cap.release()
    (out / "extract.json").write_text(
        json.dumps({"windows": results, "only": a.only}, ensure_ascii=False, indent=2),
        encoding="utf-8")
    print("WINDOWS", len(results))
    for r in results:
        print("HIT", r["index"], r["label"], r["actual_start"], r["actual_end"],
              "keyframe", r.get("keyframe", "-"), "clip", r.get("clip", "-"))
    print("MANIFEST", out / "extract.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
