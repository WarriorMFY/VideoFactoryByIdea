"""重建 Tool/_deps：抽帧脚本需要的 cv2 / Pillow / numpy。

依赖缓存不入库（见 .gitignore），换机器或缓存丢失时跑一次：
    python Tool/setup_deps.py
"""
import subprocess
import sys
from pathlib import Path

DEPS = Path(__file__).resolve().parent / "_deps"
PKGS = ["opencv-python-headless", "pillow", "numpy"]


def main():
    DEPS.mkdir(parents=True, exist_ok=True)
    cmd = [sys.executable, "-m", "pip", "install",
           "--disable-pip-version-check", "--only-binary=:all:",
           "--target", str(DEPS), *PKGS]
    print("安装到", DEPS)
    return subprocess.run(cmd).returncode


if __name__ == "__main__":
    sys.exit(main())
