# -*- coding: utf-8 -*-
"""按段表抽首尾关键帧。

用法:
  python keyframes.py --table segments.json --outdir keys [--pad 0]

段表格式（见 templates/segment-table.md）:
  {"source": "源片.mp4", "segments": [{"id":"S1","start":0.0,"end":4.4}, ...]}

输出:
  <outdir>/S1-first-f0.png、<outdir>/S1-last-f131.png、<outdir>/keys.json
"""
import argparse
import json
import sys
from pathlib import Path

import cv2

sys.stdout.reconfigure(encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--table", required=True, help="段表 JSON")
    ap.add_argument("--outdir", default="keys")
    ap.add_argument("--pad", type=int, default=0,
                    help="首尾各向内收缩的帧数；源片带转场时用 1–2")
    ap.add_argument("--source", default=None, help="覆盖段表里的 source")
    a = ap.parse_args()

    table_path = Path(a.table).resolve()
    table = json.loads(table_path.read_text(encoding="utf-8"))
    src = Path(a.source) if a.source else Path(table["source"])
    if not src.is_absolute():
        src = (table_path.parent / src).resolve()
    if not src.exists():
        sys.exit("源片不存在：%s" % src)

    cap = cv2.VideoCapture(str(src))
    if not cap.isOpened():
        sys.exit("打不开源片：%s" % src)
    fps = cap.get(cv2.CAP_PROP_FPS)
    n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    w, h = int(cap.get(3)), int(cap.get(4))
    outdir = Path(a.outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    recs = []
    for seg in table["segments"]:
        sid = seg["id"]
        f_first = max(0, int(round(seg["start"] * fps)) + a.pad)
        f_last = min(n - 1, int(round(seg["end"] * fps)) - 1 - a.pad)
        if f_last <= f_first:
            print("[%s] 段太短，跳过（%d→%d 帧）" % (sid, f_first, f_last))
            continue
        rec = {"id": sid, "fps": round(fps, 2), "size": "%dx%d" % (w, h)}
        for tag, fno in (("first", f_first), ("last", f_last)):
            cap.set(cv2.CAP_PROP_POS_FRAMES, fno)
            ok, frame = cap.read()
            if not ok:
                print("[%s] 取 %s 帧失败" % (sid, tag))
                continue
            p = outdir / ("%s-%s-f%d.png" % (sid, tag, fno))
            cv2.imwrite(str(p), frame)
            rec[tag] = {"frame": fno, "t": round(fno / fps, 3), "file": str(p.name)}
        rec["dur"] = round((f_last - f_first) / fps, 3)
        recs.append(rec)
        print("[%s] %.2f–%.2fs 首 f%d 尾 f%d 时长 %.2fs"
              % (sid, rec["first"]["t"], rec["last"]["t"] if "last" in rec else -1,
                 rec["first"]["frame"], rec.get("last", {}).get("frame", -1), rec["dur"]))
    cap.release()
    (outdir / "keys.json").write_text(
        json.dumps({"source": str(src), "items": recs}, ensure_ascii=False, indent=2),
        encoding="utf-8")
    print("写出 %d 段 -> %s" % (len(recs), outdir))


if __name__ == "__main__":
    main()
