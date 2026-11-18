"""技能内凭据：读 ../credential.txt，优先级 环境变量 > 文件。

用：
  from credential import load_key
  key = load_key()          # 缺失即 SystemExit，附可直接照做的修法
"""
import os
import sys
from pathlib import Path

CRED = Path(__file__).resolve().parents[1] / "credential.txt"


def load_key():
    k = os.environ.get("RUNNINGHUB_API_KEY", "").strip()
    if k:
        return k
    if CRED.exists():
        for line in CRED.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                line = line.split("=", 1)[1].strip()
            if line:
                return line
    sys.exit("缺 API Key：在 %s 写一行 RUNNINGHUB_API_KEY=<key>（或设同名环境变量）" % CRED)
