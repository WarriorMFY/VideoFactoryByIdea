"""FFmpeg 入口：把参数原样转发给 Tool/_deps 内的静态二进制。

用法：python Tool/ffmpeg.py -version
      python Tool/ffmpeg.py -i in.mp4 -ss 2 -t 1 -c copy out.mp4
二进制来自 imageio-ffmpeg 包（gyan.dev essentials build），由 setup_deps.py 重建。
"""
import subprocess
import sys
from pathlib import Path

BIN_DIR = Path(__file__).resolve().parent / "_deps" / "imageio_ffmpeg" / "binaries"


def find_exe() -> Path:
    exes = sorted(BIN_DIR.glob("ffmpeg-*.exe"))
    if not exes:
        raise SystemExit("未找到 FFmpeg 二进制，请先运行 python Tool/setup_deps.py")
    return exes[0]


if __name__ == "__main__":
    sys.exit(subprocess.run([str(find_exe()), *sys.argv[1:]]).returncode)
