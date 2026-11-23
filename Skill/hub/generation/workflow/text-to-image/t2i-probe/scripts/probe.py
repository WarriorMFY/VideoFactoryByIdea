"""t2i-probe 单次实跑：一段提示词 + 档位 -> 一张 png + 一条账。

    python probe.py --id P1-地形 --group P1 --prompt-file <txt> \
        --ar 16:9 --res 1k --out Log/Circle28/t2i

不自己发 HTTP：一律转发给 ../runninghub/scripts/runninghub_app.py（全库唯一网络出口）。
无锚图：通道只有 18:prompt / 18:aspectRatio / 18:resolution 三个节点，无图输入。
"""
import argparse
import hashlib
import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
WEBAPP = "2046794551444119554"  # 全能图片G-2.0-文生图-低价渠道版，本技能写死


def find_app() -> Path:
    """到仓库根去找唯一网络出口；技能被移动也不失效。"""
    rel = Path("Skill") / "hub" / "generation" / "runninghub" / "scripts" / "runninghub_app.py"
    for base in [HERE] + list(HERE.parents):
        cand = base / rel
        if cand.exists():
            return cand
    raise SystemExit(f"找不到 {rel}：请在仓库内的路径下运行")


APP = find_app()


def api_env() -> dict:
    """凭据唯一源在 runninghub/credential.txt；只注入子进程环境，不上命令行。

    同时强制子进程 UTF-8：runninghub_app.py 内部用 subprocess 调 curl，
    Windows 默认 GBK 解码 UTF-8 响应会崩（实测 2026-11-23）。
    """
    env = os.environ.copy()
    env["PYTHONUTF8"] = "1"
    env["PYTHONIOENCODING"] = "utf-8"
    if env.get("RUNNINGHUB_API_KEY", "").strip():
        return env
    sys.path.insert(0, str(APP.parent))
    import rh_credential  # noqa: E402
    env["RUNNINGHUB_API_KEY"] = rh_credential.load_key()
    return env


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--id", required=True, help="本条的 id，如 P1-地形")
    ap.add_argument("--group", default="", help="矩阵组号，如 P1")
    ap.add_argument("--prompt", default=None)
    ap.add_argument("--prompt-file", default=None)
    ap.add_argument("--ar", default="16:9", help="短形式即可，如 16:9 / 3:4")
    ap.add_argument("--res", default="1k", choices=["1k", "2k", "4k"], help="分辨率档")
    ap.add_argument("--out", required=True, help="产物根目录，产物落 <out>/runs/<id>/")
    ap.add_argument("--note", default="")
    ap.add_argument("--extra", action="append", default=[], metavar="k=v",
                    help="附加字段，如 --extra hypothesis=H1")
    ap.add_argument("--dry-run", action="store_true", help="只写记录不发任务")
    ap.add_argument("--force", action="store_true", help="同 id 目录已存在时允许覆盖（默认拒绝）")
    a = ap.parse_args()

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

    # 铁律 2：组内档位必须一致（无锚，锁的是比例+分辨率）
    params = {"aspect_ratio": a.ar, "resolution": a.res}
    key = (a.ar, a.res)
    ledger_path = out / "experiments.jsonl"
    if ledger_path.exists():
        for line in ledger_path.read_text(encoding="utf-8").splitlines():
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            if rec.get("group") == a.group and rec.get("params"):
                p = rec["params"]
                other = (p.get("aspect_ratio"), p.get("resolution"))
                if other != key:
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
            "--node", f"18:prompt={prompt}",
            "--node", f"18:aspectRatio={a.ar}",
            "--node", f"18:resolution={a.res}",
            "-o", str(run_dir / "out.png"),
        ]
        print(f"[probe] 提交 {a.id}（{a.group}）{a.ar} {a.res}", flush=True)
        tail = []
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                text=True, encoding="utf-8", errors="replace", bufsize=1,
                                env=api_env())
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
