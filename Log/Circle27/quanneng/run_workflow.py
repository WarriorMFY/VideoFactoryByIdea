"""Workflow API 直跑（整图 JSON 直传）· Circle27 全能图片V2 人物组重测。

    python run_workflow.py --id B-base --group B-base --var 基线 --level 保持原图 \
        --anchor Log/Circle27/runs/B-base/anchor.png \
        --prompt-file Log/Circle27/prompts/B-base.txt \
        --seed 42 --ar 3:4 --res 2k --out Log/Circle27/quanneng --budget 250

本文件是 Log 现场器材：自带网络（与 Circle21 run_workflow_direct.py 同源做法），
不 import Skill 代码，仅读 credential 文件取 Key。
"""
import argparse
import hashlib
import json
import subprocess
import sys
import time
import urllib.request
from datetime import datetime
from pathlib import Path

HOST = "https://www.runninghub.cn"
HERE = Path(__file__).resolve().parent          # Log/Circle27/quanneng
ROOT = HERE.parents[2]                          # repo root
KEYDIR = ROOT / "Skill" / "hub" / "generation" / "runninghub" / "scripts"
sys.path.insert(0, str(KEYDIR))
from rh_credential import load_key  # noqa: E402

KEY = load_key()
WF_ID = "2027204046305628162"   # 全能图片V2-图生图-官方稳定版（整图直传时作占位）


def post(path, payload, timeout=60):
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        HOST + path, data=data,
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + KEY})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def remain_point():
    d = post("/uc/openapi/accountStatus", {"apikey": KEY})
    return float(d["data"]["remainPoint"])


def upload(path: Path) -> str:
    cmd = ["curl", "-s", "-S", "--fail-with-body", "-X", "POST",
           HOST + "/task/openapi/upload",
           "--max-time", "120",
           "-H", "Host: www.runninghub.cn",
           "-F", f"apiKey={KEY}",
           "-F", "fileType=input",
           "-F", f"file=@{path}"]
    out = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    resp = json.loads(out.stdout)
    if resp.get("code") != 0 or not (resp.get("data") or {}).get("fileName"):
        raise SystemExit(f"上传失败: {out.stdout[:300]}")
    return resp["data"]["fileName"]


def sha1_text(s: str) -> str:
    return hashlib.sha1(s.encode("utf-8")).hexdigest()


def sha1_file(p: Path) -> str:
    h = hashlib.sha1()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def ledger_spent(path: Path) -> float:
    if not path.exists():
        return 0.0
    total = 0.0
    for line in path.read_text(encoding="utf-8").splitlines():
        try:
            rec = json.loads(line)
        except json.JSONDecodeError:
            continue
        v = rec.get("charged")
        if isinstance(v, (int, float)):
            total += float(v)
    return total


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--id", required=True)
    ap.add_argument("--group", default="")
    ap.add_argument("--var", default="")
    ap.add_argument("--level", default="")
    ap.add_argument("--anchor", required=True)
    ap.add_argument("--prompt-file", required=True)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--ar", default="3:4")
    ap.add_argument("--res", default="2k")
    ap.add_argument("--out", required=True, help="产物根目录（runs/<id>/ 与账本都落这里）")
    ap.add_argument("--budget", type=float, default=None)
    ap.add_argument("--est", type=float, default=25.0, help="预算闸门单条预估值")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    prompt = Path(a.prompt_file).read_text(encoding="utf-8").strip()
    if not prompt:
        return 2
    anchor_src = Path(a.anchor).resolve()
    if not anchor_src.exists():
        print(f"锚图不存在: {anchor_src}", file=sys.stderr)
        return 2

    out = Path(a.out).resolve()
    run_dir = out / "runs" / a.id
    if run_dir.exists() and any(run_dir.iterdir()) and not a.force:
        print(f"目录已存在，拒绝覆盖：{run_dir}（换 id 或 --force）", file=sys.stderr)
        return 3
    run_dir.mkdir(parents=True, exist_ok=True)
    anchor = run_dir / "anchor.png"
    anchor.write_bytes(anchor_src.read_bytes())
    (run_dir / "prompt.txt").write_text(prompt + "\n", encoding="utf-8")
    anchor_sha1 = sha1_file(anchor)

    graph = json.loads((HERE / "wf-quanneng-v2.json").read_text(encoding="utf-8"))
    ledger = out / "experiments.jsonl"
    spent = ledger_spent(ledger)
    if a.budget is not None and not a.dry_run and spent + a.est > a.budget:
        print(f"预算闸门：已花 {spent:.2f} + 预估 {a.est:.0f} > {a.budget:.0f}，拒绝提交", file=sys.stderr)
        return 4

    record = {
        "id": a.id, "group": a.group, "variable": a.var, "level": a.level,
        "ts": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "wf_id": WF_ID, "mode": "workflow-json-direct",
        "params": {"seed": a.seed, "aspectRatio": a.ar, "resolution": a.res},
        "prompt": prompt, "prompt_sha1": sha1_text(prompt),
        "anchor": str(anchor), "anchor_sha1": anchor_sha1,
        "task_id": None, "charged": None, "files": [], "status": "dry",
    }
    if a.dry_run:
        (run_dir / "run.json").write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"[dry] {a.id} graph_ok nodes={list(graph)} -> {run_dir}")
        return 0

    before = remain_point()
    print(f"余额 before = {before}")
    fname = upload(anchor)
    print(f"uploaded -> {fname}")
    nodes = [
        {"nodeId": "16", "fieldName": "prompt", "fieldValue": prompt},
        {"nodeId": "16", "fieldName": "seed", "fieldValue": str(a.seed)},
        {"nodeId": "16", "fieldName": "aspectRatio", "fieldValue": a.ar},
        {"nodeId": "16", "fieldName": "resolution", "fieldValue": a.res},
        {"nodeId": "2", "fieldName": "image", "fieldValue": fname},
    ]
    payload = {"apiKey": KEY, "workflowId": WF_ID,
               "workflow": json.dumps(graph, ensure_ascii=False), "nodeInfoList": nodes}
    print(f"[submit] {a.id}（{a.group} {a.var}={a.level}）seed={a.seed} {a.ar} {a.res}", flush=True)
    res = post("/task/openapi/create", payload)
    if res.get("code") != 0:
        print("SUBMIT_FAILED:", json.dumps(res, ensure_ascii=False)[:600])
        record["status"] = "failed"
        record["error"] = json.dumps(res, ensure_ascii=False)[:600]
        (run_dir / "run.json").write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
        with open(ledger, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
        return 1
    task_id = str(res["data"]["taskId"])
    record["task_id"] = task_id
    print(f"TASK_ID:{task_id}")

    t0 = time.time()
    status = "timeout"
    while time.time() - t0 < 900:
        q = post("/task/openapi/outputs", {"apiKey": KEY, "taskId": task_id})
        if q.get("code") == 0 and q.get("data"):
            status = "ok"
            outs = q["data"]
            for i, o in enumerate(outs):
                url = o.get("fileUrl")
                if not url:
                    continue
                fp = run_dir / ("out.png" if len(outs) == 1 else f"out_{i + 1}.png")
                with urllib.request.urlopen(url, timeout=300) as r, open(fp, "wb") as f:
                    f.write(r.read())
                record["files"].append(str(fp))
                print(f"OUTPUT_FILE:{fp}")
            break
        if q.get("code") == 805:
            status = "failed"
            record["error"] = json.dumps(q, ensure_ascii=False)[:600]
            print("805:", record["error"])
            break
        time.sleep(10)
    after = remain_point()
    record["charged"] = round(before - after, 2)
    record["wall"] = f"{int(time.time() - t0)}s"
    record["status"] = status
    print(f"余额 after = {after} ; 实扣 = {record['charged']}")
    (run_dir / "run.json").write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
    with open(ledger, "a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")
    print(f"[{status}] {a.id} -> {run_dir}")
    return 0 if status == "ok" else 1


if __name__ == "__main__":
    sys.exit(main())
