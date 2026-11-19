"""Circle3 · L4 原卡逐字送验（一次性脚本，本轮过程证据）

与 run_l4.py 的差别：run_l4.py 的 load_l4() 只取 "# L4" 段后的第一行，
无法承载整张卡片。本脚本把卡片文件的全部字节作为 250:prompt 的 fieldValue，
不 strip、不拼接 K0-K4、不加防干扰句、不加段标记、不脱敏。

沿用 run_l4.py 的 app / prompt 节点 / 三个默认节点覆盖，不改 Skill/。
API key 由环境变量 RUNNINGHUB_API_KEY 传入，不写入本文件。
"""

import hashlib
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CARD = ROOT / "Log/Circle3/execution-shield-bash-throat-thrust-3f.md"
RUNNER = ROOT / "Skill/hub/generation/runninghub/scripts/runninghub_app.py"
OUT = ROOT / "Log/Circle3/output/l4-card-verbatim.mp4"
APP = "2085304953094107137"
PROMPT_NODE = "250:prompt"
DEFAULT_NODES = [
    "115:aspect_ratio=16:9 (Widescreen)",
    "225:select=1",
    "205:select=1",
]


def main():
    raw = CARD.read_bytes()
    text = raw.decode("utf-8")             # 唯一一次转换，不改任何字符
    assert text.encode("utf-8") == raw     # 往返校验
    print("CARD_BYTES", len(raw))
    print("CARD_SHA256", hashlib.sha256(raw).hexdigest()[:12].upper())
    print("PROMPT_CHARS", len(text))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    snap = Path(str(OUT) + ".prompt.txt")
    snap.write_bytes(raw)                  # 快照 = 卡片原字节
    print("SNAPSHOT", snap.name, "BYTE_IDENTICAL", snap.read_bytes() == raw)

    cmd = [sys.executable, str(RUNNER), "--run", APP,
           "--node", PROMPT_NODE + "=" + text]
    for n in DEFAULT_NODES:
        cmd += ["--node", n]
    cmd += ["-o", str(OUT)]
    print("APP", APP)
    print("PROMPT_NODE", PROMPT_NODE, "VALUE_BYTES", len(text.encode("utf-8")))
    print("NODES", " | ".join(DEFAULT_NODES))

    r = subprocess.run(cmd, capture_output=True, text=True,
                       encoding="utf-8", timeout=1800)
    print("RC", r.returncode)
    print(r.stdout)
    if r.returncode:
        print(r.stderr[-2000:])
    return r.returncode


if __name__ == "__main__":
    sys.exit(main())
