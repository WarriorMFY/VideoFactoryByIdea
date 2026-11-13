"""L4 送验：读 prompt.txt 的 # L4 段，调 RunningHub 出视频。

用法：
    python run_l4.py <prompt.txt> <out.mp4>
    python run_l4.py <prompt.txt> <out.mp4> --node "115:aspect_ratio=1:1"
    python run_l4.py <prompt.txt> <out.mp4> --bare        # 不套默认节点覆盖

约定（与 verify_prompt.py 一致）：
    # L4 段第一行是 K0–K4 拼接的完整叙述。

默认节点覆盖（不覆盖会用通道默认值，费用翻几倍）：
    115:aspect_ratio=16:9 (Widescreen)
    225:select=1       分辨率档（当前通道 1=480P）
    205:select=1       时长档（当前通道 1=5s）

换通道时先用 runninghub_app.py --info <appId> 查节点 id，再改 --prompt-node
和 --node。--bare 只发 prompt，适用于已确认默认档位的通道。
"""

import argparse
import subprocess
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

DEFAULT_APP = "2085304953094107137"
DEFAULT_RUNNER = "Skill/RHClaw/runninghub/scripts/runninghub_app.py"
DEFAULT_NODES = [
    "115:aspect_ratio=16:9 (Widescreen)",
    "225:select=1",
    "205:select=1",
]


def load_l4(path):
    cur, pos = None, None
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if s.startswith("#"):
            cur = "L4" if "L4" in s else None
            continue
        if cur == "L4" and s and not s.startswith("--no"):
            pos = s
            break
    return pos


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("prompt_file")
    ap.add_argument("out")
    ap.add_argument("--app", default=DEFAULT_APP)
    ap.add_argument("--prompt-node", default="250:prompt")
    ap.add_argument("--node", action="append", default=[])
    ap.add_argument("--bare", action="store_true")
    ap.add_argument("--runner", default=DEFAULT_RUNNER)
    ap.add_argument("--timeout", type=int, default=1800)
    a = ap.parse_args()

    prompt = load_l4(a.prompt_file)
    if not prompt:
        sys.exit("prompt 文件里没有 # L4 段")

    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    Path(str(out) + ".prompt.txt").write_text(prompt, encoding="utf-8")
    print("PROMPT_LEN", len(prompt))

    cmd = [sys.executable, a.runner, "--run", a.app,
           "--node", a.prompt_node + "=" + prompt]
    nodes = ([] if a.bare else DEFAULT_NODES) + a.node
    for n in nodes:
        cmd += ["--node", n]
    cmd += ["-o", str(out)]
    print("NODES", " | ".join(nodes) if nodes else "(bare)")

    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", timeout=a.timeout)
    print("RC", r.returncode)
    print(r.stdout)
    if r.returncode:
        print(r.stderr[-2000:])
    return r.returncode


if __name__ == "__main__":
    sys.exit(main())
