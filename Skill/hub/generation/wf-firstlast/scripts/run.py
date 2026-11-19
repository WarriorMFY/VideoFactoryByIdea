"""首尾帧自建通道 · 直跑脚本

把整份工作流图 JSON 塞进 `workflow` 字段，用占位 workflowId 通过校验，
实现「不建工作流也能跑自己的图」。

用法：
  python run.py --first A.png --last B.png --prompt "..." --out out.mp4
  python run.py --template path/to/other.json --start-node 204 --end-node 205 ...

约定（vace-firstlast-24.json）：
  首帧 = 205，尾帧 = 204（模板标题与实际连线相反，别信 title）
  提示词 = 119，帧数 = 197，宽度 = 202
"""
import argparse
import json
import os
import sys
import time
import urllib.request
import uuid

HERE = os.path.dirname(os.path.abspath(__file__))


def find_repo_root(start):
    cur = start
    for _ in range(8):
        if os.path.isdir(os.path.join(cur, "Skill", "hub", "generation", "runninghub")):
            return cur
        parent = os.path.dirname(cur)
        if parent == cur:
            break
        cur = parent
    return os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(HERE))))


ROOT = find_repo_root(HERE)
sys.path.insert(0, os.path.join(ROOT, "Skill", "hub", "generation", "runninghub", "scripts"))
import rh_credential  # noqa: E402

BASE = "https://www.runninghub.cn"
KEY = rh_credential.load_key()


def post_json(path, payload, timeout=60):
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        BASE + path, data=data,
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + KEY})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def remain_point():
    d = post_json("/uc/openapi/accountStatus", {"apikey": KEY})
    return float(d["data"]["remainPoint"])


def upload(path):
    """multipart 上传，返回 nodeInfoList 可用的 fileName（形如 api/xxx.png）。"""
    boundary = "----wf" + uuid.uuid4().hex
    name = os.path.basename(path)
    with open(path, "rb") as f:
        blob = f.read()
    parts = []
    for key, val in (("apiKey", KEY), ("fileType", "input")):
        parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{key}\"\r\n\r\n{val}\r\n")
    parts.append(
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{name}\"\r\n"
        f"Content-Type: application/octet-stream\r\n\r\n")
    body = "".join(parts).encode("utf-8") + blob + f"\r\n--{boundary}--\r\n".encode("utf-8")
    req = urllib.request.Request(
        BASE + "/task/openapi/upload", data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}",
                 "Authorization": "Bearer " + KEY})
    with urllib.request.urlopen(req, timeout=120) as r:
        d = json.loads(r.read().decode("utf-8"))
    if d.get("code") != 0:
        raise SystemExit(f"UPLOAD_FAILED: {json.dumps(d, ensure_ascii=False)[:300]}")
    return d["data"]["fileName"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--template", default=os.path.join(HERE, "..", "reference", "vace-firstlast-24.json"))
    ap.add_argument("--first", required=True)
    ap.add_argument("--last", required=True)
    ap.add_argument("--prompt", default="")
    ap.add_argument("--frames", type=int, default=49)
    ap.add_argument("--width", type=int, default=720)
    ap.add_argument("--out", required=True)
    ap.add_argument("--workflow-id", default="1904136902449209346")
    ap.add_argument("--start-node", default="205")
    ap.add_argument("--end-node", default="204")
    ap.add_argument("--prompt-node", default="119")
    ap.add_argument("--frames-node", default="197")
    ap.add_argument("--width-node", default="202")
    args = ap.parse_args()

    with open(args.template, "r", encoding="utf-8") as f:
        graph = json.load(f)

    first_name = upload(args.first)
    last_name = upload(args.last)
    print(f"uploaded first -> {first_name}\nuploaded last  -> {last_name}", file=sys.stderr)

    nodes = [
        {"nodeId": args.start_node, "fieldName": "image", "fieldValue": first_name},
        {"nodeId": args.end_node, "fieldName": "image", "fieldValue": last_name},
        {"nodeId": args.frames_node, "fieldName": "value", "fieldValue": str(args.frames)},
        {"nodeId": args.width_node, "fieldName": "value", "fieldValue": str(args.width)},
    ]
    if args.prompt:
        nodes.append({"nodeId": args.prompt_node, "fieldName": "text", "fieldValue": args.prompt})

    before = remain_point()
    print(f"remainPoint before = {before}")

    payload = {"apiKey": KEY, "workflowId": args.workflow_id,
               "workflow": json.dumps(graph, ensure_ascii=False), "nodeInfoList": nodes}
    res = post_json("/task/openapi/create", payload)
    if res.get("code") != 0:
        print(json.dumps(res, ensure_ascii=False)[:600])
        raise SystemExit("SUBMIT_FAILED")
    task_id = res["data"]["taskId"]
    print(f"taskId = {task_id}")

    t0 = time.time()
    while True:
        q = post_json("/task/openapi/outputs", {"apiKey": KEY, "taskId": task_id})
        code = q.get("code")
        if code == 0 and q.get("data"):
            url = q["data"][0].get("fileUrl")
            with urllib.request.urlopen(url, timeout=300) as r, open(args.out, "wb") as f:
                f.write(r.read())
            print(f"done in {int(time.time() - t0)}s -> {args.out} ({os.path.getsize(args.out)} bytes)")
            break
        if code == 805:
            print(json.dumps(q, ensure_ascii=False)[:600])
            raise SystemExit("TASK_FAILED")
        if time.time() - t0 > 900:
            raise SystemExit("TIMEOUT")
        time.sleep(10)

    after = remain_point()
    print(f"remainPoint after = {after} ; charged = {round(before - after, 2)}")


if __name__ == "__main__":
    main()
