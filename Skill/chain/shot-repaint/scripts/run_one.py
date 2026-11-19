# -*- coding: utf-8 -*-
"""单条首帧 i2v：上传首帧 → 提交 → 轮询 → 下载 → 打印消耗。

用法:
  python run_one.py --image 首帧.png --prompt 提示词.txt --out 输出.mp4 \
      [--mp 0.92] [--dur 5] [--tag 名字]

说明:
  - 通道固定为首帧 i2v（140 是首帧位，231 是多参参考位，喂首帧无效）。
  - 首帧图与提示词都是整份直送，脚本不改写内容。
  - 不写账本；要记账用 ledger.py add。
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.stdout.reconfigure(encoding="utf-8")

import rh_api  # noqa: E402
from credential import load_key  # noqa: E402

APP = "2113790012012720129"
HOST = "https://www.runninghub.cn"
UPLOAD = HOST + "/task/openapi/upload"


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
    ap.add_argument("--image", required=True, help="首帧图路径")
    ap.add_argument("--prompt", required=True, help="提示词文本文件")
    ap.add_argument("--out", required=True, help="输出 mp4 路径")
    ap.add_argument("--mp", default="0.92", help="megapixels：0.6 便宜／0.92 对齐 720p")
    ap.add_argument("--dur", default="5", help="秒数；该通道是浮点，可写任意值")
    ap.add_argument("--tag", default=None, help="消耗记录标签，默认取输出文件名")
    a = ap.parse_args()

    img = Path(a.image).resolve()
    prm = Path(a.prompt).resolve()
    out = Path(a.out).resolve()
    if not img.exists():
        sys.exit("首帧不存在：%s" % img)
    if not prm.exists():
        sys.exit("提示词不存在：%s" % prm)
    prompt = prm.read_text(encoding="utf-8").strip()
    out.parent.mkdir(parents=True, exist_ok=True)
    out.with_suffix(".prompt.txt").write_text(prompt, encoding="utf-8")

    tag = a.tag or out.stem
    key = load_key()
    before = rh_api.account_status(key)
    fname = upload(key, img)
    print("[%s] 上传 %s  余额 %.2f" % (tag, fname, before or -1), flush=True)

    nodes = [
        {"nodeId": "140", "fieldName": "image", "fieldValue": fname},
        {"nodeId": "115", "fieldName": "aspect_ratio", "fieldValue": "16:9 (Widescreen)"},
        {"nodeId": "115", "fieldName": "megapixels", "fieldValue": a.mp},
        {"nodeId": "133", "fieldName": "value", "fieldValue": a.dur},
        {"nodeId": "142", "fieldName": "value", "fieldValue": prompt},
    ]
    tid = rh_api.submit(key, APP, nodes)
    print("[%s] TASK %s" % (tag, tid), flush=True)
    final = rh_api.poll(key, tid)
    arts = rh_api.artifacts(final)
    if not arts:
        sys.exit("[%s] 无产物：%s" % (tag, str(final)[:300]))
    rh_api.download(arts[0][0], str(out))
    after = rh_api.account_status(key)
    charged = rh_api.cost(final)
    rec = {"tag": tag, "task_id": tid, "mp": a.mp, "dur": a.dur,
           "image": str(img), "prompt": str(prm), "charged": charged,
           "bal_before": before, "bal_after": after, "file": str(out)}
    out.with_suffix(".run.json").write_text(
        json.dumps(rec, ensure_ascii=False, indent=2), encoding="utf-8")
    print("[%s] 完成 charged=%s 余额 %.2f -> %.2f"
          % (tag, charged, before or -1, after or -1), flush=True)


if __name__ == "__main__":
    main()
