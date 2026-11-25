"""TTS 调用包装：把中文文本从 UTF-8 文件读出，经 subprocess 传参给 runninghub.py。

绕开两个坑：
1. Git Bash 直接把中文塞进命令行会被代码页转换，变乱码；
2. runninghub.py 只有 --prompt，没有 --prompt-file。

用法：
  python run_tts.py --text-file Log/Circle35/prompts/tts-01.txt --voice Elegant_Man -o out.mp3
"""
import argparse
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
CLI = REPO / "Skill" / "hub" / "generation" / "runninghub" / "scripts" / "runninghub.py"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--text-file", required=True)
    ap.add_argument("--voice", default="Elegant_Man")
    ap.add_argument("--speed", default="0.95")
    ap.add_argument("--endpoint", default="rhart-audio/text-to-audio/speech-2.8-turbo")
    ap.add_argument("-o", "--output", required=True)
    a = ap.parse_args()

    text = Path(a.text_file).read_text(encoding="utf-8").strip()
    if not text:
        print("空文本", file=sys.stderr)
        return 2
    cmd = [sys.executable, str(CLI), "--endpoint", a.endpoint,
           "--prompt", text,
           "--param", f"voice_id={a.voice}",
           "--param", f"speed={a.speed}",
           "-o", a.output]
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    print(r.stdout.strip())
    if r.stderr.strip():
        print(r.stderr.strip(), file=sys.stderr)
    return r.returncode


if __name__ == "__main__":
    sys.exit(main())
