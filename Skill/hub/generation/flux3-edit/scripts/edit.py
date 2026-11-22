"""flux3-edit 单次实跑：一张参考图 + 一段编辑提示词 -> 一到两张 png + 一条账。

    python edit.py --id V1-五官 --group V1 --image <png> --prompt-file <txt> \
        --ar 3:4 --n 2 --out Log/Circle24

不自己发 HTTP：一律转发给 ../runninghub/scripts/runninghub_app.py（全库唯一网络出口）。
"""
import argparse
import hashlib
import json
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
WEBAPP = "2114585366186516481"  # Flux3图像编辑，本技能写死

# 节点（写死，不随实验变）
N_IMG1, N_IMG2, N_IMG3 = "30:image", "31:image", "71:image"
N_PROMPT, N_COUNT, N_AR = "36:prompt", "72:value", "34:aspect_ratio"


def find_app() -> Path:
    """到仓库根去找唯一网络出口；技能被移动也不失效。"""
    rel = Path("Skill") / "hub" / "generation" / "runninghub" / "scripts" / "runninghub_app.py"
    for base in [HERE] + list(HERE.parents):
        cand = base / rel
        if cand.exists():
            return cand
    raise SystemExit(f"找不到 {rel}：请在仓库内的路径下运行")


APP = find_app()

AR_ALIAS = {
    "1:1": "1:1 (Square)", "2:3": "2:3 (Portrait Photo)", "3:2": "3:2 (Photo)",
    "3:4": "3:4 (Portrait Standard)", "4:3": "4:3 (Standard)",
    "9:16": "9:16 (Portrait Widescreen)", "16:9": "16:9 (Widescreen)",
    "21:9": "21:9 (Ultrawide)",
}


def sha1_file(p: Path) -> str:
    h = hashlib.sha1()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--id", required=True, help="本条的 id，如 V1-五官")
    ap.add_argument("--group", default="", help="矩阵组号，如 V1")
    ap.add_argument("--image", required=True, help="图1（锚，本组内必须固定）")
    ap.add_argument("--image2", default=None, help="图2（选填；开了就不是单变量实验）")
    ap.add_argument("--image3", default=None, help="图3（选填）")
    ap.add_argument("--prompt", default=None)
    ap.add_argument("--prompt-file", default=None)
    ap.add_argument("--ar", default="3:4", help="可写短形式 3:4 或通道全名 3:4 (Portrait Standard)")
    ap.add_argument("--n", type=int, default=2, help="生图数量（工作流默认 2；1 是否生效待验）")
    ap.add_argument("--out", required=True, help="产物根目录，产物落 <out>/runs/<id>/")
    ap.add_argument("--note", default="")
    ap.add_argument("--extra", action="append", default=[], metavar="k=v")
    ap.add_argument("--dry-run", action="store_true", help="只写记录不发任务")
    ap.add_argument("--force", action="store_true", help="同 id 目录已存在时允许覆盖（默认拒绝）")
    a = ap.parse_args()
    a.ar = AR_ALIAS.get(a.ar.strip(), a.ar.strip())

    if a.prompt_file:
        prompt = Path(a.prompt_file).read_text(encoding="utf-8").strip()
    elif a.prompt:
        prompt = a.prompt.strip()
    else:
        print("需要 --prompt 或 --prompt-file", file=sys.stderr)
        return 2
    if not prompt:
        print("提示词为空", file=sys.stderr)
        return 2

    ref = Path(a.image).resolve()
    if not ref.exists():
        print(f"图1 不存在: {ref}", file=sys.stderr)
        return 2

    out = Path(a.out).resolve()
    run_dir = out / "runs" / a.id
    # 同 id 重跑会静默覆盖上一条的 ref/prompt/out，而 jsonl 会留下两行同 id。
    if run_dir.exists() and any(run_dir.iterdir()) and not a.force:
        print(f"[edit] 目录已存在，拒绝覆盖：{run_dir}\n"
              f"       换一个 id，或加 --force 明确覆盖。", file=sys.stderr)
        return 3
    run_dir.mkdir(parents=True, exist_ok=True)

    anchor = run_dir / "ref.png"
    anchor.write_bytes(ref.read_bytes())
    (run_dir / "prompt.txt").write_text(prompt + "\n", encoding="utf-8")
    ref_sha1 = sha1_file(anchor)

    # 铁律 2：同组锚必须逐字节一致
    group_refs = set()
    ledger_path = out / "experiments.jsonl"
    if ledger_path.exists():
        for line in ledger_path.read_text(encoding="utf-8").splitlines():
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            if rec.get("group") == a.group and rec.get("ref_sha1"):
                group_refs.add(rec["ref_sha1"])
    if group_refs and ref_sha1 not in group_refs:
        print(f"[警告] 组 {a.group} 已有锚 {sorted(s[:8] for s in group_refs)}，本条锚不同——跨锚不可比",
              file=sys.stderr)

    params = {"n": a.n, "aspect_ratio": a.ar}
    record = {
        "id": a.id,
        "group": a.group,
        "ts": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "webapp": WEBAPP,
        "params": params,
        "prompt": prompt,
        "prompt_sha1": hashlib.sha1(prompt.encode("utf-8")).hexdigest(),
        "ref": str(anchor),
        "ref_sha1": ref_sha1,
        "task_id": None,
        "charged": None,
        "files": [],
        "per_image": None,
        "status": "dry" if a.dry_run else "running",
        "note": a.note,
    }
    for kv in a.extra:
        k, _, v = kv.partition("=")
        if k:
            record[k] = v

    if not a.dry_run:
        cmd = [
            sys.executable, str(APP),
            "--run", WEBAPP,
            "--node", f"{N_PROMPT}={prompt}",
            "--node", f"{N_COUNT}={a.n}",
            "--node", f"{N_AR}={a.ar}",
            "--file", f"{N_IMG1}={anchor}",
            "-o", str(run_dir / "out.png"),
        ]
        if a.image2:
            cmd += ["--file", f"{N_IMG2}={Path(a.image2).resolve()}"]
        if a.image3:
            cmd += ["--file", f"{N_IMG3}={Path(a.image3).resolve()}"]
        print(f"[edit] 提交 {a.id}（{a.group}）n={a.n} {a.ar}", flush=True)
        tail = []
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                text=True, encoding="utf-8", errors="replace", bufsize=1)
        for line in proc.stdout:
            line = line.rstrip()
            print("  " + line, flush=True)
            tail.append(line)
            if line.startswith("TASK_ID:"):
                record["task_id"] = line.split(":", 1)[1].strip()
            elif line.startswith("OUTPUT_FILE:"):
                record["files"].append(line.split(":", 1)[1].strip())
            elif line.startswith("COST:"):
                m = re.search(r"(\d+(?:\.\d+)?)", line)
                if m:
                    record["charged"] = float(m.group(1))
            elif line.startswith("DURATION:"):
                record["wall"] = line.split(":", 1)[1].strip()
        code = proc.wait()
        record["files"] = [f for f in record["files"] if Path(f).exists()]
        record["status"] = "ok" if (code == 0 and record["files"]) else "failed"
        if record["charged"] is not None and record["files"]:
            record["per_image"] = round(record["charged"] / len(record["files"]), 2)
        if record["status"] != "ok":
            record["error"] = "\n".join(tail[-15:])
        if len(record["files"]) != a.n:
            print(f"[edit] 注意：请求 n={a.n}，实际出 {len(record['files'])} 张"
                  f"（72:value 是否生效待验）", file=sys.stderr)

    (run_dir / "run.json").write_text(
        json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
    with open(ledger_path, "a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")

    print(f"\n[edit] {record['status']} task={record['task_id']} charged={record['charged']} "
          f"files={len(record['files'])} -> {run_dir}")
    if record["status"] == "ok":
        print(f"[edit] 下一步：python {HERE / 'measure.py'} --run {run_dir}")
    return 0 if record["status"] in ("ok", "dry") else 1


if __name__ == "__main__":
    sys.exit(main())
