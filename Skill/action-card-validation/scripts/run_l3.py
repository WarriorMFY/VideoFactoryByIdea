"""L3 送验：读 prompt.txt 的 # L3 段，拼正向 + 负向，调 RunningHub 出图。

用法：
    python run_l3.py <prompt.txt> <out.png>
    python run_l3.py <prompt.txt> <out.png> --app <appId> --prompt-node 18:prompt
    python run_l3.py <prompt.txt> <out.png> --node "18:resolution=1k"

约定（与 verify_prompt.py 一致）：
    # L3 段第一行是正向文本，`--no ...` 行是负向词。
    负向词以「避免……。」拼在正向之后，正向文本一个字符都不改。
    发送快照写到 <out>.prompt.txt，用于事后核对实际发出去的是什么。

换通道时先用 runninghub_app.py --info <appId> 查节点 id。
"""

import argparse
import subprocess
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

DEFAULT_APP = "2046794551444119554"
DEFAULT_RUNNER = "Skill/RHClaw/runninghub/scripts/runninghub_app.py"


def load_l3(path):
    pos, neg, cur = None, "", None
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if s.startswith("#"):
            cur = "L3" if "L3" in s else None
            continue
        if cur != "L3":
            continue
        if s.startswith("--no"):
            neg = s[4:].strip()
        elif s and pos is None:
            pos = s
    return pos, neg


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("prompt_file")
    ap.add_argument("out")
    ap.add_argument("--app", default=DEFAULT_APP)
    ap.add_argument("--prompt-node", default="18:prompt")
    ap.add_argument("--node", action="append", default=[])
    ap.add_argument("--runner", default=DEFAULT_RUNNER)
    ap.add_argument("--timeout", type=int, default=900)
    a = ap.parse_args()

    pos, neg = load_l3(a.prompt_file)
    if not pos:
        sys.exit("prompt 文件里没有 # L3 段")

    prompt = pos + ("避免" + neg + "。" if neg else "")
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    Path(str(out) + ".prompt.txt").write_text(prompt, encoding="utf-8")
    print("PROMPT_LEN", len(prompt))

    cmd = [sys.executable, a.runner, "--run", a.app,
           "--node", a.prompt_node + "=" + prompt]
    for n in a.node:
        cmd += ["--node", n]
    cmd += ["-o", str(out)]

    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", timeout=a.timeout)
    print("RC", r.returncode)
    print(r.stdout)
    if r.returncode:
        print(r.stderr[-2000:])
    return r.returncode


if __name__ == "__main__":
    sys.exit(main())
