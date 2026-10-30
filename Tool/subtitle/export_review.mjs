#!/usr/bin/env node
/**
 * export_review.mjs — 把机翻字幕导出成"人能改的校对表"（CSV），并标出机器能自己发现的毛病
 *
 * 为什么要这一步（小循环 8）：
 *   发布级字幕必须人工过一遍译文，但人工改完得能**回写到时间轴**上，否则改了也白改
 *   （`cues.json` 才是剪辑重映射、逐词高亮、烧入的共同输入）。
 *   所以在"机器产出"和"人改"之间加一张表：机器导表 → 人改 zh 列 → apply_review 回写。
 *
 * 导出的 flags 是给人"先看哪里"的提示，不是判定：
 *   cps_over      中文读得太快（> --cps 字/秒）
 *   zh_long       单行过长（> --max-zh 字，成片要换行/可能被裁）
 *   en_residual   中文里还残留英文单词（专名/单位如 LUFS、Mbps 属正常，需人判断）
 *   sp_gap        中文与英文字母/数字之间缺空格（排版问题）
 *   empty_zh      该条没译文
 *   term_missing  英文里出现了术语表里的规范术语，中文里却找不到它（最常见：被行宽切行切断）
 *   term_variant  该术语译成了术语表里记录的错法（如「卢夫斯」）
 *
 * 用法：node Tool/subtitle/export_review.mjs <cues.json> --out <dir> [--cps 20] [--max-zh 18]
 * 输出：<dir>/review.csv（UTF-8 BOM，Excel 直接开不花）、<dir>/review.json（导出元数据）
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../lib/ff.mjs';
import { ts } from '../lib/srt.mjs';
import { csvCell } from '../lib/csv.mjs';

const args = process.argv.slice(2);
if (!args[0]) { console.error('用法: node Tool/subtitle/export_review.mjs <cues.json> --out <dir> [--cps 20] [--max-zh 18] [--glossary x.json]'); process.exit(2); }
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const CUES = path.resolve(args[0]);
const OUT = path.resolve(ROOT, getOpt('--out', path.dirname(CUES)));
const CPS_LIMIT = Number(getOpt('--cps', 20));
const MAX_ZH = Number(getOpt('--max-zh', 18));
const GLOSSARY = path.resolve(ROOT, getOpt('--glossary', path.join('Tool', 'subtitle', 'glossary_zh.json')));

const doc = JSON.parse(fs.readFileSync(CUES, 'utf8'));
const cues = doc.cues || [];
if (!cues.length) { console.error('cues 为空:', CUES); process.exit(1); }

// ---------- 术语一致性审计 ----------
// 机翻最烦人的毛病不是"全错"，而是"同一术语每行翻得不一样"（LUFS / 卢夫斯 / 负十六 LUFS），
// 或者被行宽切坏（`−16 LU` + `FS，…`）。这里用术语表反查：
//   规范写法 = glossary._source_fixes 的值（如 LUFS、Mbps）
//   错误写法 = glossary 里以 CJK 写的键（如「卢夫斯」）→ 出现即 term_variant
//   en 里有该术语但 zh 里找不到规范写法 → term_missing（含"被切行切断"的情况）
const glossary = fs.existsSync(GLOSSARY) ? JSON.parse(fs.readFileSync(GLOSSARY, 'utf8')) : {};
const sourceFixes = glossary._source_fixes || {};
const canonicalTerms = [...new Set(Object.values(sourceFixes).filter((v) => typeof v === 'string' && v.trim()))];
const familyOf = (term) => {
  const t = term.toLowerCase();
  const fam = new Set([t]);
  for (const [bad, good] of Object.entries(sourceFixes)) if (good === term) fam.add(String(bad).toLowerCase());
  return [...fam];
};
const wrongForms = Object.entries(glossary)
  .filter(([k]) => k && !k.startsWith('_') && /[\u4e00-\u9fff]/.test(k))
  .map(([k, v]) => ({ form: k, canonical: v }));
const normalizeTermText = (s) => String(s || '').toLowerCase().replace(/[\s._-]+/g, ' ');
const zhHasCanonical = (zh, term) => normalizeTermText(zh).includes(normalizeTermText(term));

const termStats = {};
const termFlagsOf = (c) => {
  const en = ` ${normalizeTermText(c.en)} `;
  const zh = String(c.zh || '');
  const f = [];
  for (const term of canonicalTerms) {
    const fam = familyOf(term);
    const mentioned = fam.some((k) => en.includes(k));
    if (!mentioned) continue;
    const st = termStats[term] || (termStats[term] = { term, rows_in_en: 0, canonical: 0, variant: 0, missing: 0, variants: {} });
    st.rows_in_en++;
    if (zhHasCanonical(zh, term)) { st.canonical++; continue; }
    const bad = wrongForms.find((w) => zh.includes(w.form) && normalizeTermText(w.canonical) === normalizeTermText(term));
    if (bad) {
      st.variant++;
      st.variants[bad.form] = (st.variants[bad.form] || 0) + 1;
      f.push('term_variant');
      continue;
    }
    st.missing++;
    st.variants['(缺)'] = (st.variants['(缺)'] || 0) + 1;
    f.push('term_missing');
  }
  return f;
};

const zhChars = (s) => [...String(s || '').replace(/\s/g, '')].length;
const flagsOf = (c) => {
  const zh = String(c.zh || '');
  const dur = Math.max(0.2, c.end - c.start);
  const cps = zhChars(zh) / dur;
  const f = [];
  if (!zh.trim()) f.push('empty_zh');
  if (cps > CPS_LIMIT) f.push('cps_over');
  if (zhChars(zh) > MAX_ZH) f.push('zh_long');
  if (/[A-Za-z]{2,}/.test(zh)) f.push('en_residual');
  if (/[\u4e00-\u9fff][A-Za-z0-9]|[A-Za-z0-9][\u4e00-\u9fff]/.test(zh)) f.push('sp_gap');
  for (const t of termFlagsOf(c)) if (!f.includes(t)) f.push(t);
  return { flags: f, cps };
};

const header = ['idx', 'start', 'end', 'en', 'zh', 'cps_zh', 'notes', 'flags', 'reviewer_note'];
const lines = [header.map(csvCell).join(',')];
const rows = [];
cues.forEach((c, i) => {
  const { flags, cps } = flagsOf(c);
  const row = {
    idx: i + 1,
    start: ts(c.start),
    end: ts(c.end),
    en: c.en || '',
    zh: c.zh || '',
    cps_zh: cps.toFixed(1),
    notes: flags.join('|'),
    flags: flags.join('|'),
    reviewer_note: '',
  };
  rows.push(row);
  lines.push(header.map((h) => csvCell(row[h])).join(','));
});

fs.mkdirSync(OUT, { recursive: true });
const csvPath = path.join(OUT, 'review.csv');
fs.writeFileSync(csvPath, '\uFEFF' + lines.join('\r\n') + '\r\n', 'utf8');

const flagCount = {};
for (const r of rows) for (const f of r.flags.split('|').filter(Boolean)) flagCount[f] = (flagCount[f] || 0) + 1;
const meta = {
  generated_at: new Date().toISOString(),
  source_cues: CUES,
  mt_backend: doc.mt_backend || null,
  rows: rows.length,
  params: { cps_limit: CPS_LIMIT, max_zh: MAX_ZH },
  flag_counts: flagCount,
  term_audit: {
    glossary: path.relative(ROOT, GLOSSARY),
    canonical_terms: canonicalTerms,
    stats: Object.values(termStats),
    note: 'term_missing = 英文里出现了该术语但中文里找不到规范写法（常见原因：被行宽切行切断）；term_variant = 译成了术语表里记录的错法。',
  },
  instructions: '只改 zh 列（可留空 reviewer_note 写备注）。不要改 idx/start/end/en，否则回写会被拒绝（时间码可用 --allow-retime 强制接受）。',
};
fs.writeFileSync(path.join(OUT, 'review.json'), JSON.stringify(meta, null, 2));

console.log(`[review] ${rows.length} 条 → ${path.relative(ROOT, csvPath)}`);
const flagText = Object.entries(flagCount).map(([k, v]) => `${k}×${v}`).join(' ') || '无异常标记';
console.log(`[review] 机器标记：${flagText}`);
const termRows = Object.values(termStats).filter((s) => s.rows_in_en);
if (termRows.length) {
  for (const s of termRows) console.log(`[review] 术语 ${s.term}: 出现 ${s.rows_in_en} 行，规范 ${s.canonical} / 错法 ${s.variant} / 缺失 ${s.missing}${Object.keys(s.variants).length ? ' → ' + Object.entries(s.variants).map(([k, v]) => `${k}×${v}`).join(' ') : ''}`);
} else console.log('[review] 术语审计：本片未出现术语表中的规范术语');
