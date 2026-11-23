"""Circle27 批量驱动：按矩阵顺序跑剩余实验，每条 提交→度量，失败记录并继续。

预算：积分由 run.py --budget 600 控；时间截止 13:34:58（首条成功 09:34:58 + 4h）。
已成功的 run.json(status=ok) 自动跳过，可重复执行。
"""
import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent          # Log/Circle27
REPO = ROOT.parents[1]
P = REPO / "Skill/hub/generation/i2i-probe"
DEADLINE = datetime(2026, 11, 23, 13, 34, 58)

A = "Log/Circle27/anchors/A-scene.png"
B = "Log/Circle27/anchors/B-person.png"

TASKS = [
    # (id, group, variable, level, anchor, ar)
    ("A-V1-中", "A-V1", "景别", "中景", A, "16:9"),
    ("A-V1-近", "A-V1", "景别", "近景", A, "16:9"),
    ("A-V2-晨", "A-V2", "光线", "清晨柔光", A, "16:9"),
    ("A-V2-午", "A-V2", "光线", "正午硬光", A, "16:9"),
    ("A-V2-昏", "A-V2", "光线", "黄昏逆光", A, "16:9"),
    ("A-V3-水墨", "A-V3", "画风", "水墨", A, "16:9"),
    ("A-V3-油画", "A-V3", "画风", "油画", A, "16:9"),
    ("A-V3-动漫", "A-V3", "画风", "动漫赛璐璐", A, "16:9"),
    ("B-base", "B-base", "基线", "保持原图", B, "3:4"),
    ("B-V1-七分身", "B-V1", "景别", "七分身", B, "3:4"),
    ("B-V1-半身", "B-V1", "景别", "半身", B, "3:4"),
    ("B-V1-胸像", "B-V1", "景别", "胸像", B, "3:4"),
    ("B-V2-晨", "B-V2", "光线", "清晨柔光", B, "3:4"),
    ("B-V2-午", "B-V2", "光线", "正午硬光", B, "3:4"),
    ("B-V2-昏", "B-V2", "光线", "黄昏逆光", B, "3:4"),
    ("B-V3-平静", "B-V3", "表情", "平静", B, "3:4"),
    ("B-V3-微笑", "B-V3", "表情", "微笑", B, "3:4"),
    ("B-V3-惊讶", "B-V3", "表情", "惊讶", B, "3:4"),
]


def done(tid: str) -> bool:
    rj = ROOT / "runs" / tid / "run.json"
    if not rj.exists():
        return False
    try:
        rec = json.loads(rj.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return False
    return rec.get("status") == "ok" and bool(rec.get("task_id")) and rec.get("charged") is not None


def call(args) -> int:
    print(" ".join(args), flush=True)
    env = dict(__import__("os").environ)
    env["PYTHONUTF8"] = "1"
    env["PYTHONIOENCODING"] = "utf-8"
    return subprocess.run(args, cwd=str(REPO), env=env).returncode


def main() -> int:
    summary = []
    for tid, group, var, level, anchor, ar in TASKS:
        now = datetime.now()
        if now >= DEADLINE:
            print(f"[BREAK] 时间预算到：{now:%H:%M:%S} >= {DEADLINE:%H:%M:%S}")
            break
        if done(tid):
            print(f"[SKIP] {tid} 已完成")
            summary.append((tid, "skip"))
            continue
        print(f"\n===== {tid} ({group} {var}={level}) {now:%H:%M:%S} =====", flush=True)
        rc = call([sys.executable, str(P / "scripts/run.py"),
                   "--id", tid, "--group", group, "--var", var, "--level", level,
                   "--anchor", anchor,
                   "--prompt-file", f"Log/Circle27/prompts/{tid}.txt",
                   "--ar", ar, "--n", "2", "--out", "Log/Circle27", "--budget", "600"])
        if rc != 0:
            print(f"[FAIL] {tid} run.py rc={rc}（作失败处理，不重跑）", flush=True)
            summary.append((tid, f"run_rc{rc}"))
            continue
        rc = call([sys.executable, str(P / "scripts/measure.py"),
                   "--run", f"Log/Circle27/runs/{tid}"])
        summary.append((tid, "ok" if rc == 0 else f"measure_rc{rc}"))
    print("\n===== 汇总 =====")
    for tid, st in summary:
        print(f"  {tid:<14}{st}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
