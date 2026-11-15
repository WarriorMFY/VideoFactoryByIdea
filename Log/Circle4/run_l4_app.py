"""L4 送验：走 AI 应用（webappId）通道，最低档 480P / 5s / 16:9。

为什么走 AI 应用而不是标准模型 API：当前 Key 是 NORMAL 类型，标准模型 API 一律返回
1014（Enterprise-Shared API Key only），历史上六个视频 SKU 全部撞墙，与余额、参数无关。

逐字链（沿用 Circle3 教训）：
  1. 不截断：读 prompt-l4.txt 第二行（整段）。
  2. 内存自检：写进 nodeInfoList 的 fieldValue 必须与文件内容完全相等。
  3. 只提交、不二次加工：除 prompt 与三个开关，不改任何节点。

用法：python Log/Circle4/run_l4_app.py
"""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "Skill" / "RHclaw" / "runninghub" / "scripts"
sys.path.insert(0, str(SCRIPTS))

import runninghub_app as app  # noqa: E402
from runninghub import require_api_key, poll_task  # noqa: E402

PROMPT = ROOT / "Log" / "Circle4" / "prompt-l4.txt"
WEBAPP = "2085304953094107137"          # 加速版-MiniMax H3｜多参图像音频生视频（文生视频）
OUT = ROOT / "Log" / "Circle4" / "output" / "l4-app-480p-5s.mp4"

# 节点：250 提示词 / 115 比例 / 225 分辨率开关 / 205 时长开关
NODES = {
    ("115", "aspect_ratio"): "16:9 (Widescreen)",
    ("225", "select"): "1",             # input1 = 480P（input2 = 720P）
    ("205", "select"): "1",             # input1 = 5s（input10/11 = 14/15s）
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--prompt", default=str(PROMPT))
    ap.add_argument("--out", default=str(OUT))
    ap.add_argument("--raw", action="store_true",
                    help="整份文件原文即 prompt（不取第二行），用于直接发送原卡片")
    ap.add_argument("--append", default="",
                    help="在 prompt 末尾空一行后追加一段（负向要求等）；空则不追加")
    a = ap.parse_args()

    raw_text = Path(a.prompt).read_text(encoding="utf-8")
    text = raw_text.strip() if a.raw else raw_text.splitlines()[1]
    if a.append:
        text = text + "\n\n" + a.append.strip()
    assert text and len(text) > 100, "L4 段为空或被截断"

    snap = Path(str(a.out) + ".prompt.txt")
    snap.parent.mkdir(parents=True, exist_ok=True)
    snap.write_text(text, encoding="utf-8")
    assert snap.read_text(encoding="utf-8") == text, "快照与待发文本不一致"
    print("PROMPT_FILE", a.prompt)
    print("PROMPT_LEN", len(text))
    print("SNAPSHOT_OK True")

    api_key = require_api_key(None)
    node_list = app.get_node_info(api_key, WEBAPP)

    for n in node_list:
        key = (n["nodeId"], n["fieldName"])
        if key in NODES:
            n["fieldValue"] = NODES[key]

    target = next(n for n in node_list
                  if n["nodeId"] == "250" and n["fieldName"] == "prompt")
    target["fieldValue"] = text

    # 内存自检：请求体里的 prompt 与文件逐字相等
    assert target["fieldValue"] == text
    body = json.loads(json.dumps({"nodeInfoList": node_list}, ensure_ascii=False))
    sent = next(n["fieldValue"] for n in body["nodeInfoList"]
                if n["nodeId"] == "250" and n["fieldName"] == "prompt")
    assert sent == text, "序列化后 prompt 与原文不一致"
    print("VERBATIM_OK True")

    data = app.submit_task(api_key, WEBAPP, node_list, "default")
    task_id = str(data["taskId"])
    final = poll_task(api_key, task_id)

    usage = final.get("usage") or {}
    results = final.get("results") or []
    urls = [(r.get("url") or r.get("outputUrl"), r.get("outputType", ""))
            for r in results]
    urls = [(u, e) for u, e in urls if u]
    print("TASK_ID", task_id)
    print("USAGE", json.dumps(usage, ensure_ascii=False))
    if not urls:
        print(json.dumps({"error": "NO_RESULT", "detail": final}, ensure_ascii=False))
        return 1

    url, ext = urls[0]
    out_path = Path(a.out).with_suffix("." + (ext or "mp4"))
    full = app.download_file(url, str(out_path))
    app.fix_mov_to_mp4(full)
    print("OUTPUT_FILE", full)
    return 0


if __name__ == "__main__":
    sys.exit(main())
