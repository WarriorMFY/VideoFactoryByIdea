#!/usr/bin/env node
/**
 * loop07_rescue_grid.mjs — 小循环 7 调参探针：救援参数对"救回多少真值行 / WER 代价"的影响
 *
 * 只看两件事：救回几条真值行（基线漏 → 救援后覆盖 ≥50%），WER 变差多少。
 * 结果写 History/loops/loop07/rescue_grid.json —— 是选默认参数的依据（同素材调参，存在过拟合风险，报告里要写明）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { run, ROOT } from '../../Tool/lib/ff.mjs';

const CLIP = path.join(ROOT, 'Workspace', 'assets', 'tos_excerpts', 'tos_90s.mp4');
const GT = path.join(ROOT, 'Workspace', 'assets', 'tos_excerpts', 'tos_90s.ground_truth.json');
const OUTDIR = path.join(ROOT, 'History', 'loops', 'loop07');
const BASE = path.join(OUTDIR, 'base.json');
const TMP = path.join(OUTDIR, '_grid');
const LOGS = path.join(ROOT, 'History', 'runs', '_logs');
fs.mkdirSync(TMP, { recursive: true });
fs.mkdirSync(LOGS, { recursive: true });
if (!fs.existsSync(BASE)) { console.error('先跑 run_rescue_acceptance.mjs 生成 base.json'); process.exit(1); }

const COMBOS = [
  { id: 'c045_g10', args: ['--min-conf', '0.45', '--gap-s', '1.0'] },
  { id: 'c040_g10', args: ['--min-conf', '0.40', '--gap-s', '1.0'] },
  { id: 'c030_g10', args: ['--min-conf', '0.30', '--gap-s', '1.0'] },
  { id: 'c040_g15', args: ['--min-conf', '0.40', '--gap-s', '1.5'] },
  { id: 'c040_g08', args: ['--min-conf', '0.40', '--gap-s', '0.8'] },
  { id: 'c030_g15_p40', args: ['--min-conf', '0.30', '--gap-s', '1.5', '--pad', '0.40'] },
  { id: 'c035_g12_w120', args: ['--min-conf', '0.35', '--gap-s', '1.2', '--max-windows', '120'] },
];

const gt = JSON.parse(fs.readFileSync(GT, 'utf8'));
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
function buckets(verify) {
  const lines = (gt.sentences || []).map((g, i) => ({
    words: String(g.text).split(/\s+/).filter(Boolean).length,
    text: g.text,
    covered: verify.timing?.sentences?.[i]?.covered_ratio ?? null,
  }));
  const b = (lo, hi) => {
    const arr = lines.filter((l) => l.words >= lo && l.words <= hi && l.covered != null);
    if (!arr.length) return { n: 0, cov: null };
    return { n: arr.length, cov: Number((arr.reduce((a, l) => a + l.covered, 0) / arr.length).toFixed(3)) };
  };
  return { lines, short: b(1, 3), mid: b(4, 8), long: b(9, 999) };
}

const baseV = path.join(TMP, 'verify_base.json');
run(process.execPath, [path.join(ROOT, 'Tool', 'subtitle', 'verify_subs.mjs'), BASE, GT, '--json', baseV], path.join(LOGS, 'l7_grid_verify_base.log'));
const bb = buckets(readJson(baseV));
const baseWer = readJson(baseV).wer?.rate ?? null;
const recoveredBase = new Set(bb.lines.map((l, i) => (l.covered != null && l.covered < 0.2 ? i : -1)).filter((i) => i >= 0));

const rows = [];
for (const c of COMBOS) {
  const out = path.join(TMP, `${c.id}.json`);
  const r0 = run(process.execPath, [path.join(ROOT, 'Tool', 'subtitle', 'asr_rescue.mjs'), CLIP,
    '--transcript', BASE, '--out', out, ...c.args], path.join(LOGS, `l7_grid_${c.id}.log`));
  if (r0.status !== 0) { rows.push({ id: c.id, error: String(r0.text).split('\n').slice(-3).join(' | ') }); console.log(`[${c.id}] 失败`); continue; }
  const res = readJson(out);
  const vOut = path.join(TMP, `${c.id}.verify.json`);
  run(process.execPath, [path.join(ROOT, 'Tool', 'subtitle', 'verify_subs.mjs'), out, GT, '--json', vOut], path.join(LOGS, `l7_grid_verify_${c.id}.log`));
  const v = readJson(vOut);
  const br = buckets(v);
  const recovered = [...recoveredBase].filter((i) => (br.lines[i].covered ?? 0) >= 0.5).map((i) => br.lines[i].text);
  const broken = bb.lines.map((l, i) => i).filter((i) => (bb.lines[i].covered ?? 0) >= 0.5 && (br.lines[i].covered ?? 0) < 0.2).map((i) => br.lines[i].text);
  const row = {
    id: c.id, args: c.args,
    words: res.words.length, added: res.rescue.words_added,
    windows: res.rescue.windows_tried, empty: res.rescue.windows_empty,
    wer: v.wer?.rate ?? null, coverage: v.timing?.coverage_ratio ?? null,
    short: br.short, mid: br.mid, long: br.long,
    dShort: br.short.cov != null && bb.short.cov != null ? Number((br.short.cov - bb.short.cov).toFixed(3)) : null,
    dWer: v.wer?.rate != null && baseWer != null ? Number((v.wer.rate - baseWer).toFixed(3)) : null,
    recovered, broken,
    addedWords: (res.rescue.added_words || []).map((w) => `${w.word}@${w.start}`),
  };
  rows.push(row);
  console.log(`[${c.id}] words ${row.words} (+${row.added}) WER ${(row.wer * 100).toFixed(1)}% (${row.dWer >= 0 ? '+' : ''}${(row.dWer * 100).toFixed(1)}pp) 短句覆盖 ${row.short.cov != null ? (row.short.cov * 100).toFixed(1) + '%' : '—'} (${row.dShort != null ? (row.dShort >= 0 ? '+' : '') + (row.dShort * 100).toFixed(1) + 'pp' : '—'}) 救回 ${recovered.length} 条 ${recovered.length ? '[' + recovered.join(' / ') + ']' : ''}${broken.length ? ' 搞坏 ' + broken.length : ''}`);
}

fs.writeFileSync(path.join(OUTDIR, 'rescue_grid.json'), JSON.stringify({
  generated_at: new Date().toISOString(),
  base: { words: readJson(BASE).words.length, wer: baseWer, short: bb.short, mid: bb.mid, long: bb.long },
  combos: rows,
}, null, 2));
console.log('\n[grid] -> History/loops/loop07/rescue_grid.json');
