# -*- coding: utf-8 -*-
"""拼回：按段表把生成片裁到源段长，拼成整片，可选做左右对照与接触表。

用法:
  python assemble.py --table segments.json --indir out --outdir trim \
      [--compare 源片.mp4] [--font 字体.ttc] [--strip] [--ffmpeg ffmpeg.exe]

产出:
  <outdir>/<段id>.mp4     裁到源段长
  <outdir>/all.mp4        整片拼接
  <outdir>/sbs.mp4        与源片左右对照（需 --compare）
  <outdir>/strip.png      接触表（需 --strip）
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np

sys.stdout.reconfigure(encoding="utf-8")


def find_ffmpeg(explicit):
    for c in (explicit, os.environ.get("FFMPEG"), shutil.which("ffmpeg")):
        if c and Path(c).exists():
            return str(c)
    sys.exit("找不到 ffmpeg：用 --ffmpeg 指定，或设环境变量 FFMPEG，或把 ffmpeg 放进 PATH")


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        sys.exit("ffmpeg 失败：\n%s" % (r.stderr or "")[-600:])
    return r


def vchain(width, height, fps, dur, font, text):
    """构造单路滤镜链。宽高必须写死：两路按比例缩放会差出 1px，hstack 直接失败。"""
    s = ("scale=%d:%d,setsar=1,fps=%s,trim=duration=%.3f,setpts=PTS-STARTPTS"
         % (width, height, fps, dur))
    if font:
        s += (",drawtext=fontfile=%s:text='%s':x=12:y=10:fontsize=20:"
              "fontcolor=white:box=1:boxcolor=black@0.45" % (font, text))
    return s


def probe(path):
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        sys.exit("打不开：%s" % path)
    fps = cap.get(5) or 24.0
    n = int(cap.get(7))
    w, h = int(cap.get(3)), int(cap.get(4))
    cap.release()
    return fps, n, w, h


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--table", required=True)
    ap.add_argument("--indir", default="out")
    ap.add_argument("--outdir", default="trim")
    ap.add_argument("--compare", default=None, help="源片路径，给了就出左右对照")
    ap.add_argument("--font", default=None, help="drawtext 字体文件，缺省不加标注")
    ap.add_argument("--width", type=int, default=640, help="对照图单路宽度")
    ap.add_argument("--height", type=int, default=360, help="对照图单路高度，两路必须一致")
    ap.add_argument("--strip", action="store_true", help="输出接触表 png")
    ap.add_argument("--ffmpeg", default=None)
    a = ap.parse_args()

    FF = find_ffmpeg(a.ffmpeg)
    table_path = Path(a.table).resolve()
    table = json.loads(table_path.read_text(encoding="utf-8"))
    indir, outdir = Path(a.indir), Path(a.outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    done, concat_lines = [], []
    for seg in table["segments"]:
        sid, dur = seg["id"], float(seg["end"]) - float(seg["start"])
        src = indir / ("%s.mp4" % sid)
        if not src.exists():
            print("[%s] 缺生成片，跳过" % sid)
            continue
        dst = outdir / ("%s.mp4" % sid)
        run([FF, "-y", "-hide_banner", "-loglevel", "error", "-i", str(src.resolve()),
             "-t", "%.3f" % dur, "-c:v", "libx264", "-crf", "16", "-preset", "medium",
             "-pix_fmt", "yuv420p", "-an", str(dst.resolve())])
        fps, n, w, h = probe(dst)
        done.append({"id": sid, "trim_to": round(dur, 3), "frames": n,
                     "dur": round(n / fps, 3), "size": "%dx%d" % (w, h)})
        concat_lines.append("file '%s'" % dst.resolve().as_posix())
        print("[%s] 裁到 %.2fs -> %d 帧 %.2fs" % (sid, dur, n, n / fps))

    if not concat_lines:
        sys.exit("没有可拼的段")
    listfile = outdir / "concat.txt"
    listfile.write_text("\n".join(concat_lines) + "\n", encoding="utf-8")
    allmp4 = outdir / "all.mp4"
    run([FF, "-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0",
         "-i", str(listfile.resolve()), "-c:v", "libx264", "-crf", "16", "-preset",
         "medium", "-pix_fmt", "yuv420p", "-an", str(allmp4.resolve())])
    fps, n, w, h = probe(allmp4)
    print("[all] %d 帧 %.3fs %dx%d" % (n, n / fps, w, h))

    if a.compare:
        cmp_src = Path(a.compare).resolve()
        total = sum(d["dur"] for d in done)
        font = None
        if a.font:
            # 盘符冒号要转两层：filtergraph 层 + 选项层，否则 fontfile 被截成 "F"
            font = Path(a.font).resolve().as_posix().replace(":", "\\\\:")
        dw, dh = a.width, a.height
        flt = ("[0:v]%s[v0];[1:v]%s[v1];[v0][v1]hstack=inputs=2[v]"
               % (vchain(dw, dh, fps, total, font, "源片"),
                  vchain(dw, dh, fps, total, font, "重绘")))
        sbs = outdir / "sbs.mp4"
        run([FF, "-y", "-hide_banner", "-loglevel", "error", "-i", str(cmp_src),
             "-i", str(allmp4.resolve()), "-filter_complex", flt, "-map", "[v]",
             "-map", "0:a?", "-c:v", "libx264", "-crf", "18", "-preset", "medium",
             "-pix_fmt", "yuv420p", "-c:a", "copy", "-t", "%.3f" % total, str(sbs.resolve())])
        print("[sbs] -> %s" % sbs)

    if a.strip:
        cap = cv2.VideoCapture(str(allmp4))
        fps2, n2, w2, h2 = probe(allmp4)
        cols = 5
        rows = 4
        tw, th = 320, 180
        canvas = np.full((rows * (th + 16), cols * tw, 3), 18, dtype="uint8")
        for i in range(cols * rows):
            t = i * (n2 / fps2) / (cols * rows)
            cap.set(cv2.CAP_PROP_POS_FRAMES, min(int(t * fps2), n2 - 1))
            ok, f = cap.read()
            if not ok:
                break
            f = cv2.resize(f, (tw, th))
            y = (i // cols) * (th + 16) + 16
            x = (i % cols) * tw
            canvas[y:y + th, x:x + tw] = f
            cv2.putText(canvas, "%.1fs" % t, (x + 4, y - 4), cv2.FONT_HERSHEY_SIMPLEX,
                        0.42, (120, 220, 220), 1, cv2.LINE_AA)
        cap.release()
        sp = outdir / "strip.png"
        cv2.imwrite(str(sp), canvas)
        print("[strip] -> %s" % sp)

    (outdir / "assemble.json").write_text(
        json.dumps({"segments": done, "all": str(allmp4)}, ensure_ascii=False, indent=2),
        encoding="utf-8")


if __name__ == "__main__":
    main()
