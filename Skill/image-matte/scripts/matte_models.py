#!/usr/bin/env python
"""从国内镜像拉取 rembg 抠图模型权重（GitHub 直连不可用时用这个）。

本文件位于技能树内；模型权重是运行时缓存，落到 `<仓库>/Tool/_deps_matte/models/`
（可用环境变量 CARDSTUDIO_MATTE_DEPS 覆盖），rembg 会优先从该目录（U2NET_HOME）读取，不联网。
用法：
  python Skill/image-matte/scripts/matte_models.py list
  python Skill/image-matte/scripts/matte_models.py fetch isnet-general-use   # 单个
  python Skill/image-matte/scripts/matte_models.py fetch all                 # 全部（约 700MB）
"""
import os
import sys
import urllib.request
from pathlib import Path


def _repo_root(start: Path) -> Path:
    for p in [start, *start.parents]:
        if (p / "Skill").is_dir() and (p / "Tool").is_dir():
            return p
    return start.parents[3]


REPO = _repo_root(Path(__file__).resolve().parent)
MODELS = Path(os.environ.get("CARDSTUDIO_MATTE_DEPS", REPO / "Tool" / "_deps_matte")) / "models"
MIRROR = "https://hf-mirror.com/tomjackson2023/rembg/resolve/main/{name}.onnx"

AVAILABLE = {
    "u2net": "通用，176MB，最稳，人物/物体都能抠",
    "u2netp": "通用轻量，4.7MB，快但粗",
    "isnet-general-use": "通用高精度，170MB，物体边缘优于 u2net",
    "isnet-anime": "二次元插画专用，170MB",
    "silueta": "u2net 精简版，43MB，速度与精度折中",
    "u2net_human_seg": "人像专用，176MB",
    "u2net_cloth_seg": "服装分区（上装/下装/全身），176MB",
}


def fetch(name):
    MODELS.mkdir(parents=True, exist_ok=True)
    dst = MODELS / f"{name}.onnx"
    if dst.exists() and dst.stat().st_size > 1024:
        print(f"[skip] 已存在 {dst.name} {dst.stat().st_size / 1048576:.1f}MB")
        return
    url = MIRROR.format(name=name)
    print(f"[get ] {url}")
    tmp = dst.with_suffix(".part")
    with urllib.request.urlopen(url, timeout=60) as r, open(tmp, "wb") as f:
        total = int(r.headers.get("Content-Length", 0))
        done = 0
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)
            done += len(chunk)
            if total:
                print(f"\r  {done / 1048576:.1f}/{total / 1048576:.1f}MB", end="")
    tmp.replace(dst)
    print(f"\n[ok  ] {dst.name} {dst.stat().st_size / 1048576:.1f}MB")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "list"
    if cmd == "list":
        for k, v in AVAILABLE.items():
            mark = "✓" if (MODELS / f"{k}.onnx").exists() else " "
            print(f"[{mark}] {k:<20} {v}")
    elif cmd == "fetch":
        targets = list(AVAILABLE) if (len(sys.argv) < 3 or sys.argv[2] == "all") else sys.argv[2:]
        for t in targets:
            if t not in AVAILABLE:
                print(f"[skip] 未知模型 {t}；可选：{', '.join(AVAILABLE)}")
                continue
            fetch(t)
    else:
        sys.exit("用法：python Skill/image-matte/scripts/matte_models.py list|fetch <name>|fetch all")
