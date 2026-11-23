"""Circle27 对照网页生成器：每条实验 = 三联合成图（锚|out1|out2）+ 输入提示词 + 变量说明。

    python make_report.py
产物：Log/Circle27/report.html（相对引用 runs/<id>/sheet.png 与 prompt.txt，直接打开即可）
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent

GROUPS = [
    ("A-base", "基线 · 保持原图（风景）", ["A-base"]),
    ("A-V1", "变量 = 景别（风景）", ["A-V1-远", "A-V1-中", "A-V1-近"]),
    ("A-V2", "变量 = 光线（风景）", ["A-V2-晨", "A-V2-午", "A-V2-昏"]),
    ("A-V3", "变量 = 画风（风景）", ["A-V3-水墨", "A-V3-油画", "A-V3-动漫"]),
    ("B-base", "基线 · 保持原图（人物）", ["B-base"]),
    ("B-V1", "变量 = 景别（人物）", ["B-V1-七分身", "B-V1-半身", "B-V1-胸像"]),
    ("B-V2", "变量 = 光线（人物）", ["B-V2-晨", "B-V2-午", "B-V2-昏"]),
    ("B-V3", "变量 = 表情（人物）", ["B-V3-平静", "B-V3-微笑", "B-V3-惊讶"]),
]


def ledger_state():
    """同 id 取最后一条记录；ok 优先于失败。"""
    out = {}
    for line in (ROOT / "experiments.jsonl").read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        rec = json.loads(line)
        tid = rec.get("id")
        if tid not in out or rec.get("status") == "ok" or out[tid].get("status") != "ok":
            out[tid] = rec
    return out


def metrics_of(tid):
    p = ROOT / "runs" / tid / "metrics.json"
    if not p.exists():
        return {}
    j = json.loads(p.read_text(encoding="utf-8"))
    return {r["file"]: r for r in j["runs"]}


def read_prompt(tid):
    for p in (ROOT / "runs" / tid / "prompt.txt", ROOT / "prompts" / f"{tid}.txt"):
        if p.exists():
            return p.read_text(encoding="utf-8").strip()
    return ""


def case_html(tid, rec):
    run_dir = ROOT / "runs" / tid
    variable = (rec or {}).get("variable") or ""
    level = (rec or {}).get("level") or ""
    tag = f"{variable} = {level}" if variable and variable != "基线" else (level or tid)
    charged = (rec or {}).get("charged")
    cost = f"实扣 {charged:.2f}" if charged is not None else "实扣 —"
    prompt = read_prompt(tid)
    prompt_html = (f'<div class="prompt"><span class="plabel">输入提示词</span>{prompt}</div>'
                   if prompt else "")

    if not (run_dir / "sheet.png").exists():
        err = "805 工作流失败（未扣费）" if rec and rec.get("status") != "ok" else "缺图"
        return f"""
    <article class="card failed">
      <div class="card-head"><span class="lvl">{tid}</span><span class="bad">{err}</span>
        <span class="cost">{cost}</span></div>{prompt_html}
    </article>"""

    m = metrics_of(tid)
    rows = []
    for name in ("out_1.png", "out_2.png"):
        r = m.get(name)
        if r:
            rows.append(f"{name}：ncc {r['ncc_global']:.3f} · ssim {r['ssim_gray']:.3f} · "
                        f"edge {r['edge_ssim']:.3f} · Δluma {r['d_luma_pct']:+.1f}% · "
                        f"Δsat {r['d_sat_pct']:+.1f}% · hist {r['hist_l1']:.3f}")
    metrics_html = f'<div class="metrics">{" ‖ ".join(rows)}</div>' if rows else ""
    return f"""
    <article class="card">
      <div class="card-head"><span class="lvl">{tid}</span><span class="tag">{tag}</span>
        <span class="cost">{cost}</span></div>
      <img class="sheet" src="runs/{tid}/sheet.png" alt="{tid}：锚图 | out_1 | out_2" loading="lazy">
      {metrics_html}{prompt_html}
    </article>"""


def main() -> int:
    state = ledger_state()
    nav = " · ".join(f'<a href="#{g}">{g}</a>' for g, _, _ in GROUPS)
    sections = []
    for gid, title, tids in GROUPS:
        cases = "".join(case_html(t, state.get(t)) for t in tids)
        sections.append(f"""
  <section id="{gid}">
    <h2>{gid} · {title}</h2>{cases}
  </section>""")
    html = f"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Circle27 · 锚图对照报告（Flux3 图生图）</title>
<style>
  :root {{ color-scheme: light; }}
  * {{ box-sizing: border-box; }}
  body {{ margin: 0; font: 14px/1.6 "Segoe UI", "Microsoft YaHei", system-ui, sans-serif;
         color: #1c2430; background: #eef1f4; }}
  header {{ background: #16202c; color: #e8edf3; padding: 26px 32px 20px; }}
  header h1 {{ margin: 0 0 6px; font-size: 21px; font-weight: 650; letter-spacing: .3px; }}
  header .meta {{ margin: 2px 0; color: #9fb0c2; font-size: 13px; }}
  header .conclusion {{ margin: 12px 0 0; padding: 10px 14px; background: #22303f; border-left: 3px solid #d9a441;
                        border-radius: 4px; font-size: 13.5px; }}
  nav {{ position: sticky; top: 0; z-index: 5; background: #ffffffdd; backdrop-filter: blur(6px);
         padding: 10px 32px; border-bottom: 1px solid #d8dee5; font-size: 13px; }}
  nav a {{ color: #245a9c; text-decoration: none; margin-right: 4px; }}
  nav a:hover {{ text-decoration: underline; }}
  main {{ padding: 8px 32px 60px; max-width: 1560px; margin: 0 auto; }}
  section {{ margin-top: 32px; }}
  section h2 {{ font-size: 16px; margin: 0 0 12px; padding: 8px 0 8px 12px; border-left: 4px solid #245a9c;
                background: #ffffff; border-radius: 0 4px 4px 0; }}
  .card {{ background: #fff; border: 1px solid #dfe4ea; border-radius: 8px; padding: 12px 14px 12px;
           margin-bottom: 16px; box-shadow: 0 1px 2px #0000000a; }}
  .card.failed {{ background: #f7f8fa; border-style: dashed; }}
  .card-head {{ display: flex; align-items: baseline; gap: 10px; margin-bottom: 10px; }}
  .lvl {{ font-weight: 650; font-size: 14.5px; }}
  .tag {{ color: #245a9c; background: #e8f0fb; padding: 1px 8px; border-radius: 10px; font-size: 12.5px; }}
  .bad {{ color: #b3261e; background: #fdecea; padding: 1px 8px; border-radius: 10px; font-size: 12.5px; }}
  .cost {{ margin-left: auto; color: #6b7785; font-size: 12.5px; }}
  img.sheet {{ display: block; width: 100%; height: auto; max-height: 560px; object-fit: contain;
               background: #f2f4f6; border: 1px solid #e3e7ec; border-radius: 6px; }}
  .metrics {{ margin-top: 8px; font-size: 12.5px; color: #44505e; background: #f6f8fa;
              border-radius: 4px; padding: 6px 10px; }}
  .prompt {{ margin-top: 8px; font-size: 13px; color: #3d4954; background: #faf7ef;
             border-left: 3px solid #d9a441; border-radius: 0 4px 4px 0; padding: 8px 12px; }}
  .plabel {{ display: inline-block; margin-right: 8px; padding: 0 6px; font-size: 11.5px; font-weight: 650;
             color: #8a6420; background: #f3e8cf; border-radius: 3px; }}
  footer {{ padding: 24px 32px; color: #7d8894; font-size: 12.5px; }}
</style>
</head>
<body>
<header>
  <h1>Circle27 · 锚图对照报告</h1>
  <p class="meta">Flux3 图像编辑（webapp 2114585366186516481）｜每条 = 合成对照图【锚图 | out_1 | out_2】+ 输入提示词</p>
  <p class="meta">15 条成功 / 5 条 805 失败（未扣费）｜实扣 252.45 / 600 积分｜2026-11-23</p>
  <p class="conclusion">结论：大信号可用（黄昏逆光、人物景别推近、表情）；细节光线与风景景别无效；
  身份保持不可用（基线也换脸）；画风三档 805 未测成。</p>
</header>
<nav>{nav}</nav>
<main>{''.join(sections)}
</main>
<footer>合成图与提示词原件：runs/&lt;id&gt;/（sheet.png / prompt.txt / metrics.json）· 完整结论见 实验报告单.md</footer>
</body>
</html>
"""
    out = ROOT / "report.html"
    out.write_text(html, encoding="utf-8")
    print(f"[report] -> {out}  ({len(html)//1024} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
