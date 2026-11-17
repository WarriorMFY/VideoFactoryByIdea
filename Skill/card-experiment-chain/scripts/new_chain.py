"""建链：分配编号、快照卡、算 sha1、写 manifest 骨架。

用法：
  python new_chain.py --circle Log/Circle15 --family terrain-foo --tag near-a \
      --main <卡.md> [--fixed <卡.md>] [--anti <卡.md>]

输出：
  <circle>/<family>/chain-<NN>-<tag>/{card-instance.md, card-fixed.md, card-anti.md, manifest.json}
"""
import argparse
import hashlib
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parents[1]
sys.stdout.reconfigure(encoding="utf-8")

ROLE_FILE = {"main": "card-instance.md", "fixed": "card-fixed.md", "anti": "card-anti.md"}


def body(path):
    lines = path.read_text(encoding="utf-8").splitlines()
    if lines and lines[0].strip() == "---":
        for i in range(1, len(lines)):
            if lines[i].strip() == "---":
                return "\n".join(lines[i + 1:]).strip("\n")
    return "\n".join(lines).strip("\n")


def resolve(p):
    p = Path(p)
    return p if p.is_absolute() else ROOT / p


def next_index(family_dir):
    used = []
    for d in family_dir.glob("chain-*") if family_dir.exists() else []:
        tail = d.name.split("-")[1]
        if tail.isdigit():
            used.append(int(tail))
    return (max(used) + 1) if used else 1


def main():
    ap = argparse.ArgumentParser(description="新建一条卡片实验链")
    ap.add_argument("--circle", required=True, help="循环目录，如 Log/Circle15")
    ap.add_argument("--family", required=True, help="卡片家族目录名")
    ap.add_argument("--tag", required=True, help="链标签，小写字母/数字/连字符")
    ap.add_argument("--main", required=True)
    ap.add_argument("--fixed")
    ap.add_argument("--anti")
    a = ap.parse_args()

    circle = resolve(a.circle)
    if not circle.exists():
        raise SystemExit("循环目录不存在（循环边界由用户声明，本脚本不建轮）：" + str(circle))

    family = circle / a.family
    nn = next_index(family)
    chain_name = "chain-%02d-%s" % (nn, a.tag)
    chain = family / chain_name
    if chain.exists():
        raise SystemExit("链已存在：" + str(chain))
    chain.mkdir(parents=True)

    sources = [("main", a.main), ("fixed", a.fixed), ("anti", a.anti)]
    cards = []
    for role, src in sources:
        if not src:
            continue
        src_path = resolve(src)
        if not src_path.exists():
            raise SystemExit("卡不存在：" + str(src_path))
        dst = chain / ROLE_FILE[role]
        shutil.copyfile(src_path, dst)
        text = body(dst)
        cards.append({
            "role": role,
            "file": dst.name,
            "sha1": hashlib.sha1(dst.read_bytes()).hexdigest()[:12],
            "chars": len(text),
        })
        print("SNAPSHOT", role, dst.name, len(text), "字")

    tpl = json.loads((HERE / "templates" / "manifest.json").read_text(encoding="utf-8"))
    mode = "full" if {c["role"] for c in cards} >= {"main", "fixed", "anti"} else "main"
    tpl.update({
        "circle": circle.name,
        "family": a.family,
        "chain": chain_name,
        "cards": cards,
    })
    tpl["delivery"].update({
        "mode": mode,
        "order": [c["role"] for c in cards if c["role"] != "main"] + ["main"],
    })

    out = chain / "manifest.json"
    out.write_text(json.dumps(tpl, ensure_ascii=False, indent=2), encoding="utf-8")
    print("CHAIN", chain.relative_to(ROOT))
    print("MANIFEST", out.relative_to(ROOT))
    print("NEXT  python scripts/compose.py --out %s/video/prompt-video.txt --main %s"
          % (chain.relative_to(ROOT), (chain / ROLE_FILE["main"]).relative_to(ROOT)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
