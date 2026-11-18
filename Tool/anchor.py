#!/usr/bin/env python
"""启动器（薄壳）：转调 `Skill/pixel-anchor/scripts/anchor.py`，不含算法。

锚点的四个子命令（compose / masks / score / pair）、参数与通过线都在技能树内
（见 `Skill/pixel-anchor/`）。保留这个入口只为兼容既有调用习惯。
"""
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
TARGET = REPO / "Skill" / "pixel-anchor" / "scripts" / "anchor.py"

if not TARGET.exists():
    sys.exit(f"找不到技能实现：{TARGET}（Skill 目录被移动或删除了？）")

sys.exit(subprocess.call([sys.executable, str(TARGET), *sys.argv[1:]]))
