"""按段表批量走首帧通道：上传首帧 → 提交 5s → 轮询 → 下载 → 记账。

用法: python gen.py [s1 s2 s3]
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SKILL = ROOT / "Skill" / "card-experiment-chain-v2" / "scripts"
sys.path.insert(0, str(SKILL))
sys.stdout.reconfigure(encoding="utf-8")

import rh_api  # noqa: E402
from credential import load_key  # noqa: E402

APP = "2113790012012720129"
HOST = "https://www.runninghub.cn"
UPLOAD = HOST + "/task/openapi/upload"
HERE = Path(__file__).resolve().parent
SEGS = {
    "s1": ("keys/S1-first-f0.png", "prompts/s1.txt", "4.4"),
    "s2": ("keys/S2-first-f132.png", "prompts/s2.txt", "4.0"),
    "s3": ("keys/S3-first-f252.png", "prompts/s3.txt", "1.6"),
}


def upload(key, path):
    r = subprocess.run(["curl", "-s", "-S", "--fail-with-body", "-X", "POST", UPLOAD,
                        "--max-time", "120", "-F", "apiKey=" + key,
                        "-F", "fileType=input", "-F", "file=@" + str(path)],
                       capture_output=True, text=True)
    d = json.loads(r.stdout)
    if d.get("code") != 0 or not (d.get("data") or {}).get("fileName"):
        sys.exit("上传失败：%s" % r.stdout[:300])
    return d["data"]["fileName"]


def run(tag):
    img_rel, prm_rel, trim = SEGS[tag]
    img = HERE / img_rel
    prompt = (HERE / prm_rel).read_text(encoding="utf-8").strip()
    out_dir = HERE / "out"
    out_dir.mkdir(exist_ok=True)
    (out_dir / (tag + ".prompt.txt")).write_text(prompt, encoding="utf-8")

    key = load_key()
    before = rh_api.account_status(key)
    fname = upload(key, img)
    print("[%s] 上传 %s  余额 %.2f" % (tag, fname, before or -1), flush=True)

    nodes = [
        {"nodeId": "140", "fieldName": "image", "fieldValue": fname},
        {"nodeId": "115", "fieldName": "aspect_ratio", "fieldValue": "16:9 (Widescreen)"},
        {"nodeId": "115", "fieldName": "megapixels", "fieldValue": "0.92"},
        {"nodeId": "133", "fieldName": "value", "fieldValue": "5"},
        {"nodeId": "142", "fieldName": "value", "fieldValue": prompt},
    ]
    tid = rh_api.submit(key, APP, nodes)
    print("[%s] TASK %s" % (tag, tid), flush=True)
    final = rh_api.poll(key, tid)
    arts = rh_api.artifacts(final)
    if not arts:
        sys.exit("[%s] 无产物：%s" % (tag, str(final)[:300]))
    mp4 = out_dir / (tag + ".mp4")
    rh_api.download(arts[0][0], str(mp4))
    after = rh_api.account_status(key)
    charged = rh_api.cost(final)
    rec = {"tag": tag, "task_id": tid, "trim_to": trim, "prompt": prm_rel,
           "image": img_rel, "charged": charged, "bal_before": before, "bal_after": after,
           "file": str(mp4.relative_to(HERE))}
    (out_dir / (tag + ".run.json")).write_text(
        json.dumps(rec, ensure_ascii=False, indent=2), encoding="utf-8")
    print("[%s] 完成 charged=%s 余额 %.2f -> %.2f" % (tag, charged, before or -1, after or -1),
          flush=True)
    return rec


if __name__ == "__main__":
    tags = sys.argv[1:] or ["s1", "s2", "s3"]
    done = []
    for t in tags:
        done.append(run(t))
    (HERE / "out" / "runs.json").write_text(
        json.dumps(done, ensure_ascii=False, indent=2), encoding="utf-8")
    print("SUMMARY", json.dumps([(d["tag"], d["charged"]) for d in done], ensure_ascii=False))
