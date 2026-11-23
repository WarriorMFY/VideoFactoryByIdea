"""i2i-probe 单次实跑：一张锚图 + 一段编辑提示词 -> 一到两张 png + 一条账。

    python run.py --id A-V1-近 --group A-V1 --var 景别 --level 近景 \
        --anchor Log/Circle27/anchors/A-scene.png \
        --prompt-file Log/Circle27/prompts/A-V1-近.txt \
        --ar 16:9 --n 2 --out Log/Circle27 --budget 600

不自己发 HTTP：一律转发给 ../runninghub/scripts/runninghub_app.py（全库唯一网络出口）。
"""
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
WEBAPP = "2114585366186516481"  # Flux3图像编辑（本轮唯一图生图通道）

# 节点（写死，不随实验变）
N_ANCHOR, N_PROMPT, N_COUNT, N_AR = "30:image", "36:prompt", "72:value", "34:aspect_ratio"

AR_ALIAS = {
    "1:1": "1:1 (Square)", "2:3": "2:3 (Portrait Photo)", "3:2": "3:2 (Photo)",
    "3:4": "3:4 (Portrait Standard)", "4:3": "4:3 (Standard)",
    "9:16": "9:16 (Portrait Widescreen)", "16:9": "16:9 (Widescreen)",
    "21:9": "21:9 (Ultrawide)",
}

EST_RUN = 25.0  # 预算闸门用的单条预估（实扣 ≈20–22，留波动余量）


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
    """凭据唯一源在 runninghub/credential.txt（rh_credential）；只注入子进程环境，不上命令行。

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


def sha1_file(p: Path) -> str:
    h = hashlib.sha1()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def ledger_spent(path: Path) -> float:
    if not path.exists():
        return 0.0
    spent = 0.0
    for line in path.read_text(encoding="utf-8").splitlines():
        try:
            rec = json.loads(line)
        except json.JSONDecodeError:
            continue
        v = rec.get("charged")
        if isinstance(v, (int, float)):
            spent += float(v)
    return spent


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--id", required=True, help="本条 id，如 A-V1-近")
    ap.add_argument("--group", default="", help="矩阵组号，如 A-V1")
    ap.add_argument("--var", default="", help="实验变量，如 景别")
    ap.add_argument("--level", default="", help="档位，如 近景")
    ap.add_argument("--anchor", required=True, help="锚图（本组内必须逐字节一致）")
    ap.add_argument("--prompt", default=None)
    ap.add_argument("--prompt-file", default=None)
    ap.add_argument("--ar", default="16:9", help="短名 16:9 或通道全名")
    ap.add_argument("--n", type=int, default=2, help="生图数量（工作流默认 2；1 未验）")
    ap.add_argument("--out", required=True, help="产物根目录，产物落 <out>/runs/<id>/")
    ap.add_argument("--budget", type=float, default=None, help="积分上限；预计超出则拒绝提交")
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

    anchor_src = Path(a.anchor).resolve()
    if not anchor_src.exists():
        print(f"锚图不存在: {anchor_src}", file=sys.stderr)
        return 2

    out = Path(a.out).resolve()
    run_dir = out / "runs" / a.id
    if run_dir.exists() and any(run_dir.iterdir()) and not a.force:
        print(f"[i2i] 目录已存在，拒绝覆盖：{run_dir}\n"
              f"      换一个 id，或加 --force 明确覆盖。", file=sys.stderr)
        return 3
    run_dir.mkdir(parents=True, exist_ok=True)

    anchor = run_dir / "anchor.png"
    anchor.write_bytes(anchor_src.read_bytes())
    (run_dir / "prompt.txt").write_text(prompt + "\n", encoding="utf-8")
    anchor_sha1 = sha1_file(anchor)

    # 铁律 2：同组锚必须逐字节一致
    ledger_path = out / "experiments.jsonl"
    group_anchors = set()
    if ledger_path.exists():
        for line in ledger_path.read_text(encoding="utf-8").splitlines():
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            if rec.get("group") == a.group and rec.get("anchor_sha1"):
                group_anchors.add(rec["anchor_sha1"])
    if group_anchors and anchor_sha1 not in group_anchors:
        print(f"[警告] 组 {a.group} 已有锚 {sorted(s[:8] for s in group_anchors)}，"
              f"本条锚不同——跨锚不可比", file=sys.stderr)

    # 预算闸门
    spent = ledger_spent(ledger_path)
    if a.budget is not None and not a.dry_run and spent + EST_RUN > a.budget:
        print(f"[i2i] 预算闸门：已花 {spent:.2f}，再加预估 {EST_RUN:.0f} 超过上限 {a.budget:.0f}，拒绝提交。",
              file=sys.stderr)
        return 4

    params = {"n": a.n, "aspect_ratio": a.ar}
    record = {
        "id": a.id,
        "group": a.group,
        "variable": a.var,
        "level": a.level,
        "ts": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "webapp": WEBAPP,
        "params": params,
        "prompt": prompt,
        "prompt_sha1": hashlib.sha1(prompt.encode("utf-8")).hexdigest(),
        "anchor": str(anchor),
        "anchor_sha1": anchor_sha1,
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
            "--file", f"{N_ANCHOR}={anchor}",
            "-o", str(run_dir / "out.png"),
        ]
        print(f"[i2i] 提交 {a.id}（{a.group} {a.var}={a.level}）n={a.n} {a.ar}", flush=True)
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
            print(f"[i2i] 注意：请求 n={a.n}，实际出 {len(record['files'])} 张"
                  f"（72:value 是否生效待验）", file=sys.stderr)

    (run_dir / "run.json").write_text(
        json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
    with open(ledger_path, "a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")

    print(f"\n[i2i] {record['status']} task={record['task_id']} charged={record['charged']} "
          f"files={len(record['files'])} -> {run_dir}")
    if record["status"] == "ok":
        print(f"[i2i] 下一步：python {HERE / 'measure.py'} --run {run_dir}")
    return 0 if record["status"] in ("ok", "dry") else 1


if __name__ == "__main__":
    sys.exit(main())
