"""H2／H3 一次验证：首帧锚能不能守住画风，首帧是否被复制。

输入一张静帧 + 一条改内容的提示词，走首帧通道出 5s 片，然后量三个数：
  F0_VS_IN   产物首帧 对 输入首帧（灰度全局 NCC）——H3 用
  FN_VS_IN   产物末帧 对 输入首帧——段内漂移
  F0_VS_FN   产物首末帧——片内自身变化幅度

用法：
  python Log/Circle15/i2v-anchor/test_anchor.py --image <png> --prompt <txt> --tag a1
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SKILL = ROOT / "Skill" / "card-experiment-chain-v2" / "scripts"
sys.path.insert(0, str(SKILL))

import cv2  # noqa: E402
import numpy as np  # noqa: E402
import rh_api  # noqa: E402
from credential import load_key  # noqa: E402

APP = "2113790012012720129"
HOST = "https://www.runninghub.cn"
UPLOAD = HOST + "/task/openapi/upload"


def upload(key, path):
    cmd = ["curl", "-s", "-S", "--fail-with-body", "-X", "POST", UPLOAD,
           "--max-time", "120",
           "-F", "apiKey=" + key,
           "-F", "fileType=input",
           "-F", "file=@" + str(path)]
    r = subprocess.run(cmd, capture_output=True, text=True)
    d = json.loads(r.stdout)
    if d.get("code") != 0 or not (d.get("data") or {}).get("fileName"):
        sys.exit("上传失败：%s" % r.stdout[:300])
    return d["data"]["fileName"]


def ncc(a, b, size=512):
    ia = cv2.imread(str(a), cv2.IMREAD_GRAYSCALE)
    ib = cv2.imread(str(b), cv2.IMREAD_GRAYSCALE)
    if ia is None or ib is None:
        return None
    ia = cv2.resize(ia, (size, size)).astype(np.float32)
    ib = cv2.resize(ib, (size, size)).astype(np.float32)
    ia -= ia.mean()
    ib -= ib.mean()
    den = float(np.sqrt((ia * ia).sum() * (ib * ib).sum()))
    return None if den == 0 else float((ia * ib).sum() / den)


def frames(video, outdir):
    cap = cv2.VideoCapture(str(video))
    n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
    ok, f0 = cap.read()
    cap.set(cv2.CAP_PROP_POS_FRAMES, max(n - 1, 0))
    ok2, fn = cap.read()
    cap.release()
    if not ok or not ok2:
        sys.exit("读不出帧")
    p0 = Path(outdir) / "f0.png"
    pn = Path(outdir) / "fn.png"
    cv2.imwrite(str(p0), f0)
    cv2.imwrite(str(pn), fn)
    return n, p0, pn


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--image", required=True)
    ap.add_argument("--prompt", required=True)
    ap.add_argument("--tag", required=True)
    ap.add_argument("--dur", default="5")
    ap.add_argument("--ratio", default="16:9 (Widescreen)")
    a = ap.parse_args()

    key = load_key()
    out = Path(__file__).resolve().parent / "output"
    out.mkdir(parents=True, exist_ok=True)
    img = Path(a.image).resolve()
    prompt = Path(a.prompt).read_text(encoding="utf-8").strip()
    (out / (a.tag + ".prompt.txt")).write_text(prompt, encoding="utf-8")

    before = rh_api.account_status(key)
    print("BAL_BEFORE", before, flush=True)
    fname = upload(key, img)
    print("UPLOADED", fname, flush=True)

    nodes = [
        {"nodeId": "140", "fieldName": "image", "fieldValue": fname},
        {"nodeId": "115", "fieldName": "aspect_ratio", "fieldValue": a.ratio},
        {"nodeId": "115", "fieldName": "megapixels", "fieldValue": "0.6"},
        {"nodeId": "133", "fieldName": "value", "fieldValue": a.dur},
        {"nodeId": "142", "fieldName": "value", "fieldValue": prompt},
    ]
    tid = rh_api.submit(key, APP, nodes)
    final = rh_api.poll(key, tid)
    arts = rh_api.artifacts(final)
    if not arts:
        sys.exit("无产物：%s" % str(final)[:300])
    url = arts[0][0]
    video = out / (a.tag + ".mp4")
    rh_api.download(url, str(video))
    after = rh_api.account_status(key)
    charged = rh_api.cost(final)
    print("CHARGED", charged, "| BAL_AFTER", after, "| DIFF",
          None if None in (before, after) else round(before - after, 2), flush=True)

    n, p0, pn = frames(video, out)
    r = {
        "tag": a.tag,
        "task_id": tid,
        "frames": n,
        "charged": charged,
        "F0_VS_IN": round(ncc(img, p0) or 0, 4),
        "FN_VS_IN": round(ncc(img, pn) or 0, 4),
        "F0_VS_FN": round(ncc(p0, pn) or 0, 4),
    }
    print(json.dumps(r, ensure_ascii=False), flush=True)
    (out / (a.tag + ".metrics.json")).write_text(
        json.dumps(r, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
