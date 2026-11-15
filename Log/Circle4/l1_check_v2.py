"""Circle4 · L1 检查（新技能 v2 口径）

口径严格来自 Skill/action-card-validation-v2/SKILL.md 五项：
  1 四段结构：frontmatter / 一级标题 / 轴说明 / 一张主表；## 数=0、一级标题=1、分隔行=1
  2 两列：每行严格 2 列
  3 左列帧号：K{n} / 阶段 / 进度%，n 从 0 连续、不跳号
  4 右列五元组：按序 角色 → 武器接触 → 目标 → 位移 → 同步，每段 键=值，；分隔
  5 元信息字段：frontmatter 只含 name / description / source 三键

只做客观判定，不改卡，不做 L2 语义审查。
"""
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CARD = ROOT / "Log" / "Circle4" / "execution-martial-arts-single-palm-push.md"
OUT = ROOT / "Log" / "Circle4" / "l1_result_v2.json"
KEYS = ["角色", "武器接触", "目标", "位移", "同步"]


def main():
    raw = CARD.read_bytes()
    text = raw.decode("utf-8")
    lines = text.splitlines()
    res = {
        "card": str(CARD.relative_to(ROOT)).replace("\\", "/"),
        "skill": "Skill/action-card-validation-v2/SKILL.md",
        "sha256_12": hashlib.sha256(raw).hexdigest()[:12].upper(),
        "bytes": len(raw),
        "lines": len(lines),
        "checks": [],
    }

    # 1 四段结构
    fm = re.match(r"\A---\r?\n(.*?)\r?\n---", text, re.S)
    h1 = [l for l in lines if re.match(r"^#\s+\S", l)]
    h2 = [l for l in lines if re.match(r"^##\s+\S", l)]
    sep = [l for l in lines if re.match(r"^\|\s*-{3,}", l)]
    quote = [l for l in lines if l.startswith(">")]
    res["checks"].append({
        "id": "1", "name": "四段结构",
        "pass": bool(fm) and len(h1) == 1 and len(h2) == 0 and len(sep) == 1 and len(quote) >= 1,
        "detail": {"frontmatter": bool(fm), "h1": len(h1), "h2": len(h2), "h2_lines": h2,
                   "table_separators": len(sep), "axis_quote_lines": len(quote)},
    })

    # 2 两列
    table = [(i + 1, l) for i, l in enumerate(lines)
             if l.startswith("|") and l.endswith("|") and len(l) > 2]
    bad_cols = []
    for lineno, l in table:
        n = len(l.strip().strip("|").split("|"))
        if n != 2:
            bad_cols.append({"lineno": lineno, "cols": n})
    res["checks"].append({"id": "2", "name": "两列", "pass": not bad_cols,
                          "detail": {"table_lines": len(table), "bad": bad_cols}})

    # 取数据行
    sep_idx = next((i for i, (_, l) in enumerate(table) if re.match(r"^\|\s*-{3,}", l)), None)
    rows = []
    if sep_idx is not None:
        for lineno, l in table[sep_idx + 1:]:
            rows.append((lineno, [c.strip() for c in l.strip().strip("|").split("|")]))

    # 3 左列帧号
    frames = []
    fmt_ok = True
    for lineno, cols in rows:
        m = re.match(r"^K(\d+)\s*/\s*(.+?)\s*/\s*(\d+)%\s*$", cols[0])
        if not m:
            fmt_ok = False
        else:
            frames.append(int(m.group(1)))
    seq_ok = frames == list(range(len(frames)))
    res["checks"].append({"id": "3", "name": "左列帧号", "pass": fmt_ok and seq_ok,
                          "detail": {"frames": frames, "format_ok": fmt_ok,
                                     "continuous_from_0": seq_ok}})

    # 4 右列五元组
    frame_detail = []
    ok4 = bool(rows)
    for lineno, cols in rows:
        right = cols[1] if len(cols) > 1 else ""
        segs = [s.strip() for s in right.split("；") if s.strip()]
        keys = [s.split("=", 1)[0].strip() if "=" in s else "(无等号)" for s in segs]
        good = keys == KEYS
        ok4 = ok4 and good
        frame_detail.append({"lineno": lineno, "left": cols[0], "keys": keys,
                             "missing": [k for k in KEYS if k not in keys],
                             "unknown": [k for k in keys if k not in KEYS],
                             "pass": good})
    res["checks"].append({"id": "4", "name": "右列五元组", "pass": ok4,
                          "detail": {"expected": KEYS, "frames": frame_detail}})

    # 5 元信息字段：只允许 name / description / source
    allowed = ["name", "description", "source"]
    fm_keys = []
    fm_indented = []
    if fm:
        for l in fm.group(1).splitlines():
            if not l.strip():
                continue
            m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*):", l)
            if m:
                fm_keys.append(m.group(1))
            elif re.match(r"^\s+\S", l):
                m2 = re.match(r"^\s+([A-Za-z_][A-Za-z0-9_]*):", l)
                if m2:
                    fm_indented.append(m2.group(1))
    extra = [k for k in fm_keys if k not in allowed]
    missing = [k for k in allowed if k not in fm_keys]
    res["checks"].append({
        "id": "5", "name": "元信息字段",
        "pass": not extra and not missing,
        "detail": {"allowed": allowed, "found": fm_keys,
                   "extra": extra, "missing": missing,
                   "indented_subkeys": fm_indented,
                   "note": "顶格书写的 source 子键按顶层键计；缩进子键另列于 indented_subkeys"},
    })

    res["verdict"] = "PASS" if all(c["pass"] for c in res["checks"]) else "FAIL"
    res["fail_checks"] = [c["id"] for c in res["checks"] if not c["pass"]]
    OUT.write_text(json.dumps(res, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(res, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    sys.exit(main())
