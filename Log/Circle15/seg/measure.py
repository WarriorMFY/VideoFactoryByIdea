"""段内测量 + 按原时长裁回。用法: python measure.py"""
import json
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np

sys.stdout.reconfigure(encoding="utf-8")
HERE = Path(__file__).resolve().parent
FF = (HERE.parents[2] / "Tool" / "_deps" / "imageio_ffmpeg" / "binaries" /
      "ffmpeg-win-x86_64-v9.0.2.exe")
SEGS = {"s1": ("keys/S1-first-f0.png", 4.4), "s2": ("keys/S2-first-f132.png", 4.0),
        "s3": ("keys/S3-first-f252.png", 1.6)}


def ncc(a, b, size=512):
    ia = cv2.cvtColor(cv2.resize(a, (size, size)), cv2.COLOR_BGR2GRAY).astype(np.float32)
    ib = cv2.cvtColor(cv2.resize(b, (size, size)), cv2.COLOR_BGR2GRAY).astype(np.float32)
    ia -= ia.mean(); ib -= ib.mean()
    den = float(np.sqrt((ia * ia).sum() * (ib * ib).sum()))
    return 0.0 if den == 0 else float((ia * ib).sum() / den)


def hist_corr(a, b):
    ha = cv2.calcHist([cv2.cvtColor(a, cv2.COLOR_BGR2HSV)], [0, 1], None, [18, 16], [0, 180, 0, 256])
    hb = cv2.calcHist([cv2.cvtColor(b, cv2.COLOR_BGR2HSV)], [0, 1], None, [18, 16], [0, 180, 0, 256])
    cv2.normalize(ha, ha); cv2.normalize(hb, hb)
    return float(cv2.compareHist(ha, hb, cv2.HISTCMP_CORREL))


def main():
    (HERE / "trim").mkdir(exist_ok=True)
    allm = []
    for tag, (img_rel, trim) in SEGS.items():
        mp4 = HERE / "out" / (tag + ".mp4")
        if not mp4.exists():
            print("[%s] 缺产物，跳过" % tag); continue
        src = cv2.VideoCapture(str(mp4))
        n = int(src.get(cv2.CAP_PROP_FRAME_COUNT)); fps = src.get(cv2.CAP_PROP_FPS)
        w, h = int(src.get(3)), int(src.get(4))
        frames = []
        while True:
            ok, f = src.read()
            if not ok:
                break
            frames.append(f)
        src.release()
        f0, fn = frames[0], frames[-1]
        inp = cv2.imread(str(HERE / img_rel))
        inp = cv2.resize(inp, (w, h))
        band0 = int(h * 0.82)
        sub_f0 = np.abs(f0[band0:].astype(np.float32) - inp[band0:].astype(np.float32)).mean()
        oth_f0 = np.abs(f0[:band0].astype(np.float32) - inp[:band0].astype(np.float32)).mean()
        sub_end = np.abs(fn[band0:].astype(np.float32) - f0[band0:].astype(np.float32)).mean()
        hc = [hist_corr(frames[0], f) for f in frames[::max(1, len(frames) // 12)]]
        m = {
            "tag": tag, "src": str(mp4.name), "size": "%dx%d" % (w, h),
            "frames": n, "fps": round(fps, 2), "dur": round(n / fps, 2),
            "trim_to": trim,
            "F0_VS_IN": round(ncc(f0, inp), 4),
            "FN_VS_IN": round(ncc(fn, inp), 4),
            "F0_VS_FN": round(ncc(f0, fn), 4),
            "HIST_F0_MEAN": round(float(np.mean(hc)), 4),
            "HIST_F0_MIN": round(float(np.min(hc)), 4),
            "SUB_BAND_DIFF_F0": round(float(sub_f0), 2),
            "OTHER_BAND_DIFF_F0": round(float(oth_f0), 2),
            "SUB_BAND_MOVE_F0_FN": round(float(sub_end), 2),
        }
        out = HERE / "trim" / (tag + ".mp4")
        r = subprocess.run([str(FF), "-y", "-hide_banner", "-loglevel", "error",
                            "-i", str(mp4), "-t", str(trim),
                            "-c:v", "libx264", "-crf", "16", "-preset", "medium",
                            "-pix_fmt", "yuv420p", "-an", str(out)],
                           capture_output=True, text=True)
        if r.returncode != 0:
            print("[%s] 裁剪失败 %s" % (tag, r.stderr[-200:]))
        else:
            m["trim_file"] = str(out.relative_to(HERE))
        allm.append(m)
        print(json.dumps(m, ensure_ascii=False))
    (HERE / "out" / "metrics.json").write_text(
        json.dumps(allm, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
