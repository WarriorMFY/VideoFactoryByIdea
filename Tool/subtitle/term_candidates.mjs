#!/usr/bin/env node
/**
 * term_candidates.mjs — 从字幕/转录里"自动挑出该进术语表的词"（知识型内容的关键）
 *
 * 为什么需要：知识型视频里，术语一致性是"发布级"的硬指标（LUFS 不能一处 LUFS、一处卢夫斯），
 * 但**没人愿意手工翻全片找术语**。这里用可计算的规则挑候选：
 *   1. 缩写（≥2 个连续大写字母，如 LUFS/Mbps/GPU/API/4K60）；
 *   2. 专名（连续的大写开头词，如 "Blender Foundation"、"Tears of Steel"）；
 *   3. 数字+单位（16 LUFS、15 Mbps、60 fps、1080p）；
 *   4. 高频长词（出现 ≥3 次、长度 ≥ 6、非停用词）—— 往往是领域名词。
 *
 * 输出一份"候选术语清单"，人只需给中文写法（或确认为"不译"），再回填到 glossary_zh.json。
 * 这也是知识型内容从"能看懂"走向"能发布"的最短路径之一。
 *
 * 用法：node Tool/subtitle/term_candidates.mjs <transcript.json|srt> [--out cand.json] [--min-count 2] [--glossary x.json]
 * 输出：`{ generated_at, input, total_words, candidates: [{term, count, kind, in_glossary, examples[]}] }`
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../lib/ff.mjs';

const args = process.argv.slice(2);
if (!args[0]) { console.error('用法: node Tool/subtitle/term_candidates.mjs <transcript.json> [--out cand.json] [--min-count 2] [--glossary x.json]'); process.exit(2); }
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const SRC = path.resolve(args[0]);
const OUT = path.resolve(ROOT, getOpt('--out', path.join('History', 'asr', 'term_candidates.json')));
const MIN_COUNT = Number(getOpt('--min-count', 2));
const GLOSSARY = path.resolve(ROOT, getOpt('--glossary', path.join('Tool', 'subtitle', 'glossary_zh.json')));

/** 读出句子列表：支持 transcript.json 与 .srt */
function loadSentences(file) {
  const raw = fs.readFileSync(file, 'utf8');
  if (/\.srt$/i.test(file)) {
    const blocks = raw.replace(/\r/g, '').split(/\n{2,}/);
    return blocks.map((b) => b.split('\n').filter((l) => l && !/^\d+$/.test(l) && !l.includes('-->')).join(' ')).filter(Boolean);
  }
  const tr = JSON.parse(raw);
  if (Array.isArray(tr.sentences) && tr.sentences.length) return tr.sentences.map((s) => s.text ?? s.en ?? '');
  if (Array.isArray(tr.cues) && tr.cues.length) return tr.cues.map((c) => c.en ?? c.zh ?? '');
  if (typeof tr.text === 'string') return tr.text.split(/(?<=[.!?])\s+/);
  return [];
}

const sentences = loadSentences(SRC);
const glossary = fs.existsSync(GLOSSARY) ? JSON.parse(fs.readFileSync(GLOSSARY, 'utf8')) : {};
const glossaryKeys = Object.keys(glossary).filter((k) => k && !k.startsWith('_')).map((k) => k.toLowerCase());
const sourceFixes = Object.values(glossary._source_fixes || {}).map((v) => String(v).toLowerCase());

const STOP = new Set(['the', 'and', 'that', 'this', 'with', 'from', 'your', 'have', 'will', 'they', 'them', 'there', 'their',
  'what', 'when', 'which', 'about', 'into', 'than', 'then', 'just', 'like', 'also', 'because', 'before', 'after', 'video',
  'videos', 'make', 'makes', 'made', 'using', 'used', 'very', 'really', 'never', 'always', 'first', 'second', 'third',
  'finally', 'simple', 'tricks', 'time', 'time', 'would', 'could', 'should', 'something', 'everything', 'anyone']);

const counts = new Map();   // term -> {count, kind, examples:Set}
const bump = (term, kind, sentence) => {
  const key = term;
  const cur = counts.get(key) || { term: key, count: 0, kinds: new Set(), examples: [] };
  cur.count++;
  cur.kinds.add(kind);
  if (cur.examples.length < 3 && !cur.examples.includes(sentence)) cur.examples.push(sentence);
  counts.set(key, cur);
};
const normSentence = (s) => String(s || '').replace(/\s+/g, ' ').trim();

for (const sRaw of sentences) {
  const s = normSentence(sRaw);
  if (!s) continue;
  // 1) 缩写 / 数字单位
  for (const m of s.matchAll(/\b(?:[A-Z]{2,6}(?:\d+)?|[0-9]+(?:\.[0-9]+)?\s?(?:LUFS|dB|Mbps|fps|K|p|Hz|kHz|fps))\b/g)) {
    const t = m[0].trim();
    if (t.length >= 2) bump(t, 'acronym_or_unit', s);
  }
  // 2) 专名（连续大写开头词，2–4 个词）
  for (const m of s.matchAll(/\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){0,3})\b/g)) {
    const t = m[1];
    if (STOP.has(t.toLowerCase())) continue;
    bump(t, 'proper_noun', s);
  }
  // 3) 高频长词（先按词统计，后面再过滤）
  for (const w of s.matchAll(/\b[a-z][a-z']{5,}\b/gi)) {
    const t = w[0];
    if (/['’]/.test(t)) continue;                 // 缩略词（you're/that's）不是术语
    if (STOP.has(t.toLowerCase())) continue;
    bump(t.toLowerCase(), 'frequent_word', s);
  }
  // 4) 高频二元短语（"main engine" / "robot hand" 这类多词术语）
  const toks = s.split(/\s+/);
  for (let i = 0; i + 1 < toks.length; i++) {
    const a = toks[i].replace(/[^A-Za-z'-]/g, '');
    const b = toks[i + 1].replace(/[^A-Za-z'-]/g, '');
    if (!a || !b) continue;
    if (STOP.has(a.toLowerCase()) || STOP.has(b.toLowerCase())) continue;
    if (/['’]/.test(a + b)) continue;
    if (a.length < 4 || b.length < 4) continue;
    bump(`${a} ${b}`, 'phrase', s);
  }
}

const candidates = [...counts.values()]
  .map((c) => ({
    term: c.term,
    count: c.count,
    kind: c.kinds.has('acronym_or_unit') ? 'acronym_or_unit'
      : c.kinds.has('proper_noun') ? 'proper_noun'
        : c.kinds.has('phrase') ? 'phrase' : 'frequent_word',
    in_glossary: glossaryKeys.includes(c.term.toLowerCase()) || sourceFixes.includes(c.term.toLowerCase()),
    examples: c.examples,
  }))
  .filter((c) => c.count >= MIN_COUNT || c.kind === 'acronym_or_unit')
  .sort((a, b) => (a.in_glossary === b.in_glossary ? b.count - a.count : a.in_glossary ? 1 : -1));

const out = {
  generated_at: new Date().toISOString(),
  input: path.relative(ROOT, SRC),
  sentences: sentences.length,
  total_words: sentences.reduce((a, s) => a + String(s).split(/\s+/).filter(Boolean).length, 0),
  glossary: path.relative(ROOT, GLOSSARY),
  candidates,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));

console.log(`[term] ${sentences.length} 句 / 约 ${out.total_words} 词 → 候选术语 ${candidates.length} 个（未入术语表 ${candidates.filter((c) => !c.in_glossary).length}）`);
for (const c of candidates.slice(0, 12)) console.log(`   ${c.in_glossary ? '✓' : '+'} ${c.term}  ×${c.count}  [${c.kind}]`);
console.log(`[term] -> ${path.relative(ROOT, OUT)}`);
