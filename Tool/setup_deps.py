"""重建 Tool/_deps：抽帧脚本需要的 cv2 / Pillow / numpy，以及 FFmpeg 静态二进制。

依赖缓存不入库（见 .gitignore），换机器或缓存丢失时跑一次：
    python Tool/setup_deps.py
FFmpeg 由 imageio-ffmpeg 自带（gyan.dev essentials build），入口见 Tool/ffmpeg.py。
yt-dlp 不在此脚本内：PyPI 版对 B 站已失效，需从 GitHub releases 单独取独立 exe 放入 _deps。
"""
import subprocess
import sys
from pathlib import Path

DEPS = Path(__file__).resolve().parent / "_deps"
PKGS = ["opencv-python-headless", "pillow", "numpy", "imageio-ffmpeg"]


def main():
    DEPS.mkdir(parents=True, exist_ok=True)
    cmd = [sys.executable, "-m", "pip", "install",
           "--disable-pip-version-check", "--only-binary=:all:",
           "--target", str(DEPS), *PKGS]
    print("安装到", DEPS)
    return subprocess.run(cmd).returncode


if __name__ == "__main__":
    sys.exit(main())
