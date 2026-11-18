"""单条首帧 i2v：上传首帧 → 提交 → 轮询 → 下载 → 记录。

用法: python run_one.py --tag s1e --image keys/S1-first-f0.png \
        --prompt prompts/s1e.txt --mp 0.92 --trim 4.4
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "Skill" / "card-experiment-chain-v2" / "scripts"))
sys.stdout.reconfigure(encoding="utf-8")

import rh_api  # noqa: E402
from credential import load_key  # noqa: E402

APP = "2113790012012720129"
HOST = "https://www.runninghub.cn"
UPLOAD = HOST + "/task/openapi/upload"
HERE = Path(__file__).resolve().parent


def upload(key, path):
    r = subprocess.run(["curl", "-s", "-S", "--fail-with-body", "-X", "POST", UPLOAD,
                        "--max-time", "120", "-F", "apiKey=" + key,
                        "-F", "fileType=input", "-F", "file=@" + str(path)],
                       capture_output=True, text=True)
    d = json.loads(r.stdout)
    if d.get("code") != 0 or not (d.get("data") or {}).get("fileName"):
        sys.exit("上传失败：%s" % r.stdout[:300])
    return d["data"]["fileName"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tag", required=True)
    ap.add_argument("--image", required=True)
    ap.add_argument("--prompt", required=True)
    ap.add_argument("--mp", default="0.92")
    ap.add_argument("--dur", default="5")
    ap.add_argument("--trim", default=None)
    a = ap.parse_args()

    img = HERE / a.image
    prompt = (HERE / a.prompt).read_text(encoding="utf-8").strip()
    out_dir = HERE / "out"
    out_dir.mkdir(exist_ok=True)
    (out_dir / (a.tag + ".prompt.txt")).write_text(prompt, encoding="utf-8")

    key = load_key()
    before = rh_api.account_status(key)
    fname = upload(key, img)
    print("[%s] 上传 %s  余额 %.2f" % (a.tag, fname, before or -1), flush=True)

    nodes = [
        {"nodeId": "140", "fieldName": "image", "fieldValue": fname},
        {"nodeId": "115", "fieldName": "aspect_ratio", "fieldValue": "16:9 (Widescreen)"},
        {"nodeId": "115", "fieldName": "megapixels", "fieldValue": a.mp},
        {"nodeId": "133", "fieldName": "value", "fieldValue": a.dur},
        {"nodeId": "142", "fieldName": "value", "fieldValue": prompt},
    ]
    tid = rh_api.submit(key, APP, nodes)
    print("[%s] TASK %s" % (a.tag, tid), flush=True)
    final = rh_api.poll(key, tid)
    arts = rh_api.artifacts(final)
    if not arts:
        sys.exit("[%s] 无产物：%s" % (a.tag, str(final)[:300]))
    mp4 = out_dir / (a.tag + ".mp4")
    rh_api.download(arts[0][0], str(mp4))
    after = rh_api.account_status(key)
    charged = rh_api.cost(final)
    rec = {"tag": a.tag, "task_id": tid, "trim_to": a.trim, "mp": a.mp,
           "prompt": a.prompt, "image": a.image, "charged": charged,
           "bal_before": before, "bal_after": after,
           "file": str(mp4.relative_to(HERE))}
    (out_dir / (a.tag + ".run.json")).write_text(
        json.dumps(rec, ensure_ascii=False, indent=2), encoding="utf-8")
    print("[%s] 完成 charged=%s 余额 %.2f -> %.2f" % (a.tag, charged, before or -1, after or -1),
          flush=True)


if __name__ == "__main__":
    main()
