"""Circle4 · 最终验收轮的机械判定（技能口径：interactive-action-card-validation）

只做可客观判定的部分，不代替 L2 语义判读：
  §0 触发条件（主体数 / 跨主体交互）
  L1 五项（主体结构 / 两列 / 帧号 / 五元组 / 元信息）
  L2-1.2 关键词扫描（前/后/左/右 空间称谓，供人工判 FAIL 取证）

用法：python final_check.py <card.md> [<card2.md> ...]
输出：stdout 摘要；仅当被检查卡位于 Log/Circle4 或显式 --json 时才落 json（避免覆盖他处记录）
"""
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "Log" / "Circle4" / "l1_final.json"

META_REQUIRED = ["name", "description"]  # 恰好 2 键，多一个即 FAIL
KEY_ORDER = ["角色", "武器/接触", "目标", "位移", "同步"]
INTERACT = ["接触", "击中", "格挡", "推击", "推中", "抓", "撞", "拨"]
SPATIAL = ["前手", "后手", "左手", "右手", "前脚", "后脚", "左腿", "右腿"]


def split_front(text):
    if not text.startswith("---"):
        return {}, text
    parts = text.split("---", 2)
    if len(parts) < 3:
        return {}, text
    raw, body = parts[1], parts[2]
    meta = {}
    cur = None
    for line in raw.splitlines():
        if not line.strip():
            continue
        if re.match(r"^-\s", line) and cur == "source":
            continue
        m = re.match(r"^([A-Za-z_]+):\s*(.*)$", line)
        if m:
            cur = m.group(1)
            meta[cur] = m.group(2).strip()
        elif cur and line.startswith("  "):
            meta[cur] = (meta.get(cur, "") + line.strip())
    return meta, body


def table_rows(lines):
    """返回 [(起始行号, [cells...]), ...] 与表块数量"""
    rows, blocks, in_tbl = [], 0, False
    for i, line in enumerate(lines, 1):
        s = line.strip()
        if s.startswith("|") and s.endswith("|"):
            if not in_tbl:
                in_tbl, blocks = True, blocks + 1
            cells = [c.strip() for c in s.strip("|").split("|")]
            if not set("".join(cells)) <= set("-: "):
                rows.append((i, cells))
        else:
            in_tbl = False
    return rows, blocks


def check(path):
    raw = path.read_bytes()
    text = raw.decode("utf-8")
    meta, body = split_front(text)
    lines = text.splitlines()
    body_lines = body.splitlines()

    res = {
        "card": path.name,
        "sha256_12": hashlib.sha256(raw).hexdigest()[:12].upper(),
        "bytes": len(raw),
        "chars": len(text),
        "lines": len(lines),
        "trigger": {},
        "L1": [],
        "spatial_hits": [],
    }

    # ---- §0 触发条件 ----
    subjects = sorted(set(re.findall(r"主体([A-Z])", text)))
    res["trigger"] = {
        "subjects": subjects,
        "subject_count": len(subjects),
        "cross_subject_terms": [w for w in INTERACT if w in text],
    }

    # ---- L1-1 主体结构 ----
    h1 = [l for l in body_lines if re.match(r"^#\s", l)]
    h2 = [l for l in body_lines if re.match(r"^##\s", l)]
    h3 = [l for l in body_lines if re.match(r"^###\s", l)]
    quotes = [l for l in body_lines if l.strip().startswith(">")]
    rows, blocks = table_rows(body_lines)
    lo = min((r[0] for r in rows), default=0)
    stray = [
        l for l in body_lines[: lo - 1] if l.strip() and not l.strip().startswith(("#", ">"))
    ]
    c1_fail = []
    if not meta:
        c1_fail.append("无 frontmatter")
    if len(h1) != 1:
        c1_fail.append(f"一级标题 {len(h1)} 个")
    if len(quotes) > 2:
        c1_fail.append(f"引用声明 {len(quotes)} 条 > 2")
    if blocks != 1:
        c1_fail.append(f"表格块 {blocks} 个 ≠ 1")
    if len(h2) > 1:
        c1_fail.append(f"二级标题 {len(h2)} 个 > 1")
    if h3:
        c1_fail.append(f"三级标题 {len(h3)} 个")
    if stray:
        c1_fail.append(f"表外独立段落：{stray[0][:24]}")
    res["L1"].append(
        {
            "id": "1",
            "name": "主体结构",
            "verdict": "PASS" if not c1_fail else "FAIL",
            "reason": "H1=1 / H2=%d / 引用=%d / 表=%d" % (len(h2), len(quotes), blocks)
            if not c1_fail
            else "；".join(c1_fail),
        }
    )

    # ---- L1-2 两列 ----
    bad = [(i, len(c)) for i, c in rows if len(c) != 2]
    res["L1"].append(
        {
            "id": "2",
            "name": "两列",
            "verdict": "PASS" if not bad else "FAIL",
            "reason": f"{len(rows)} 行全部 2 列" if not bad else f"列数异常行：{bad}",
        }
    )

    # ---- L1-3 帧号 ----
    frames, pcts, c3 = [], [], []
    for i, cells in rows[1:]:
        m = re.match(r"^K(\d+)\s*/\s*[^/]+/\s*(\d+)%$", cells[0].replace("**", ""))
        if not m:
            c3.append(f"行{i} 左列格式不符：{cells[0][:20]}")
        else:
            frames.append(int(m.group(1)))
            pcts.append(int(m.group(2)))
    if frames and frames != list(range(len(frames))):
        c3.append(f"帧号不连续：{frames}")
    if pcts and (pcts != sorted(pcts) or pcts[-1] != 100 or len(set(pcts)) != len(pcts)):
        c3.append(f"进度异常：{pcts}")
    res["L1"].append(
        {
            "id": "3",
            "name": "左列帧号",
            "verdict": "PASS" if not c3 else "FAIL",
            "reason": f"K0–K{len(frames)-1}，进度 {pcts}" if not c3 else "；".join(c3),
        }
    )

    # ---- L1-4 五元组 ----
    c4 = []
    for i, cells in rows[1:]:
        segs = [s.strip() for s in cells[1].replace("**", "").split("；") if s.strip()]
        keys = []
        for s in segs:
            m = re.match(r"^([^=]{1,8})=", s)
            if not m:
                c4.append(f"行{i} 无键名段：{s[:16]}")
                continue
            k = m.group(1).strip()
            keys.append("武器/接触" if k in ("武器接触", "武器/接触") else k)
        if keys != KEY_ORDER:
            c4.append(f"行{i} 键序 {keys}")
    res["L1"].append(
        {
            "id": "4",
            "name": "右列五元组",
            "verdict": "PASS" if not c4 else "FAIL",
            "reason": f"{len(rows)-1} 帧键序均为 角色→武器/接触→目标→位移→同步"
            if not c4
            else "；".join(c4),
        }
    )

    # ---- L1-5 元信息 ----
    c5 = []
    for k in META_REQUIRED:
        if k not in meta:
            c5.append(f"缺 {k}")
    extra = [k for k in meta if k not in META_REQUIRED]
    if extra:
        c5.append(f"多出第 3 个及以后的键：{sorted(extra)}")
    res["L1"].append(
        {
            "id": "5",
            "name": "元信息",
            "verdict": "PASS" if not c5 else "FAIL",
            "reason": "恰好 2 键：name / description" if not c5 else "；".join(c5),
        }
    )

    # ---- L2-1.2 关键词扫描（供人工判） ----
    for w in SPATIAL:
        for m in re.finditer(w, body):
            line_no = body[: m.start()].count("\n") + 2
            res["spatial_hits"].append({"word": w, "line": line_no})

    res["L1_verdict"] = "PASS" if all(x["verdict"] == "PASS" for x in res["L1"]) else "FAIL"
    return res


def main(argv):
    json_out = None
    args, it = [], iter(argv[1:])
    for a in it:
        if a == "--json":
            json_out = Path(next(it))
        else:
            args.append(a)
    cards = [Path(a) for a in args] or sorted(
        (ROOT / "Log" / "Circle4").glob("execution-counter-straight-strike*.md")
    )
    out = [check(c) for c in cards]
    base = (ROOT / "Log" / "Circle4").resolve()
    if json_out is None and all(c.resolve().parent == base for c in cards):
        json_out = OUT
    if json_out is not None:
        json_out.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    for r in out:
        print("=" * 66)
        print(f"{r['card']}  sha12={r['sha256_12']}  {r['chars']} 字 / {r['lines']} 行")
        print(
            f"§0 主体={r['trigger']['subjects']}（{r['trigger']['subject_count']}）"
            f" 交互词={r['trigger']['cross_subject_terms']}"
        )
        for c in r["L1"]:
            print(f"  L1-{c['id']} {c['name']:<6} {c['verdict']:<4} {c['reason']}")
        print(f"  L1 总判：{r['L1_verdict']}")
        if r["spatial_hits"]:
            hits = {}
            for h in r["spatial_hits"]:
                hits.setdefault(h["word"], []).append(h["line"])
            print(f"  L2-1.2 空间称谓：{hits}")
        else:
            print("  L2-1.2 空间称谓：无")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
