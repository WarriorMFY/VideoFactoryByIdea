#!/usr/bin/env node
/**
 * run_review_acceptance.mjs — 小循环 8 验收：校对回写闭环（导出 → 人改 → 回写 → 重渲染）
 *
 * 四项硬判据（任一不过就是 FAIL，不许口头"应该没问题"）：
 *   1. **恒等回写**：导出后原样回写，cues 与 bilingual.srt 必须逐字节一致（证明导出无损）；
 *   2. **改动生效**：改 4 行译文（含"把跨行切坏的 LUFS 重新拼回"这种真实修法），回写后
 *      只有这 4 行变、其余 12 行一字不动，且 SRT 同步更新；
 *   3. **拒绝危险输入**：删行 / 改时间码 / 清空译文 三种误操作必须被拒绝（exit≠0 + 指明行号），
 *      其中"改时间码"在显式 --allow-retime 时必须放行并记入报告；
 *   4. **回写后还能出片**：用回写后的双语字幕重新烧一版，质检不 FAIL（证明回写产物能直接交付）。
 *
 * 用法：node Tool/acceptance/run_review_acceptance.mjs [--force]
 * 输出：History/runs/l8_review/**、History/loops/loop08/{acceptance.md,metrics.json}
 */
import fs from 'node:fs';
import path from 'node:path';
import { run, ROOT } from '../lib/ff.mjs';
import { readCsv, writeCsv } from '../lib/csv.mjs';

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const SRC_CUES = path.join(ROOT, 'History', 'subs', 'l2_agent', 'cues.json');
const SRC_CLIP = path.join(ROOT, 'History', 'bench', 'l2_en', 'source.mp4');
const RUNDIR = path.join(ROOT, 'History', 'runs', 'l8_review');
const OUTDIR = path.join(ROOT, 'History', 'loops', 'loop08');
const LOGS = path.join(ROOT, 'History', 'runs', '_logs');
for (const d of [RUNDIR, OUTDIR, LOGS]) fs.mkdirSync(d, { recursive: true });
if (!fs.existsSync(SRC_CUES) || !fs.existsSync(SRC_CLIP)) {
  console.error('缺少输入：History/subs/l2_agent/cues.json 或 History/bench/l2_en/source.mp4（先跑 loop6 的 reproduce）');
  process.exit(1);
}

const node = (script, argv, tag, { allowFail = false } = {}) => {
  const r = run(process.execPath, [path.join(ROOT, 'Tool', script), ...argv], path.join(LOGS, `l8_${tag}.log`));
  if (r.status !== 0 && !allowFail) throw new Error(`${script} 失败(${r.status}): ${(r.text || '').split('\n').slice(-4).join(' | ')}`);
  return r;
};
const J = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const step = (m) => console.log(`\n### ${m}`);
const results = {};

// ---------- 1. 导出 ----------
step('1/5 导出校对表');
const EXPORT_DIR = path.join(RUNDIR, 'export');
node('subtitle/export_review.mjs', [SRC_CUES, '--out', EXPORT_DIR], 'export');
const REVIEW_CSV = path.join(EXPORT_DIR, 'review.csv');
const src = J(SRC_CUES);
const meta = J(path.join(EXPORT_DIR, 'review.json'));
const srcSrt = fs.readFileSync(path.join(ROOT, 'History', 'subs', 'l2_agent', 'bilingual.srt'), 'utf8');
console.log(`  导出 ${meta.rows} 行；机器标记 ${JSON.stringify(meta.flag_counts)}`);

// ---------- 2. 恒等回写 ----------
step('2/5 恒等回写（原样不改，必须逐字节一致）');
const ID_DIR = path.join(RUNDIR, 'applied_identity');
node('subtitle/apply_review.mjs', [SRC_CUES, REVIEW_CSV, '--out', ID_DIR], 'apply_identity');
const idCues = J(path.join(ID_DIR, 'cues.json'));
const idSrt = fs.readFileSync(path.join(ID_DIR, 'bilingual.srt'), 'utf8');
const identical = src.cues.length === idCues.cues.length
  && src.cues.every((c, i) => c.zh === idCues.cues[i].zh && c.en === idCues.cues[i].en
    && Math.abs(c.start - idCues.cues[i].start) < 1e-9 && Math.abs(c.end - idCues.cues[i].end) < 1e-9);
const srtIdentical = srcSrt === idSrt;
results.identity = { cues_identical: identical, srt_identical: srtIdentical, rows: idCues.cues.length };
console.log(`  cues 一致=${identical}　bilingual.srt 逐字节一致=${srtIdentical}`);

// ---------- 3. 真实改动回写 ----------
step('3/5 改动回写（4 行：把被行宽切坏的 −16 LUFS 拼回 + 两处措辞收敛）');
const table = readCsv(REVIEW_CSV);
const iIdx = table[0].findIndex((h) => h.trim().toLowerCase() === 'idx');
const iZh = table[0].findIndex((h) => h.trim().toLowerCase() === 'zh');
const iNote = table[0].findIndex((h) => h.trim().toLowerCase() === 'reviewer_note');
const rowOf = (idx) => table.findIndex((r, k) => k > 0 && Number(r[iIdx]) === idx);
// 找出"LUFS 被切成两行"的那对序号（第 9/10 行）
const lu = src.cues.findIndex((c) => /LU$/.test(String(c.zh || '').trim()));
const lu2 = lu + 1;
const EDITS = {};
if (lu > 0 && src.cues[lu2]) {
  // 真实修法：`−16 LUFS` 被行宽切成了 "…−16 LU" + "FS，…" 两行，人工应该把它拼回一条语义完整的行
  EDITS[lu + 1] = '第三，把音频响度归一到';
  EDITS[lu2 + 1] = '−16 LUFS，这是在线视频平台的标准。';
}
EDITS[3] = '今天演示三个小技巧，';
EDITS[12] = '而且别信第一次渲染。';
for (const [idx, zh] of Object.entries(EDITS)) {
  const r = rowOf(Number(idx));
  if (r < 0) { console.log(`  ⚠ 找不到第 ${idx} 行，跳过`); continue; }
  table[r][iZh] = zh;
  if (iNote >= 0) table[r][iNote] = '人工校对示例';
}
const EDITED_CSV = path.join(RUNDIR, 'review_edited.csv');
writeCsv(EDITED_CSV, table);
const ED_DIR = path.join(RUNDIR, 'applied_edited');
node('subtitle/apply_review.mjs', [SRC_CUES, EDITED_CSV, '--out', ED_DIR], 'apply_edited');
const edCues = J(path.join(ED_DIR, 'cues.json'));
const edReport = J(path.join(ED_DIR, 'review_report.json'));
let onlyExpected = true;
const changedIdxs = [];
for (let i = 0; i < src.cues.length; i++) {
  const changed = src.cues[i].zh !== edCues.cues[i].zh;
  if (changed) changedIdxs.push(i + 1);
  const shouldChange = String(i + 1) in EDITS;
  if (changed !== shouldChange) onlyExpected = false;
}
const expectCount = Object.keys(EDITS).length;
results.edits = {
  edits_requested: EDITS, changed_rows: changedIdxs, report_changed: edReport.changed,
  only_expected_rows_changed: onlyExpected, expected_count: expectCount,
};
console.log(`  改动行 ${changedIdxs.join(',')}（期望 ${Object.keys(EDITS).join(',')}）　只有这些行变=${onlyExpected}`);
const edSrt = fs.readFileSync(path.join(ED_DIR, 'bilingual.srt'), 'utf8');
results.edits.srt_updated = edSrt !== srcSrt && Object.values(EDITS).every((zh) => edSrt.includes(zh));
console.log(`  SRT 已同步更新=${results.edits.srt_updated}`);

// ---------- 4. 危险输入必须被拒绝 ----------
step('4/5 危险输入（删行 / 改时间码 / 空译文）');
const negatives = {};
{
  // a) 删掉最后一行
  const drop = path.join(RUNDIR, 'bad_drop_row.csv');
  writeCsv(drop, table.slice(0, -1));
  const r = node('subtitle/apply_review.mjs', [SRC_CUES, drop, '--out', path.join(RUNDIR, 'bad1')], 'bad_drop', { allowFail: true });
  negatives.drop_row = { rejected: r.status !== 0 && !fs.existsSync(path.join(RUNDIR, 'bad1', 'cues.json')), msg: (r.text.match(/行数不一致[^\n]*/) || [''])[0] };
  // b) 改第 2 行的时间码
  const retime = path.join(RUNDIR, 'bad_retime.csv');
  const t2 = table.map((row) => row.slice());
  const r2 = rowOf(2);
  {
    const stamp = t2[0].findIndex((h) => h.trim().toLowerCase() === 'start');
    const [h, m, s] = String(t2[r2][stamp]).split(/[:,.]/);
    t2[r2][stamp] = `${h}:${m}:${String(Number(s) + 1).padStart(2, '0')},000`;
  }
  writeCsv(retime, t2);
  const rr = node('subtitle/apply_review.mjs', [SRC_CUES, retime, '--out', path.join(RUNDIR, 'bad2')], 'bad_retime', { allowFail: true });
  negatives.retime = { rejected: rr.status !== 0, msg: (rr.text.match(/时间码被改动[^\n]*/) || [''])[0] };
  // c) 清空第 3 行译文
  const blank = path.join(RUNDIR, 'bad_blank.csv');
  const t3 = table.map((row) => row.slice());
  t3[rowOf(3)][iZh] = '';
  writeCsv(blank, t3);
  const rb = node('subtitle/apply_review.mjs', [SRC_CUES, blank, '--out', path.join(RUNDIR, 'bad3')], 'bad_blank', { allowFail: true });
  negatives.blank_zh = { rejected: rb.status !== 0, msg: (rb.text.match(/zh 为空[^\n]*/) || [''])[0] };
  // d) 显式放行改时间码
  const OK_DIR = path.join(RUNDIR, 'applied_retime');
  const ok = node('subtitle/apply_review.mjs', [SRC_CUES, retime, '--out', OK_DIR, '--allow-retime'], 'allow_retime', { allowFail: true });
  const okReport = fs.existsSync(path.join(OK_DIR, 'review_report.json')) ? J(path.join(OK_DIR, 'review_report.json')) : null;
  negatives.retime_allowed = { ok: ok.status === 0 && !!okReport && (okReport.retimed || []).length === 1, retimed: okReport?.retimed ?? null };
}
results.negatives = negatives;
for (const [k, v] of Object.entries(negatives)) console.log(`  ${k}: ${JSON.stringify(v)}`);

// ---------- 5. 回写后重新出片 ----------
step('5/5 回写后的字幕重新出片 + 质检');
const RENDER = path.join(RUNDIR, 'final.mp4');
node('edit/vfactory.mjs', [SRC_CLIP, '--out', RUNDIR, '--title', 'loop8 校对回写', '--srt', path.join(ED_DIR, 'bilingual.srt')], 'render');
node('acceptance/qa_report.mjs', [RENDER, '--json', path.join(RUNDIR, 'qa.json')], 'qa', { allowFail: true });
const qa = J(path.join(RUNDIR, 'qa.json'));
results.render = { final_mb: Number((fs.statSync(RENDER).size / 1048576).toFixed(1)), qa_verdict: qa.verdict, lufs: qa.loudness?.integrated_lufs ?? null };
console.log(`  成片 ${results.render.final_mb}MB / QA ${qa.verdict} / ${results.render.lufs} LUFS`);

// ---------- 判定 ----------
const checks = {
  identity_roundtrip: identical && srtIdentical,
  edits_applied_exactly: onlyExpected && results.edits.srt_updated && changedIdxs.length === Object.keys(EDITS).length,
  dangerous_input_rejected: negatives.drop_row.rejected && negatives.retime.rejected && negatives.blank_zh.rejected,
  retime_escape_hatch_ok: negatives.retime_allowed.ok,
  rerender_ok: qa.verdict !== 'FAIL',
};
const pass = Object.values(checks).every(Boolean);
const pct = (v) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`);

const L = [];
L.push('# 小循环 8 · 校对回写闭环验收（自动生成）\n');
L.push(`> 生成时间：${new Date().toISOString()}\n`);
L.push('> 输入：`History/subs/l2_agent/cues.json`（小循环 6 的精译版字幕，13 行）+ `History/bench/l2_en/source.mp4`\n');
L.push('## 判定\n');
L.push(`**${pass ? 'PASS' : 'FAIL'}**\n`);
L.push('| 检查 | 结果 |');
L.push('| --- | --- |');
L.push(`| 恒等回写（导出→不改→回写）cues 一致 | ${identical ? '✅' : '❌'} |`);
L.push(`| 恒等回写 bilingual.srt 逐字节一致 | ${srtIdentical ? '✅' : '❌'} |`);
L.push(`| 改动只落在指定行（${changedIdxs.join(',')}） | ${onlyExpected ? '✅' : '❌'} |`);
L.push(`| SRT 与回写后的 cues 同步 | ${results.edits.srt_updated ? '✅' : '❌'} |`);
L.push(`| 删行被拒绝 | ${negatives.drop_row.rejected ? '✅' : '❌'} |`);
L.push(`| 改时间码被拒绝 | ${negatives.retime.rejected ? '✅' : '❌'} |`);
L.push(`| 清空译文被拒绝 | ${negatives.blank_zh.rejected ? '✅' : '❌'} |`);
L.push(`| \`--allow-retime\` 显式放行并记录 | ${negatives.retime_allowed.ok ? '✅' : '❌'} |`);
L.push(`| 回写后重新出片质检不 FAIL | ${qa.verdict !== 'FAIL' ? `✅（${qa.verdict}，${results.render.lufs} LUFS）` : '❌'} |`);
L.push('');
L.push('## 这次"人改了什么"\n');
L.push('| 行 | 机器产出 | 人工改成 |');
L.push('| --- | --- | --- |');
for (const [idx, zh] of Object.entries(EDITS)) {
  const before = src.cues[Number(idx) - 1]?.zh ?? '';
  L.push(`| ${idx} | ${before} | ${zh} |`);
}
L.push('');
L.push('## 拒绝时的报错（原文）\n');
L.push('```text');
for (const [k, v] of Object.entries(negatives)) if (v.msg) L.push(`[${k}] ${v.msg}`);
L.push('```');
L.push('\n## 复现\n');
L.push('```powershell');
L.push('node Tool\\acceptance\\run_review_acceptance.mjs --force');
L.push('```');
fs.writeFileSync(path.join(OUTDIR, 'acceptance.md'), L.join('\n') + '\n', 'utf8');
fs.writeFileSync(path.join(OUTDIR, 'metrics.json'), JSON.stringify({
  generated_at: new Date().toISOString(), source_cues: path.relative(ROOT, SRC_CUES), clip: path.relative(ROOT, SRC_CLIP),
  export_flags: meta.flag_counts, ...results, checks, pass,
}, null, 2), 'utf8');

console.log(`\n=== 校对回写验收: ${pass ? 'PASS' : 'FAIL'} ===`);
for (const [k, v] of Object.entries(checks)) console.log(`  ${v ? '✅' : '❌'} ${k}`);
console.log(`[acceptance] -> ${path.relative(ROOT, path.join(OUTDIR, 'acceptance.md'))}`);
process.exit(pass ? 0 : 1);
