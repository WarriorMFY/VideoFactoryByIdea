"""t2v-probe 单次实跑：一段提示词 + 档位 -> 一条 mp4 + 一条账。

    python probe.py --id T1-推镜 --group T1 --prompt-file <txt> \
        --dur 5 --res 480p --ar 16:9 --out Log/Circle28/t2v

不自己发 HTTP：一律转发给 ../runninghub/scripts/runninghub_app.py（全库唯一网络出口）。
无首帧锚：t2v 通道不吃图位（231-239 是 9 个多参参考位，本技能不传，一传就串味）。
"""
import argparse
import hashlib
import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
WEBAPP = "2085304953094107137"  # 加速版-MiniMax H3，本技能写死

RES_MAP = {"480p": "1", "720p": "2"}

AR_ALIAS = {
    "1:1": "1:1 (Square)", "2:3": "2:3 (Portrait Photo)", "3:2": "3:2 (Photo)",
    "3:4": "3:4 (Portrait Standard)", "4:3": "4:3 (Standard)",
    "9:16": "9:16 (Portrait Widescreen)", "16:9": "16:9 (Widescreen)",
    "21:9": "21:9 (Ultrawide)",
}


def find_app() -> Path:
    """到仓库根去找唯一网络出口；技能被移动也不失效。"""
    rel = Path("Skill") / "hub" / "generation" / "runninghub" / "scripts" / "runninghub_app.py"
    for base in [HERE] + list(HERE.parents):
        cand = base / rel
        if cand.exists():
            return cand
    raise SystemExit(f"找不到 {rel}：请在仓库内的路径下运行")


APP = find_app()


def dur_to_index(sec: float) -> str:
    """205:select 是索引不是秒值：1=5s … 11=15s，每秒一档。"""
    idx = int(round(sec)) - 4
    if not 1 <= idx <= 11:
        raise SystemExit(
            f"不支持时长 {sec}s：通道只有 5-15s（205:select 1-11，每秒一档）。"
            f"要更短先用 i2v 首帧通道（133:value 是浮点秒）。")
    return str(idx)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--id", required=True, help="本条的 id，如 T1-推镜")
    ap.add_argument("--group", default="", help="矩阵组号，如 T1")
    ap.add_argument("--prompt", default=None)
    ap.add_argument("--prompt-file", default=None)
    ap.add_argument("--dur", type=float, default=5.0, help="秒；只支持 5-15 整秒档")
    ap.add_argument("--res", default="480p", choices=sorted(RES_MAP), help="480p 或 720p")
    ap.add_argument("--ar", default="16:9", help="可写短形式 16:9 或通道全名")
    ap.add_argument("--out", required=True, help="产物根目录，产物落 <out>/runs/<id>/")
    ap.add_argument("--note", default="")
    ap.add_argument("--extra", action="append", default=[], metavar="k=v",
                    help="附加字段，如 --extra hypothesis=H1")
    ap.add_argument("--dry-run", action="store_true", help="只写记录不发任务")
    ap.add_argument("--force", action="store_true", help="同 id 目录已存在时允许覆盖（默认拒绝）")
    a = ap.parse_args()
    a.ar = AR_ALIAS.get(a.ar.strip(), a.ar.strip())
    dur_index = dur_to_index(a.dur)

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

    out = Path(a.out).resolve()
    run_dir = out / "runs" / a.id
    if run_dir.exists() and any(run_dir.iterdir()) and not a.force:
        print(f"[probe] 目录已存在，拒绝覆盖：{run_dir}\n"
              f"        换一个 id，或加 --force 明确覆盖。", file=sys.stderr)
        return 3
    run_dir.mkdir(parents=True, exist_ok=True)

    (run_dir / "prompt.txt").write_text(prompt + "\n", encoding="utf-8")

    # 铁律 2：组内档位必须一致（无锚，锁的是档位三元组）
    params = {"dur": a.dur, "dur_index": dur_index, "res": a.res, "aspect_ratio": a.ar}
    key = (a.dur, a.res, a.ar)
    ledger_path = out / "experiments.jsonl"
    if ledger_path.exists():
        for line in ledger_path.read_text(encoding="utf-8").splitlines():
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            if rec.get("group") == a.group and rec.get("params"):
                p = rec["params"]
                other = (p.get("dur"), p.get("res"), p.get("aspect_ratio"))
                if rec.get("group") and other != key:
                    print(f"[警告] 组 {a.group} 已有档位 {other}，本条 {key}——跨档不可比",
                          file=sys.stderr)
                    break

    record = {
        "id": a.id,
        "group": a.group,
        "ts": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "webapp": WEBAPP,
        "params": params,
        "prompt": prompt,
        "prompt_sha1": hashlib.sha1(prompt.encode("utf-8")).hexdigest(),
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
            "--node", f"250:prompt={prompt}",
            "--node", f"205:select={dur_index}",
            "--node", f"225:select={RES_MAP[a.res]}",
            "--node", f"115:aspect_ratio={a.ar}",
            "-o", str(run_dir / "out.mp4"),
        ]
        print(f"[probe] 提交 {a.id}（{a.group}）dur={a.dur}s(idx={dur_index}) {a.res} {a.ar}", flush=True)
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
        print(f"[probe] 下一步：python {HERE / 'measure.py'} --run {run_dir}")
    return 0 if record["status"] in ("ok", "dry") else 1


if __name__ == "__main__":
    sys.exit(main())
