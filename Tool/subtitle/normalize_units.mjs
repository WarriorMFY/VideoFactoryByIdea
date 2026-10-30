#!/usr/bin/env node
/**
 * normalize_units.mjs — 把"念出来的数值+单位"规范成书写形式（知识型视频的关键一步）
 *
 * 为什么放在**送翻译之前**：机翻看到 `minus sixty sixteen l u fs` 只能逐字翻成"减去六十个十六卢夫斯"；
 * 看到 `−16 LUFS` 才知道这是个响度标准。实测（小循环 6）：术语纠错前该条必错，纠错后必对。
 *
 * 只改 `sentences[].text`（送翻译的句子），**不动 `words[]` 的时间戳**（词级时间给逐词高亮用，
 * 改了文本会对不上原音）；原始的 `text` 完整保留，所以 WER 之类的验收口径不受影响。
 *
 * 用法：
 *   node Tool/subtitle/normalize_units.mjs <transcript.json> --out <norm.json> [--glossary x.json] [--json report.json]
 * 输出：规范化后的 transcript（新增 `sentences[].text_raw`、`normalization` 元数据）+ 可选报告
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../lib/ff.mjs';
import { normalizeSourceText } from '../lib/units.mjs';

const args = process.argv.slice(2);
if (!args[0]) { console.error('用法: node Tool/subtitle/normalize_units.mjs <transcript.json> --out <norm.json> [--glossary x.json] [--json report.json]'); process.exit(2); }
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const SRC = path.resolve(args[0]);
const OUT = path.resolve(ROOT, getOpt('--out', ''));
const GLOSSARY = path.resolve(ROOT, getOpt('--glossary', path.join('Tool', 'subtitle', 'glossary_zh.json')));
const REPORT = getOpt('--json', '');
if (!getOpt('--out', '')) { console.error('必须给 --out'); process.exit(2); }

const tr = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const glossary = fs.existsSync(GLOSSARY) ? JSON.parse(fs.readFileSync(GLOSSARY, 'utf8')) : {};
const sourceFixes = glossary._source_fixes || {};

let changed = 0;
const allChanges = [];
const sentences = (tr.sentences || []).map((s) => {
  const raw = s.text ?? s.en ?? '';
  const { text, changes } = normalizeSourceText(raw, sourceFixes);
  if (changes.length) {
    changed++;
    allChanges.push({ start: s.start, raw, normalized: text, changes });
  }
  return { ...s, text_raw: raw, text };
});

const out = {
  ...tr,
  generated_at: new Date().toISOString(),
  normalized_from: SRC,
  normalization: {
    tool: 'normalize_units.mjs',
    glossary: path.relative(ROOT, GLOSSARY),
    sentences: sentences.length,
    changed,
    substitutions: allChanges.reduce((a, c) => a + c.changes.length, 0),
    changes: allChanges,
  },
  sentences,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
if (REPORT) fs.writeFileSync(path.resolve(ROOT, REPORT), JSON.stringify(out.normalization, null, 2));

console.log(`[norm] ${sentences.length} 句，改动 ${changed} 句 / ${out.normalization.substitutions} 处 → ${path.relative(ROOT, OUT)}`);
for (const c of allChanges.slice(0, 8)) console.log(`   ${c.raw}\n   → ${c.normalized}`);
if (allChanges.length > 8) console.log(`   …（其余 ${allChanges.length - 8} 句见 --json 报告）`);
