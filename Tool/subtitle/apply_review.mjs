#!/usr/bin/env node
/**
 * apply_review.mjs — 把人工改过的校对表回写到时间轴（cues.json + SRT），并说清改了什么
 *
 * 设计原则：**宁可报错，不要静默错位**。
 *   字幕表看着是"一堆文字"，但左边两列是时间码。人一旦不小心把行删了/排序了/改了时间，
 *   静默接受就会让后面所有字幕整体错位 —— 这种错误在成片里极难发现，所以这里逐项校验：
 *     · 行数必须一致（缺行/多行都拒）
 *     · idx 必须 1..N 顺序（Excel 排序过就拒）
 *     · start/end 必须与原 cues 完全一致（可用 --allow-retime 显式放开，并在报告里记下）
 *     · en 必须没被改动（可用 --allow-en-edit 放开；en 是重映射与高亮的锚点，改了会错位）
 *     · zh 不允许整行为空（空就是漏译，不是"不要译文"）
 *   全部通过才写回；任何一条不合格 → 列出具体行号与原因，exit 1，不产出半成品。
 *
 * 用法：node Tool/subtitle/apply_review.mjs <cues.json> <review.csv> --out <dir>
 *        [--allow-retime] [--allow-en-edit]
 * 输出：<dir>/cues.json（回写后，带 review 元数据）、<dir>/{en,zh,bilingual}.srt、<dir>/review_report.json
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT } from '../lib/ff.mjs';
import { parseTs, writeSrtSet } from '../lib/srt.mjs';

const args = process.argv.slice(2);
if (args.length < 2) { console.error('用法: node Tool/subtitle/apply_review.mjs <cues.json> <review.csv> --out <dir> [--allow-retime] [--allow-en-edit]'); process.exit(2); }
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const SRC = path.resolve(args[0]);
const CSV = path.resolve(args[1]);
const OUT = path.resolve(ROOT, getOpt('--out', path.dirname(SRC)));
const ALLOW_RETIME = args.includes('--allow-retime');
const ALLOW_EN = args.includes('--allow-en-edit');

/** CSV 解析在 lib/csv.mjs（与 export_review 共用同一份实现，避免"导出/回写"两套口径） */
import { readCsv, csvCell as _csvCell } from '../lib/csv.mjs';

const doc = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const cues = doc.cues || [];
const table = readCsv(CSV);
if (table.length < 2) { console.error('CSV 没有数据行'); process.exit(1); }
const header = table[0].map((h) => h.trim().toLowerCase());
const col = (name) => {
  const i = header.indexOf(name);
  if (i < 0) { console.error(`CSV 缺少列 "${name}"（当前列：${header.join(', ')}）`); process.exit(1); }
  return i;
};
const iIdx = col('idx'), iStart = col('start'), iEnd = col('end'), iEn = col('en'), iZh = col('zh');
const iNote = header.indexOf('reviewer_note');

const errors = [];
const dataRows = table.slice(1);
if (dataRows.length !== cues.length) {
  errors.push(`行数不一致：cues ${cues.length} 行 vs CSV ${dataRows.length} 行（是不是删了/多了一行？）`);
}
const applied = [];
const retimed = [];
const enEdited = [];
let changed = 0;
let charDelta = 0;

for (let k = 0; k < Math.min(dataRows.length, cues.length); k++) {
  const r = dataRows[k];
  const c = cues[k];
  const idx = Number(String(r[iIdx] || '').trim());
  const label = `第 ${k + 1} 行（idx=${r[iIdx]}）`;
  if (idx !== k + 1) { errors.push(`${label}：idx 不是 ${k + 1}（表格被排序/删插过行？）`); continue; }
  const st = parseTs(r[iStart]), en = parseTs(r[iEnd]);
  if (st == null || en == null) { errors.push(`${label}：时间码无法解析（"${r[iStart]}" / "${r[iEnd]}"）`); continue; }
  if (!ALLOW_RETIME) {
    if (Math.abs(st - c.start) > 0.0015 || Math.abs(en - c.end) > 0.0015) {
      errors.push(`${label}：时间码被改动（${c.start}→${st} / ${c.end}→${en}）；确认要新时间码请加 --allow-retime`);
      continue;
    }
  } else if (Math.abs(st - c.start) > 0.0015 || Math.abs(en - c.end) > 0.0015) {
    retimed.push({ idx: idx, from: [c.start, c.end], to: [st, en] });
  }
  const zh = String(r[iZh] || '').trim();
  if (!zh) { errors.push(`${label}：zh 为空（漏译必须显式写内容，不能留空）`); continue; }
  const enText = String(r[iEn] || '').trim();
  if (!ALLOW_EN && enText !== String(c.en || '').trim()) {
    errors.push(`${label}：en 被改动（en 是重映射/高亮的锚点，请只改 zh）`);
    continue;
  }
  if (ALLOW_EN && enText !== String(c.en || '').trim()) enEdited.push({ idx, from: c.en, to: enText });
  const before = String(c.zh || '');
  if (before !== zh) { changed++; charDelta += [...zh].length - [...before].length; }
  applied.push({
    ...c,
    start: ALLOW_RETIME ? st : c.start,
    end: ALLOW_RETIME ? en : c.end,
    en: ALLOW_EN ? enText : c.en,
    zh,
    reviewer_note: iNote >= 0 ? String(r[iNote] || '') : undefined,
    zh_machine: before !== zh ? before : undefined,
  });
}

if (errors.length) {
  console.error(`\n[review] 回写被拒绝（${errors.length} 个问题，未产出任何文件）：`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}

fs.mkdirSync(OUT, { recursive: true });
const report = {
  generated_at: new Date().toISOString(),
  source_cues: SRC,
  review_csv: CSV,
  cues_sha256: crypto.createHash('sha256').update(fs.readFileSync(SRC)).digest('hex').slice(0, 16),
  rows: applied.length,
  changed,
  char_delta: charDelta,
  retimed,
  en_edited: enEdited,
  checks: { row_count: true, idx_order: true, timing_locked: !ALLOW_RETIME, en_locked: !ALLOW_EN, zh_non_empty: true },
};
const outCues = {
  ...doc,
  generated_at: new Date().toISOString(),
  review: report,
  cues: applied,
};
fs.writeFileSync(path.join(OUT, 'cues.json'), JSON.stringify(outCues, null, 2));
writeSrtSet(applied, OUT, { mt: doc.mt_backend || 'mymemory' });
fs.writeFileSync(path.join(OUT, 'review_report.json'), JSON.stringify(report, null, 2));

console.log(`[review] 回写 ${applied.length} 行，改动 ${changed} 行（净 ${charDelta >= 0 ? '+' : ''}${charDelta} 字）`);
if (retimed.length) console.log(`[review] ⚠ 时间码被改动 ${retimed.length} 行（--allow-retime）`);
if (enEdited.length) console.log(`[review] ⚠ 原文被改动 ${enEdited.length} 行（--allow-en-edit）`);
for (const c of applied.filter((x) => x.zh_machine)) console.log(`   #${applied.indexOf(c) + 1}  ${c.zh_machine}\n        → ${c.zh}`);
console.log(`[review] -> ${path.relative(ROOT, OUT)}`);
