"""技能内凭据：实现与文件都在 hub，本文件只提供本链的导入名。

用：
  from credential import load_key
  key = load_key()          # 缺失即 SystemExit，附可直接照做的修法
"""
import sys
from pathlib import Path

HUB = Path(__file__).resolve().parents[3] / "hub" / "generation" / "runninghub" / "scripts"
if str(HUB) not in sys.path:
    sys.path.insert(0, str(HUB))

from rh_credential import load_key  # noqa: E402,F401
