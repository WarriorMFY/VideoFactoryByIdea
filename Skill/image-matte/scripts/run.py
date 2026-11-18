"""技能启动器：把参数原样转给仓库工具 Tool/matte.py。

工具的依赖（rembg / onnxruntime）与模型权重统一装在 Tool/_deps_matte/，
本文件只负责定位仓库根、透传参数，不含算法。
"""
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]  # scripts -> image-matte -> Skill -> 仓库根
TOOL = REPO / "Tool" / "matte.py"

if not TOOL.exists():
    sys.exit(f"找不到抠图工具：{TOOL}")

sys.exit(subprocess.call([sys.executable, str(TOOL), *sys.argv[1:]]))
