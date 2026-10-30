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
if (!args[0]) { console.error('用法: node Tool/subtitle/export_review.mjs <cues.json> --out <dir> [--cps 20] [--max-zh 18]'); process.exit(2); }
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const CUES = path.resolve(args[0]);
const OUT = path.resolve(ROOT, getOpt('--out', path.dirname(CUES)));
const CPS_LIMIT = Number(getOpt('--cps', 20));
const MAX_ZH = Number(getOpt('--max-zh', 18));

const doc = JSON.parse(fs.readFileSync(CUES, 'utf8'));
const cues = doc.cues || [];
if (!cues.length) { console.error('cues 为空:', CUES); process.exit(1); }

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
  instructions: '只改 zh 列（可留空 reviewer_note 写备注）。不要改 idx/start/end/en，否则回写会被拒绝（时间码可用 --allow-retime 强制接受）。',
};
fs.writeFileSync(path.join(OUT, 'review.json'), JSON.stringify(meta, null, 2));

console.log(`[review] ${rows.length} 条 → ${path.relative(ROOT, csvPath)}`);
const flagText = Object.entries(flagCount).map(([k, v]) => `${k}×${v}`).join(' ') || '无异常标记';
console.log(`[review] 机器标记：${flagText}`);
