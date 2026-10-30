#!/usr/bin/env node
/**
 * verify_translation.mjs — 翻译质量量化（对照人工精译参考）
 *
 * 为什么需要：翻译质量一直是"能看/不能发"的分水岭，但此前只有主观判断。
 * 用参考译文（人工精译）做锚点，算**字符级相似度**（0–1，越高越接近人工），
 * 可以横向比较不同后端/不同前置处理（补标点、术语纠错、精译）的收益。
 *
 * 注意：相似度不是"正确率"，只是"与人工译文的接近程度"；短句、意译差异都会扣分，
 *      所以只用于**同一素材上的相对比较**，并在报告里如实标注。
 *
 * 用法：
 *   node Tool/acceptance/verify_translation.mjs <cues.json> <reference_zh.json> [--json out.json]
 * 输入：cues.json（make_subs 产出，含 sentences[].en/.zh）；reference_zh.json（{sentences:[{idx,en,zh}]}）
 */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
if (args.length < 2) { console.error('用法: node Tool/acceptance/verify_translation.mjs <cues.json> <reference_zh.json> [--json out.json]'); process.exit(2); }
const CUES = JSON.parse(fs.readFileSync(args[0], 'utf8'));
const REF = JSON.parse(fs.readFileSync(args[1], 'utf8'));
const JSON_OUT = args.includes('--json') ? args[args.indexOf('--json') + 1] : '';

const norm = (s) => String(s || '').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
function charSim(a, b) {
  const A = [...norm(a)], B = [...norm(b)];
  if (!A.length && !B.length) return 1;
  if (!A.length || !B.length) return 0;
  const dp = Array.from({ length: A.length + 1 }, () => new Array(B.length + 1).fill(0));
  for (let i = 0; i <= A.length; i++) dp[i][0] = i;
  for (let j = 0; j <= B.length; j++) dp[0][j] = j;
  for (let i = 1; i <= A.length; i++) for (let j = 1; j <= B.length; j++) {
    dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1));
  }
  return 1 - dp[A.length][B.length] / Math.max(A.length, B.length);
}

const mine = (CUES.sentences || []).map((s) => ({ en: s.en, zh: s.zh }));
const ref = (REF.sentences || []).map((s) => ({ idx: s.idx, en: s.en, zh: s.zh }));
const n = Math.min(mine.length, ref.length);
const rows = [];
for (let i = 0; i < n; i++) {
  rows.push({
    idx: i,
    en: mine[i].en,
    mt: mine[i].zh,
    ref: ref[i].zh,
    sim: Number(charSim(mine[i].zh, ref[i].zh).toFixed(3)),
  });
}
const mean = rows.reduce((a, r) => a + r.sim, 0) / Math.max(1, rows.length);

// ---- 字幕质量"缺陷计数"（比相似度更能对账：同义改写不扣分，真错才扣）----
const gloss = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'Tool', 'subtitle', 'glossary_zh.json'), 'utf8')); } catch { return {}; }
})();
// 术语"坏写法"清单 = 术语表里 true-错误形态的键（含 _source_fixes 里 ASR 拆坏的写法，如 "l u fs"）。
// 只比"键≠值"且含字母的键，避免把正常术语（在线视频平台）当成错误。
const errorForms = [
  ...Object.entries(gloss).filter(([k, v]) => !k.startsWith('_') && k !== v && /[A-Za-z]/.test(k)).map(([k]) => k),
  ...Object.keys(gloss._source_fixes || {}),
];
const defects = { missing_end_punct: [], term_errors: [], leftover_english: [], cjk_latin_no_space: [] };
for (const r of rows) {
  const zh = String(r.mt || '');
  if (!/[。？！.?!…]$/.test(zh.trim())) defects.missing_end_punct.push(r.idx + 1);
  // 大小写敏感匹配：正确写法 LUFS 不能被小写的错误写法 lufs 命中（否则自己误报自己）
  for (const bad of errorForms) if (zh.includes(bad)) defects.term_errors.push({ idx: r.idx + 1, term: bad });
  defects.term_errors = defects.term_errors.filter((e, i, a) => a.findIndex((x) => x.idx === e.idx && x.term === e.term) === i);
  const en = (zh.match(/[A-Za-z]{3,}/g) || []).filter((w) => !/^(LUFS|Mbps|APP|AI|OK|PC|TV|USB|CPU|GPU)$/.test(w));
  if (en.length) defects.leftover_english.push({ idx: r.idx + 1, words: en.slice(0, 4) });
  if (/[\u4e00-\u9fff][A-Za-z0-9]|[A-Za-z0-9][\u4e00-\u9fff]/.test(zh)) defects.cjk_latin_no_space.push(r.idx + 1);
}
const worst = [...rows].sort((a, b) => a.sim - b.sim).slice(0, 3);

const result = {
  checked_at: new Date().toISOString(),
  cues: args[0], reference: args[1],
  metric: 'char-level similarity vs human reference (0–1)',
  note: '相似度只表示"与人工译文的接近程度"，不等于正确率；用于同一素材上的相对比较。',
  sentences: rows.length,
  mean_similarity: Number(mean.toFixed(3)),
  defect_counts: {
    missing_end_punct: defects.missing_end_punct.length,
    term_errors: defects.term_errors.length,
    leftover_english: defects.leftover_english.length,
    cjk_latin_no_space: defects.cjk_latin_no_space.length,
  },
  defects,
  per_sentence: rows,
  worst: worst.map((r) => ({ idx: r.idx, sim: r.sim, mt: r.mt, ref: r.ref })),
};
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(result, null, 2));

console.log(`\n=== 翻译质量（对照人工精译）===`);
console.log(`句数 ${rows.length}　平均字符相似度 ${(mean * 100).toFixed(1)}%（仅参考：同义改写也会扣分）`);
console.log(`缺陷：句末缺标点 ${defects.missing_end_punct.length} 句 · 术语错误 ${defects.term_errors.length} 处 · 中文残留英文 ${defects.leftover_english.length} 句 · 中英未加空格 ${defects.cjk_latin_no_space.length} 句`);
for (const r of rows) console.log(`  ${String(r.idx + 1).padStart(2)}. ${(r.sim * 100).toFixed(0).padStart(3)}%  ${r.mt}`);
console.log(`最差 3 句：`);
for (const w of worst) console.log(`  ${w.idx + 1}. ${(w.sim * 100).toFixed(0)}%  机翻：${w.mt}\n        参考：${w.ref}`);
