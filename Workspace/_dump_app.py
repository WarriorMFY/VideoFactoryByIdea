"""只读：完整 dump apiCallDemo，并在两次调用间做 diff，确认提交内容是否恒定。"""
import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "Skill/RHclaw/runninghub/scripts"))

from runninghub import require_api_key  # noqa: E402

APP = "2046794551444119554"
HOST = "https://www.runninghub.cn"
key = require_api_key(None)


def fetch():
    url = f"{HOST}/api/webapp/apiCallDemo?apiKey={key}&webappId={APP}"
    out = subprocess.run(["curl", "-s", "-S", "--fail-with-body", "--max-time", "30", url],
                         capture_output=True, text=True)
    return json.loads(out.stdout)


a, b = fetch(), fetch()
print("两次调用是否完全一致:", a == b)
data = a.get("data", {})
print("data 顶层键:", sorted(data))
print(json.dumps({k: v for k, v in data.items() if k != "nodeInfoList"},
                 ensure_ascii=False)[:1200])
nodes = data.get("nodeInfoList", [])
print(f"\nnodeInfoList：{len(nodes)} 个")
for n in nodes:
    v = str(n.get("fieldValue", ""))
    v = v[:70] + "…" if len(v) > 70 else v
    print(f"  nodeId={n.get('nodeId')!s:>4} fieldName={n.get('fieldName')!s:<14} "
          f"type={n.get('fieldType')!s:<8} value={v}")
    extra = {k: val for k, val in n.items()
             if k not in ("nodeId", "fieldName", "fieldValue", "fieldType")}
    if extra:
        print(f"        其他键: {json.dumps(extra, ensure_ascii=False)[:300]}")
