#!/usr/bin/env python
"""启动器（薄壳）：转调 `Skill/image-matte/scripts/matte.py`，不含算法。

保留这个入口只为兼容既有调用习惯与文档里的 `Tool/matte.py` 路径；
抠图实现、参数说明、通过线都在技能树内（见 `Skill/image-matte/`）。
"""
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
TARGET = REPO / "Skill" / "image-matte" / "scripts" / "matte.py"

if not TARGET.exists():
    sys.exit(f"找不到技能实现：{TARGET}（Skill 目录被移动或删除了？）")

sys.exit(subprocess.call([sys.executable, str(TARGET), *sys.argv[1:]]))
