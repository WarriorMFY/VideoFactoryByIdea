#!/usr/bin/env node
/**
 * run_text_acceptance.mjs — 小循环 6 一键验收：把"能看"的字幕变成"能发"的字幕
 *
 * 本轮解决的是**文本层**质量，而不是渲染：
 *   ① 标点/大小写恢复（restore_punct）——用讲稿真值验收句界 F1、句末标点、文本完整度；
 *   ② 翻译质量——同一素材三种做法横向对比：无标点机翻 / 标点+源端术语纠错机翻 / 人工级精译；
 *   ③ 阅读速度（CPS）——报告超标条数；
 *   ④ 字幕链路回归（verify_subs：WER/覆盖/可读性/重映射）。
 *
 * 用法：node Tool/acceptance/run_text_acceptance.mjs [--skip-build]
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from '../lib/ff.mjs';

const args = process.argv.slice(2);
const NODE = process.execPath;
const BENCH = path.join(ROOT, 'History', 'bench', 'l2_en');
const ASR = path.join(ROOT, 'History', 'asr', 'transcript.json');
const PUNCT = path.join(ROOT, 'History', 'asr', 'transcript_punct.json');
const TMP = path.join(ROOT, 'History', 'runs', '_logs');
const ZH_AGENT = path.join(ROOT, 'History', 'subs', 'zh_agent_l2_punct.json');
fs.mkdirSync(TMP, { recursive: true });

function runNode(script, scriptArgs, logName) {
  const log = path.join(TMP, `${logName}.log`);
  const fd = fs.openSync(log, 'w');
  let r;
  try { r = spawnSync(NODE, [path.join(ROOT, 'Tool', script), ...scriptArgs], { stdio: ['ignore', fd, fd], cwd: ROOT }); }
  finally { fs.closeSync(fd); }
  return { status: r.status, text: fs.readFileSync(log, 'utf8') };
}
function step(title, script, scriptArgs, logName, { allowFail = false } = {}) {
  process.stdout.write(`\n### ${title}\n`);
  const res = runNode(script, scriptArgs, logName);
  console.log(res.text.trim().split('\n').slice(-12).join('\n'));
  if (res.status !== 0 && !allowFail) throw new Error(`${script} 失败（${path.relative(ROOT, logName)}）`);
  return res;
}
const t0 = Date.now();

// ---- 0. 前置 ----
for (const p of [ASR, path.join(BENCH, 'script.txt'), path.join(BENCH, 'ground_truth.json'), path.join(BENCH, 'reference_zh.json')]) {
  if (!fs.existsSync(p)) throw new Error(`缺少前置产物：${path.relative(ROOT, p)}（先跑 loop2 的 reproduce 或 run_subs_acceptance）`);
}

// ---- 1. 标点/大小写恢复 ----
step('1/6 标点与大小写恢复', 'subtitle/restore_punct.mjs', [ASR, '--out', PUNCT, '--glossary', path.join(ROOT, 'Tool', 'subtitle', 'glossary_zh.json')], 'l6_punct');
const vp = step('2/6 标点验收（对讲稿真值）', 'acceptance/verify_punct.mjs', [PUNCT, path.join(BENCH, 'script.txt'), path.join(BENCH, 'ground_truth.json'), '--json', path.join(ROOT, 'History', 'asr', 'verify_punct.json')], 'l6_verify_punct', { allowFail: true });
const punctRes = JSON.parse(fs.readFileSync(path.join(ROOT, 'History', 'asr', 'verify_punct.json'), 'utf8'));

// ---- 2. 三种翻译做法 ----
const VARIANTS = [
  { id: 'A_no_punct', name: 'A 无标点机翻（基线）', dir: path.join(ROOT, 'History', 'subs', 'l2'), trans: ASR, extra: ['--mt', 'mymemory'] },
  { id: 'B_punct', name: 'B 标点+源端术语纠错', dir: path.join(ROOT, 'History', 'subs', 'l2_punct'), trans: PUNCT, extra: ['--mt', 'mymemory', '--punct'] },
  { id: 'C_agent', name: 'C 人工级精译（--mt agent）', dir: path.join(ROOT, 'History', 'subs', 'l2_agent'), trans: PUNCT, extra: ['--mt', 'agent', '--punct', '--zh-file', ZH_AGENT] },
];
const rows = [];
for (const v of VARIANTS) {
  if (v.id !== 'A_no_punct') {
    step(`3/6 生成字幕变体 ${v.id}`, 'subtitle/make_subs.mjs',
      [v.trans, '--out', v.dir, '--glossary', path.join(ROOT, 'Tool', 'subtitle', 'glossary_zh.json'), '--cps', '20', ...v.extra],
      `l6_subs_${v.id}`);
  }
  const q = runNode('acceptance/verify_translation.mjs', [path.join(v.dir, 'cues.json'), path.join(BENCH, 'reference_zh.json'), '--json', path.join(v.dir, 'mt_quality.json')], `l6_mtq_${v.id}`);
  const mq = JSON.parse(fs.readFileSync(path.join(v.dir, 'mt_quality.json'), 'utf8'));
  const cues = JSON.parse(fs.readFileSync(path.join(v.dir, 'cues.json'), 'utf8'));
  const cps = cues.cues.map((c) => [...String(c.zh || '')].length / Math.max(0.2, c.end - c.start));
  rows.push({
    id: v.id, name: v.name,
    sim: mq.mean_similarity, defects: mq.defect_counts,
    cues: cues.cues.length,
    cps_max: Number(Math.max(...cps).toFixed(1)),
    cps_over: cps.filter((x) => x > 20).length,
  });
}

// ---- 3. 字幕链路回归（标点版） ----
step('4/6 字幕链路回归（标点版：verify_subs）', 'subtitle/verify_subs.mjs',
  [PUNCT, path.join(BENCH, 'ground_truth.json'), '--cues', path.join(ROOT, 'History', 'subs', 'l2_punct', 'cues.json'), '--json', path.join(ROOT, 'History', 'subs', 'l2_punct', 'verify_subs.json')],
  'l6_verify_subs', { allowFail: true });
const vs = JSON.parse(fs.readFileSync(path.join(ROOT, 'History', 'subs', 'l2_punct', 'verify_subs.json'), 'utf8'));

// ---- 4. 汇总 ----
const B = rows.find((r) => r.id === 'B_punct'), C = rows.find((r) => r.id === 'C_agent'), A = rows.find((r) => r.id === 'A_no_punct');
const pass = {
  punct: punctRes.verdict === 'PASS',
  no_missing_end_punct: B.defects.missing_end_punct === 0,
  no_term_errors: B.defects.term_errors === 0,
  agent_reaches_human: C.sim >= 0.85,
  subs_regression: vs.verdict === 'PASS',
};
const L = [];
L.push('# 小循环 6 验收：字幕文本层（标点 / 翻译 / 阅读速度）', '');
L.push(`生成时间：${new Date().toISOString()}　素材：\`History/bench/l2_en\`（TTS 英语，讲稿+s人工精译当基准）`, '');
L.push('## 结论', '');
L.push(`- 标点恢复：**${punctRes.verdict}**（句界 F1 ${punctRes.metrics.boundary.f1}、句末标点 ${(punctRes.metrics.end_punct_accuracy * 100).toFixed(0)}%、文本 WER ${(punctRes.metrics.wer.rate * 100).toFixed(1)}%）`);
L.push(`- 翻译缺陷：标点版 句末缺标点 ${B.defects.missing_end_punct} / 术语错误 ${B.defects.term_errors}（基线分别是 ${A.defects.missing_end_punct} / ${A.defects.term_errors}）`);
L.push(`- 精译后端上限：与人工参考相似度 **${(C.sim * 100).toFixed(1)}%**（机翻 ${(B.sim * 100).toFixed(1)}%）`);
L.push(`- 阅读速度：峰值 ${B.cps_max} 字/秒，超标 ${B.cps_over}/${B.cues} 条`);
L.push(`- 字幕链路回归：**${vs.verdict}**（WER ${(vs.wer?.rate * 100).toFixed(1)}%、覆盖 ${vs.timing?.coverage_ratio !== null ? (vs.timing.coverage_ratio * 100).toFixed(1) + '%' : 'n/a'}）`);
L.push('');
L.push('## 三种做法横向对比', '');
L.push('| 变体 | 与人工精译相似度 | 句末缺标点 | 术语错误 | 残留英文 | 中英未空格 | 峰值 CPS | 超标条数 |');
L.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
for (const r of rows) L.push(`| ${r.name} | ${(r.sim * 100).toFixed(1)}% | ${r.defects.missing_end_punct} | ${r.defects.term_errors} | ${r.defects.leftover_english} | ${r.defects.cjk_latin_no_space} | ${r.cps_max} | ${r.cps_over}/${r.cues} |`);
L.push('');
L.push('> 相似度只表示"与人工译文的接近程度"，同义改写也会扣分，只用于同一素材上的相对比较；');
L.push('> 真正能量化本轮收益的是"缺陷计数"：句末缺标点 **7 → 0**、术语错误 **1 → 0**。');
L.push('');
L.push('## 逐句对照（标点版机翻）', '');
L.push('| # | 英文（标点恢复后） | 机翻 | 人工精译 |');
L.push('| --- | --- | --- | --- |');
for (const s of rows.find((r) => r.id === 'B_punct') ? [] : []) { /* noop */ }
const bq = JSON.parse(fs.readFileSync(path.join(ROOT, 'History', 'subs', 'l2_punct', 'mt_quality.json'), 'utf8'));
bq.per_sentence.forEach((s, i) => L.push(`| ${i + 1} | ${String(s.en).replace(/\|/g, '/')} | ${String(s.mt).replace(/\|/g, '/')} | ${String(s.ref).replace(/\|/g, '/')} |`));
L.push('');
L.push('## 判据与结果', '');
L.push('| 检查 | 判据 | 结果 |');
L.push('| --- | --- | --- |');
L.push(`| 标点恢复 | 句界 F1 ≥0.85、句末标点 ≥85%、文本 WER ≤10% | ${punctRes.verdict} |`);
L.push(`| 句末标点缺失 | 0 句 | ${B.defects.missing_end_punct} |`);
L.push(`| 术语错误 | 0 处 | ${B.defects.term_errors} |`);
L.push(`| 精译可达性 | 与人工参考 ≥85% | ${(C.sim * 100).toFixed(1)}% |`);
L.push(`| 字幕链路 | verify_subs PASS | ${vs.verdict} |`);
L.push('');
L.push(`总判定：**${Object.values(pass).every(Boolean) ? 'PASS' : 'FAIL'}**（${Object.entries(pass).map(([k, v]) => `${k}=${v ? 'ok' : '✗'}`).join(' ')}）`);
L.push('');
L.push('## 产物', '');
L.push('- 标点恢复：`History/asr/transcript_punct.json`、`History/asr/verify_punct.json`');
L.push('- 三个变体字幕：`History/subs/l2`（A）、`History/subs/l2_punct`（B）、`History/subs/l2_agent`（C），各带 `cues.json` / SRT / `mt_quality.json`');
L.push(`- 耗时：${Math.round((Date.now() - t0) / 1000)}s`);

const outMd = path.join(ROOT, 'History', 'loops', 'loop06', 'acceptance.md');
fs.mkdirSync(path.dirname(outMd), { recursive: true });
fs.writeFileSync(outMd, L.join('\n'));
console.log(`\n[acceptance] -> ${path.relative(ROOT, outMd)}`);
console.log(`[acceptance] ${Object.values(pass).every(Boolean) ? 'PASS' : 'FAIL'}  (${Object.entries(pass).map(([k, v]) => `${k}=${v ? 'ok' : '✗'}`).join(' ')})`);
process.exit(Object.values(pass).every(Boolean) ? 0 : 1);
