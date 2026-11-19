"""Circle3 · Seedance2.0-Mini 标准模型 API 逐字送验（一次性脚本，过程证据）

通道：rhart-video/sparkvideo-2.0-mini/text-to-video
沿用 Circle3 §7 判据「卡片是最终真相，也是唯一真相」：
把卡片文件全部字节作为 prompt 值，不 strip、不拼接帧、不加段标记、
不加防干扰句、不脱敏、不改 frontmatter 缩进。

与 §7 相比多覆盖两环：
  - 直接复用 runner 的 build_payload()，验证脚本内部构造的请求体 == 卡片
  - 复现 curl_post_json() 的 json.dumps 序列化，验证 HTTP body 往返后 == 卡片
剩余缺口仍是服务端回读未验证。

API key 由环境变量 RUNNINGHUB_API_KEY 传入，不写入本文件。
"""

import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CARD = ROOT / "Log/Circle3/execution-shield-bash-throat-thrust-3f.md"
RUNNER = ROOT / "Skill/hub/generation/runninghub/scripts/runninghub.py"
OUT = ROOT / "Log/Circle3/output/l4-seedance-mini.mp4"
ENDPOINT = "rhart-video/sparkvideo-2.0-mini/text-to-video"
PARAMS = ["resolution=480p", "duration=5", "ratio=16:9"]


def main():
    # --- 1. 卡片基准 ---
    raw = CARD.read_bytes()
    text = raw.decode("utf-8")             # 唯一一次转换，不改任何字符
    assert text.encode("utf-8") == raw, "往返校验失败"
    print("CARD_BYTES", len(raw))
    print("CARD_CHARS", len(text))
    print("CARD_SHA256", hashlib.sha256(raw).hexdigest()[:12].upper())
    print("ROUNDTRIP", True)

    OUT.parent.mkdir(parents=True, exist_ok=True)

    # --- 2. 快照 = 卡片原字节 ---
    snap = Path(str(OUT) + ".prompt.txt")
    snap.write_bytes(raw)
    print("SNAPSHOT", snap.name, "BYTE_IDENTICAL", snap.read_bytes() == raw)

    # --- 3. 复用 runner 的 build_payload，验证请求体不改字 ---
    sys.path.insert(0, str(RUNNER.parent))
    import runninghub as rh

    ep = rh.find_endpoint(ENDPOINT)
    assert ep, "端点未在 capabilities.json 找到"
    args = argparse.Namespace(
        prompt=text,
        param=list(PARAMS),
        image=None, video=None, audio=None,
        api_key=None, endpoint=ENDPOINT,
    )
    payload = rh.build_payload(ep, args)
    print("PAYLOAD_PROMPT_EQUALS_CARD", payload.get("prompt") == text)
    print("PAYLOAD_KEYS", sorted(payload.keys()))
    assert payload.get("prompt") == text, "build_payload 改写了 prompt"

    # --- 4. 复现 curl_post_json 的序列化（ensure_ascii 默认 True） ---
    body = json.dumps(payload)
    assert json.loads(body)["prompt"] == text, "JSON 序列化改写了 prompt"
    body_file = Path(str(OUT) + ".payload.json")
    body_file.write_bytes(body.encode("ascii"))
    print("BODY_FILE", body_file.name, "BYTES", len(body.encode("ascii")))
    print("BODY_ROUNDTRIP", json.loads(body_file.read_bytes().decode("ascii"))["prompt"] == text)

    # --- 5. 真实提交，--prompt 直接传卡片全文（list 传参，不经 shell） ---
    cmd = [sys.executable, str(RUNNER),
           "--endpoint", ENDPOINT,
           "--prompt", text]
    for p in PARAMS:
        cmd += ["--param", p]
    cmd += ["-o", str(OUT)]
    print("ENDPOINT", ENDPOINT)
    print("PARAMS", " | ".join(PARAMS))
    print("PROMPT_ARG_BYTES", len(text.encode("utf-8")))

    r = subprocess.run(cmd, capture_output=True, text=True,
                       encoding="utf-8", timeout=1800)
    print("RC", r.returncode)
    print(r.stdout)
    if r.stderr:
        print("--- STDERR ---")
        print(r.stderr[-3000:])
    return r.returncode


if __name__ == "__main__":
    sys.exit(main())
