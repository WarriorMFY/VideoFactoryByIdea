"""无费用冒烟测试：验证工线各段能否跑通，不发起任何付费生成请求。

    python Skill/meta/smoke-test/scripts/smoke_test.py
    python Skill/meta/smoke-test/scripts/smoke_test.py --online   # 额外查账号余额与通道节点（只读、需网络）

样本在 `fixtures/`，随技能分发。缺 `draw_sheet.mp4` 时该项自动 SKIP 而不是 FAIL。
从任意目录调用均可，内部自动切到仓库根（run_l3/l4.py 的默认 runner 是相对路径）。
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
import tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
ROOT = SCRIPTS.parents[3]
DEPS = ROOT / "Tool" / "_deps"
SKILL = ROOT / "Skill/chain/card-experiment/scripts"
RH = ROOT / "Skill/hub/generation/runninghub/scripts"
FIXTURES = SCRIPTS.parent / "fixtures"
PROMPT = FIXTURES / "prompt.txt"
CARD_V2 = FIXTURES / "card-v2.md"
VIDEO = FIXTURES / "draw_sheet.mp4"
SAMPLE = PROMPT.is_file() and CARD_V2.is_file()
STUB = SCRIPTS / "stub_runner.py"

results = []


def api_key_from_agents():
    for line in (ROOT / "AGENTS.md").read_text(encoding="utf-8").splitlines():
        if "apikey" in line.lower() and ":" in line:
            k = line.split(":", 1)[1].strip()
            if k:
                return k
    return None


def child_env():
    e = os.environ.copy()
    if DEPS.is_dir():
        e["PYTHONPATH"] = str(DEPS) + (os.pathsep + e["PYTHONPATH"] if e.get("PYTHONPATH") else "")
    e["PYTHONUTF8"] = "1"
    if not e.get("RUNNINGHUB_API_KEY"):
        k = api_key_from_agents()
        if k:
            e["RUNNINGHUB_API_KEY"] = k
    return e


def record(name, status, detail):
    results.append((name, status, detail))
    print("[{:<4}] {:<20} {}".format(status, name, detail), flush=True)


def run(name, cmd, ok, detail, soft=False, timeout=120):
    try:
        r = subprocess.run(cmd, cwd=ROOT, env=child_env(), capture_output=True,
                           text=True, encoding="utf-8", errors="replace", timeout=timeout)
    except Exception as ex:
        record(name, "SKIP" if soft else "FAIL", "{}: {}".format(type(ex).__name__, ex))
        return None
    record(name, "PASS" if ok(r) else "FAIL", detail(r))
    return r


def last_line(r):
    lines = [x for x in r.stdout.strip().splitlines() if x.strip()]
    return lines[-1][:100] if lines else "rc={}".format(r.returncode)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--online", action="store_true", help="额外做只读在线检查")
    a = ap.parse_args()
    os.chdir(ROOT)

    run("deps", [sys.executable, "-c",
                 "import cv2, PIL, numpy; print('cv2', cv2.__version__, '| numpy', numpy.__version__)"],
        ok=lambda r: r.returncode == 0, detail=last_line)

    if SAMPLE:
        run("prompt_consistency",
            [sys.executable, str(SKILL / "verify_prompt.py"), str(CARD_V2), str(PROMPT)],
            ok=lambda r: r.returncode == 0 and "RESULT PASS" in r.stdout,
            detail=lambda r: "fixtures v2 卡 / prompt → " + ("PASS" if "RESULT PASS" in r.stdout else "FAIL"))

        with tempfile.TemporaryDirectory(prefix="cardstudio_smoke_") as td:
            t = Path(td)
            run("l3_stub",
                [sys.executable, str(SKILL / "run_l3.py"), str(PROMPT), str(t / "l3.png"),
                 "--runner", str(STUB)],
                ok=lambda r: r.returncode == 0 and "STUB_OK" in r.stdout,
                detail=lambda r: "RC={} {}".format(r.returncode, r.stdout.splitlines()[0] if r.stdout else ""))

            run("l4_stub",
                [sys.executable, str(SKILL / "run_l4.py"), str(PROMPT), str(t / "l4.mp4"),
                 "--runner", str(STUB)],
                ok=lambda r: r.returncode == 0 and all(
                    k in r.stdout for k in ("115:aspect_ratio", "225:select", "205:select")),
                detail=lambda r: "默认节点覆盖 3 项 / RC={}".format(r.returncode))

            run("l4_bare_stub",
                [sys.executable, str(SKILL / "run_l4.py"), str(PROMPT), str(t / "l4_bare.mp4"),
                 "--bare", "--runner", str(STUB)],
                ok=lambda r: r.returncode == 0 and "NODES (bare)" in r.stdout,
                detail=lambda r: "bare 无覆盖 / RC={}".format(r.returncode))
    else:
        for name in ("prompt_consistency", "l3_stub", "l4_stub", "l4_bare_stub"):
            record(name, "SKIP", "缺 fixtures/ 样本")

    if VIDEO.is_file():
        with tempfile.TemporaryDirectory(prefix="cardstudio_smoke_") as td:
            out = Path(td) / "sheet.png"
            run("draw_sheet",
                [sys.executable, str(SKILL / "draw_sheet.py"), str(VIDEO),
                 "-o", str(out), "--cols", "4", "--rows", "4"],
                ok=lambda r: r.returncode == 0 and out.is_file(),
                detail=last_line)
    else:
        record("draw_sheet", "SKIP", "缺 fixtures/draw_sheet.mp4")

    # 旧 `validate_ps1` 检查与 `vdetail` 提取器已移除：旧规范与校验脚本随规格重构废止，现规格见 Skill/chain/card-experiment/reference/card-format.md

    if a.online:
        run("account",
            [sys.executable, str(RH / "account.py")],
            ok=lambda r: r.returncode == 0 and "remainPoint=" in r.stdout,
            detail=lambda r: next((x for x in r.stdout.splitlines() if x.startswith("remainPoint=")), last_line(r)),
            soft=True, timeout=60)
        for label, app in (("info_l3", "2046794551444119554"),
                           ("info_l4", "2085304953094107137")):
            run(label,
                [sys.executable, str(RH / "runninghub_app.py"), "--info", app],
                ok=lambda r: r.returncode == 0 and "nodeCount" in r.stdout,
                detail=lambda r: next((x.strip() for x in r.stdout.splitlines() if "nodeCount" in x), last_line(r)),
                soft=True, timeout=60)

    bad = [n for n, s, _ in results if s == "FAIL"]
    skip = [n for n, s, _ in results if s == "SKIP"]
    print("\nSMOKE {}  {}/{} 通过{}".format(
        "PASS" if not bad else "FAIL", len(results) - len(bad) - len(skip), len(results) - len(skip),
        "；SKIP: " + ", ".join(skip) if skip else ""))
    if bad:
        print("失败项:", ", ".join(bad))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
