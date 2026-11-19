"""i2v-probe 单次实跑：一张首帧 + 一段提示词 -> 一条 mp4 + 一条账。

    python probe.py --id M1-大动 --group M1 --frame <png> --prompt-file <txt> \
        --dur 5 --ar 3:4 --mp 0.6 --out Log/Circle20/probe

不自己发 HTTP：一律转发给 ../runninghub/scripts/runninghub_app.py（全库唯一网络出口）。
"""
import argparse
import hashlib
import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
WEBAPP = "2113790012012720129"  # 首帧图生视频，本技能写死


def find_app() -> Path:
    """到仓库根去找唯一网络出口；技能被移动也不失效。"""
    rel = Path("Skill") / "hub" / "generation" / "runninghub" / "scripts" / "runninghub_app.py"
    for base in [HERE] + list(HERE.parents):
        cand = base / rel
        if cand.exists():
            return cand
    raise SystemExit(f"找不到 {rel}：请在仓库内的路径下运行")


APP = find_app()


def sha1_file(p: Path) -> str:
    h = hashlib.sha1()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


AR_ALIAS = {
    "1:1": "1:1 (Square)", "2:3": "2:3 (Portrait Photo)", "3:2": "3:2 (Photo)",
    "3:4": "3:4 (Portrait Standard)", "4:3": "4:3 (Standard)",
    "9:16": "9:16 (Portrait Widescreen)", "16:9": "16:9 (Widescreen)",
    "21:9": "21:9 (Ultrawide)",
}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--id", required=True, help="本条的 id，如 M1-大动")
    ap.add_argument("--group", default="", help="矩阵组号，如 M1")
    ap.add_argument("--frame", required=True, help="首帧图路径（本组内必须固定）")
    ap.add_argument("--prompt", default=None)
    ap.add_argument("--prompt-file", default=None)
    ap.add_argument("--dur", type=float, default=5.0)
    ap.add_argument("--ar", default="16:9", help="可写短形式 16:9 或通道全名 16:9 (Widescreen)")
    ap.add_argument("--mp", default="0.6")
    ap.add_argument("--out", required=True, help="产物根目录，产物落 <out>/runs/<id>/")
    ap.add_argument("--note", default="")
    ap.add_argument("--extra", action="append", default=[], metavar="k=v",
                    help="附加字段，如 --extra video_id=ab12cd34")
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

    frame = Path(a.frame).resolve()
    if not frame.exists():
        print(f"首帧不存在: {frame}", file=sys.stderr)
        return 2

    out = Path(a.out).resolve()
    run_dir = out / "runs" / a.id
    # 同一 id 重跑会静默覆盖上一条的 anchor/prompt/out/run.json，而 jsonl 会留下两行同 id。
    # 已有实测事故：S01-P0-01 被覆盖，第一条产物全丢。默认拒绝，要覆盖必须显式 --force。
    if run_dir.exists() and any(run_dir.iterdir()) and not a.force:
        print(f"[probe] 目录已存在，拒绝覆盖：{run_dir}\n"
              f"        换一个 id，或加 --force 明确覆盖。", file=sys.stderr)
        return 3
    run_dir.mkdir(parents=True, exist_ok=True)

    anchor = run_dir / "anchor.png"
    anchor.write_bytes(frame.read_bytes())
    (run_dir / "prompt.txt").write_text(prompt + "\n", encoding="utf-8")
    anchor_sha1 = sha1_file(anchor)

    # 铁律 2：同组锚必须逐字节一致
    group_anchors = set()
    ledger_path = out / "experiments.jsonl"
    if ledger_path.exists():
        for line in ledger_path.read_text(encoding="utf-8").splitlines():
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            if rec.get("group") == a.group and rec.get("anchor_sha1"):
                group_anchors.add(rec["anchor_sha1"])
    if group_anchors and anchor_sha1 not in group_anchors:
        print(f"[警告] 组 {a.group} 已有锚 {sorted(s[:8] for s in group_anchors)}，本条锚不同——跨锚不可比", file=sys.stderr)

    params = {"dur": a.dur, "aspect_ratio": a.ar, "megapixels": a.mp}
    record = {
        "id": a.id,
        "group": a.group,
        "ts": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "webapp": WEBAPP,
        "params": params,
        "prompt": prompt,
        "prompt_sha1": hashlib.sha1(prompt.encode("utf-8")).hexdigest(),
        "anchor": str(anchor),
        "anchor_sha1": anchor_sha1,
        "task_id": None,
        "charged": None,
        "file": None,
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
            "--node", f"142:value={prompt}",
            "--node", f"133:value={a.dur}",
            "--node", f"115:aspect_ratio={a.ar}",
            "--node", f"115:megapixels={a.mp}",
            "--file", f"140:image={anchor}",
            "-o", str(run_dir / "out.mp4"),
        ]
        print(f"[probe] 提交 {a.id}（{a.group}）dur={a.dur}s {a.ar} {a.mp}MP", flush=True)
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
                record["file"] = line.split(":", 1)[1].strip()
            elif line.startswith("COST:"):
                try:
                    record["charged"] = float(line.split("¥", 1)[1])
                except (IndexError, ValueError):
                    pass
            elif line.startswith("DURATION:"):
                record["wall"] = line.split(":", 1)[1].strip()
        code = proc.wait()
        record["status"] = "ok" if (code == 0 and record["file"]) else "failed"
        if record["status"] != "ok":
            record["error"] = "\n".join(tail[-15:])

    (run_dir / "run.json").write_text(
        json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
    with open(ledger_path, "a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")

    print(f"\n[probe] {record['status']} task={record['task_id']} charged={record['charged']} -> {run_dir}")
    if record["status"] == "ok":
        print(f"[probe] 下一步：python {HERE/'measure.py'} --run {run_dir}")
    return 0 if record["status"] in ("ok", "dry") else 1


if __name__ == "__main__":
    sys.exit(main())
