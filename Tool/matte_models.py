#!/usr/bin/env python
"""启动器（薄壳）：转调 `Skill/image-matte/scripts/matte_models.py`，不含下载逻辑。"""
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
TARGET = REPO / "Skill" / "image-matte" / "scripts" / "matte_models.py"

if not TARGET.exists():
    sys.exit(f"找不到技能实现：{TARGET}（Skill 目录被移动或删除了？）")

sys.exit(subprocess.call([sys.executable, str(TARGET), *sys.argv[1:]]))
