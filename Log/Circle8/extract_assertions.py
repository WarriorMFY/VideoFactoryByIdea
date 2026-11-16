#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""从 card.md 解析断言清单，按指标类型自动分类。

用法：
    python extract_assertions.py <card.md> [-o out.json]

规格驱动的落点：指标对象不是人想出来的，全部来自卡内表格单元格。
分类规则见 portrait-consistency-metrics.md §2。
"""
import json
import re
import sys
import pathlib

SIDE = re.compile(r"[左右]")
RATIO = re.compile(r"\d+(?:\.\d+)?\s*(?:头高|脸宽|脸高|肩宽|步)")
COLOR = re.compile(r"\d+\s*°|#|明度|色相")


def classify(key, claim):
    """返回指标 ID。左右断言不计指标，只按 spec 全局规则 1 打标（M6 已废除）。"""
    if key == "比例":
        return "M4"
    if key == "颜色":
        return "M3"
    return "M1"


def split_row(row):
    return [c.strip() for c in row.strip().strip("|").split("|")]


def parse(md_path):
    text = pathlib.Path(md_path).read_text(encoding="utf-8")
    body = text.split("---", 2)[2] if text.startswith("---") else text
    rows = [
        ln.strip() for ln in body.splitlines()
        if ln.strip().startswith("|") and not re.match(r"^\|[\s:-]+\|", ln.strip())
    ]
    head, data = split_row(rows[0]), rows[1:]
    items = []
    for r_idx, row in enumerate(data, start=1):
        cells = split_row(row)
        if len(cells) != 2:
            raise SystemExit(f"行 {r_idx} 不是 2 列：{row}")
        part, state = cells
        for seg in re.split(r"[；;]", state):
            if "=" not in seg:
                continue
            key, value = seg.split("=", 1)
            key = key.strip()
            for n, claim in enumerate(re.split(r"[，,]", value.strip()), start=1):
                if not claim.strip():
                    continue
                metric = classify(key, claim)
                items.append({
                    "id": f"R{r_idx}.{key}.{n}",
                    "part": part,
                    "key": key,
                    "claim": claim.strip(),
                    "metric": metric,
                    "rule1_side": bool(SIDE.search(claim)),
                    "measurable": bool(RATIO.search(claim)) if metric == "M4" else metric == "M3",
                })
    return head, items


def report(head, items, md_path):
    from collections import Counter
    cnt = Counter(i["metric"] for i in items)
    print(f"卡文件：{pathlib.Path(md_path).name}")
    print(f"表头：{head[0]} | {head[1]}")
    print(f"断言总数：{len(items)}　分类：" + "　".join(f"{k}={v}" for k, v in sorted(cnt.items())))
    side = [i for i in items if i["rule1_side"]]
    print(f"规则 1 违规（含左右）：{len(side)} 条")
    for i in side:
        print(f"  {i['id']:<14} {i['claim']}")
    print("\n断言清单：")
    print("| 断言 ID | 部位 | 键 | 断言 | 指标 | 规则1 |")
    print("| --- | --- | --- | --- | --- | --- |")
    for i in items:
        print(f"| `{i['id']}` | {i['part']} | {i['key']} | {i['claim']} | {i['metric']} | {'违' if i['rule1_side'] else ''} |")


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    md_path = sys.argv[1]
    out = sys.argv[3] if len(sys.argv) > 3 and sys.argv[2] == "-o" else None
    head, items = parse(md_path)
    report(head, items, md_path)
    if out:
        pathlib.Path(out).write_text(
            json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(f"\n已写出：{out}")


if __name__ == "__main__":
    main()
