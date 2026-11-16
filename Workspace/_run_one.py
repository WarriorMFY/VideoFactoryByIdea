"""用拼装好的 Prompt 跑一张。参数：标签 [子目录，相对 output/]。"""
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "Log" / "Circle8"))

from run_portrait import run_once, require_api_key  # noqa: E402

TAG = sys.argv[1] if len(sys.argv) > 1 else "e"
PROMPT = ROOT / "Log/Circle8/output/prompt-portrait-fixed.txt"
OUT = ROOT / "Log/Circle8/output"
if len(sys.argv) > 2:
    OUT = OUT / sys.argv[2]
OUT.mkdir(parents=True, exist_ok=True)
TARGET = OUT / f"portrait-{TAG}.png"

info = run_once(require_api_key(None), PROMPT.read_text(encoding="utf-8"), TARGET)
print("RESULT", info)
