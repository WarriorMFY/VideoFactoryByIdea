"""Circle4 · L1 静态结构检查（本轮一次性过程脚本，非通用工具）

沿用被作废的旧 Circle4 轮同名脚本，相对它只改两处：
  1 卡片路径指向本卡 execution-martial-arts-single-palm-push.md（旧卡结论不迁移）
  2 「未停顿」这类否定式会被字面匹配成「停顿」而误报，改为先剔除否定式再查停顿词

口径严格来自 Skill/action-card-validation/SKILL.md §L1 四条：
  1 四段结构：frontmatter / 一级标题 / 轴说明 / 单张主表；h1=1、h2=0、表格分隔行=1
  2 两列 + 左列 K{n}/阶段/进度% + 右列严格五元组定序 角色→武器接触→目标→位移→同步
  3 主体前缀：部位与武器必须带归属
  4 连贯词：声明一气呵成时查真实停顿词（脚落地、重心落定等姿态词不报错）

只做客观事实提取与逐项通过判定，不改卡片，不做 L2 语义审查。
"""
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CARD = ROOT / "Log" / "Circle4" / "execution-martial-arts-single-palm-push.md"
OUT = ROOT / "Log" / "Circle4" / "l1_result.json"

KEYS = ["角色", "武器接触", "目标", "位移", "同步"]
PAUSE_WORDS = ["停住", "稍待", "随即停下", "停顿", "暂停", "稍停", "停下", "稍顿", "顿住"]
NEGATED_PAUSE = ["未停顿", "无停顿", "不停顿", "没有停顿"]
POSTURE_WORDS = ["脚落地", "重心落定", "站稳", "落定", "重心回到", "原地站稳"]
BODY_WORDS = [
    "盾", "剑", "拳", "腕", "爪", "虎口", "双臂", "右臂", "左臂", "肩", "肘",
    "腰", "脚踝", "脚", "腿", "膝", "颈", "咽喉", "喉", "躯干", "头",
    "视线", "防御手", "双手", "左手", "右手", "右脚", "左脚",
]
OWNER = re.compile(r"主体[AB]")


def main():
    raw = CARD.read_bytes()
    text = raw.decode("utf-8")
    lines = text.splitlines()
    result = {
        "card": str(CARD.relative_to(ROOT)).replace("\\", "/"),
        "sha256_12": hashlib.sha256(raw).hexdigest()[:12].upper(),
        "bytes": len(raw),
        "chars": len(text),
        "lines": len(lines),
        "checks": [],
        "advisory": {},
    }

    # ---- L1-1 四段结构 ----
    fm = re.match(r"\A---\r?\n(.*?)\r?\n---", text, re.S)
    h1 = [l for l in lines if re.match(r"^#\s+\S", l)]
    h2 = [l for l in lines if re.match(r"^##\s+\S", l)]
    sep = [l for l in lines if re.match(r"^\|\s*-{3,}", l)]
    quotes = [l for l in lines if l.startswith(">")]
    l1_1 = {
        "frontmatter": bool(fm),
        "h1_count": len(h1),
        "h2_count": len(h2),
        "h2_lines": h2,
        "table_separator_count": len(sep),
        "axis_quote_lines": len(quotes),
        "axis_quote_text": quotes,
    }
    l1_1["pass"] = bool(fm) and len(h1) == 1 and len(h2) == 0 and len(sep) == 1 and len(quotes) >= 1
    result["checks"].append({"id": "L1-1", "name": "四段结构", "pass": l1_1["pass"], "detail": l1_1})

    # ---- 抽取主表 ----
    table_lines = [(i + 1, l) for i, l in enumerate(lines)
                   if l.startswith("|") and l.endswith("|") and len(l) > 2]
    header_idx = next((n for n, (_, l) in enumerate(table_lines)
                       if re.match(r"^\|\s*-{3,}", l)), None)
    data_rows = []
    if header_idx is not None:
        for lineno, l in table_lines[header_idx + 1:]:
            cols = [c.strip() for c in l.strip().strip("|").split("|")]
            data_rows.append({"lineno": lineno, "cols": cols, "raw": l})

    # ---- L1-2 两列 / 左列格式 / 右列五元组定序 ----
    frame_detail = []
    l1_2_ok = len(data_rows) > 0
    seq = []
    for row in data_rows:
        cols = row["cols"]
        left = cols[0] if cols else ""
        right = cols[1] if len(cols) > 1 else ""
        m = re.match(r"^K(\d+)\s*/\s*(.+?)\s*/\s*(\d+)%\s*$", left)
        segments = [s.strip() for s in right.split("；") if s.strip()]
        keys = []
        for s in segments:
            k = s.split("=", 1)[0].strip() if "=" in s else "(无等号)"
            keys.append(k)
        unknown = [k for k in keys if k not in KEYS]
        missing = [k for k in KEYS if k not in keys]
        two_cols = len(cols) == 2
        left_ok = bool(m)
        key_ok = keys == KEYS
        if m:
            seq.append(int(m.group(1)))
        frame_detail.append({
            "lineno": row["lineno"],
            "left": left,
            "left_format_ok": left_ok,
            "column_count": len(cols),
            "keys_in_order": keys,
            "unknown_keys": unknown,
            "missing_keys": missing,
            "key_order_ok": key_ok,
            "pass": two_cols and left_ok and key_ok,
        })
        l1_2_ok = l1_2_ok and two_cols and left_ok and key_ok
    seq_ok = seq == list(range(len(seq)))
    l1_2_ok = l1_2_ok and seq_ok
    result["checks"].append({
        "id": "L1-2", "name": "两列 + 左列 K{n}/阶段/进度% + 右列五元组定序",
        "pass": l1_2_ok,
        "detail": {"expected_keys": KEYS, "frame_sequence": seq,
                   "sequence_continuous_from_0": seq_ok, "frames": frame_detail},
    })

    # ---- L1-3 主体前缀（候选清单，advisory，不自动计入 verdict） ----
    naked = []
    for row in data_rows:
        if len(row["cols"]) < 2:
            continue
        for seg in row["cols"][1].split("；"):
            if "=" not in seg:
                continue
            val = seg.split("=", 1)[1]
            for phrase in re.split(r"[、，,：:（）()；;]", val):
                phrase = phrase.strip().strip("*")
                if not phrase:
                    continue
                if any(w in phrase for w in BODY_WORDS) and not OWNER.search(phrase):
                    naked.append({"lineno": row["lineno"], "phrase": phrase[:60]})
    result["advisory"]["L1-3"] = {
        "name": "主体前缀（部位/武器须带归属）",
        "note": "客观候选：短语含部位或器械词但未出现 主体A/主体B。承前省略是否算违规由日志人工判定，不自动计 FAIL。",
        "naked_candidates": naked,
        "count": len(naked),
    }

    # ---- L1-4 连贯词 ----
    declares = [w for w in ["一气呵成", "单一动力链", "同一拍", "不回收", "不落定"] if w in text]
    negations = [w for w in NEGATED_PAUSE if w in text]
    scan = text
    for w in NEGATED_PAUSE:
        scan = scan.replace(w, "")
    pauses = [w for w in PAUSE_WORDS if w in scan]
    postures = [w for w in POSTURE_WORDS if w in text]
    result["checks"].append({
        "id": "L1-4", "name": "连贯词（一气呵成声明 vs 真实停顿词）",
        "pass": not pauses,
        "detail": {"declarations_found": declares, "pause_words_found": pauses,
                   "negated_phrases_removed": negations,
                   "posture_words_found": postures,
                   "note": "姿态词按 SKILL 不报错；否定式（未停顿）先剔除，不算真实停顿"},
    })

    # ---- 附加发现：card-spec.md 规范层，不属 SKILL L1 四条 ----
    yaml = fm.group(1) if fm else ""
    name = re.search(r"(?m)^name:\s*(\S+)\s*$", yaml)
    typ = re.search(r"(?m)^type:\s*(\S+)\s*$", yaml)
    desc = re.search(r"(?m)^介绍：(.+)$", yaml)
    no_indent = [i + 1 for i, l in enumerate(yaml.splitlines())
                 if l and not l.startswith((" ", "-", "\t")) and ":" not in l.split("：")[0]]
    result["advisory"]["spec_layer"] = {
        "note": "来自 Doc/Cards/00-spec/card-spec.md 与 validate.ps1，不计入 SKILL L1 四条判定",
        "name": name.group(1) if name else None,
        "type": typ.group(1) if typ else None,
        "name_has_type_prefix": bool(name and typ and name.group(1).startswith(typ.group(1) + "-")),
        "intro_char_count": len(desc.group(1)) if desc else None,
        "intro_limit": 40,
        "frontmatter_unindented_lines": no_indent,
    }

    result["verdict"] = "PASS" if all(c["pass"] for c in result["checks"]) else "FAIL"
    result["fail_checks"] = [c["id"] for c in result["checks"] if not c["pass"]]

    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    sys.exit(main())
