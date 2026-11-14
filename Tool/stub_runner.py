"""送验脚本的零成本替身：替代 runninghub_app.py，只记录参数，不发起任何生成请求。

用法（由 run_l3.py / run_l4.py 通过 --runner 调用，不直接手工执行）：
    python run_l3.py <prompt.txt> <out.png> --runner Tool/stub_runner.py
"""
import sys
from pathlib import Path

args = sys.argv[1:]
out = None
app = None
nodes = []
for i, a in enumerate(args):
    if a == "-o" and i + 1 < len(args):
        out = args[i + 1]
    elif a == "--node" and i + 1 < len(args):
        nodes.append(args[i + 1])
    elif a == "--run" and i + 1 < len(args):
        app = args[i + 1]

print("STUB_RUNNER argc=%d app=%s" % (len(args), app))
for j, n in enumerate(nodes):
    print("  node[%d] len=%d key=%s" % (j, len(n), n.split("=")[0]))
if out:
    p = Path(out)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(b"SMOKE")
    print("  fake output: %s" % p)
print("STUB_OK")
