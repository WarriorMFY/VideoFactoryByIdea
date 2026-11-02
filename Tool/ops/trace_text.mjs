#!/usr/bin/env node
/**
 * trace_text.mjs — 写摘要稿的「原料导出」：碎 cue → 带时间戳的分桶全文
 *
 * 为什么需要：TED 官方字幕是 3-5 秒一条的碎 cue，一条 13 分钟的片子有 200+ 条，
 * 直接读 cue JSON 完全无法通读。写摘要必须先「读懂全片在讲什么」——
 * 这个脚本把同一时间桶内的 cue 拼成一段，带 [mm:ss] 时间戳，人/LLM 才能
 * 按叙事切章节、给每段解说要一个 `src` 帧位。
 *
 * 用法：
 *   node Tool/ops/trace_text.mjs --dir Workspace/tmp/ted_prince --bucket 45
 *        [--bilingual]        中英并排（需要 cues_zh-cn.json）
 *        [--from 120 --to 300] 只导这一段（秒）
 *        [--out <file>]       落盘（默认只打印到 stdout）
 *
 * 桶的口径：按「cue 起点落在哪个桶」归属，桶从 0 开始按 --bucket 秒切。
 * 不做句子重排、不做翻译——原文什么样就什么样，改了就不是"读稿原料"了。
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../lib/ff.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf('--' + k);
  return i >= 0 ? args[i + 1] : d;
};
const flag = (k) => args.includes('--' + k);

const DIR = path.resolve(ROOT, opt('dir', ''));
const BUCKET = Math.max(5, Number(opt('bucket', '45')) || 45);
const BILINGUAL = flag('bilingual');
const FROM = Number(opt('from', '0')) || 0;
const TO = Number(opt('to', '0')) || Infinity;
const OUT = opt('out', '');

if (!DIR) {
  console.error('用法: node Tool/ops/trace_text.mjs --dir <素材目录> [--bucket 45] [--bilingual]');
  process.exit(2);
}

const readCues = (f) => {
  if (!fs.existsSync(f)) return null;
  return JSON.parse(fs.readFileSync(f, 'utf8')).filter((c) => c && typeof c.start === 'number');
};

const en = readCues(path.join(DIR, 'cues_en.json'));
if (!en) {
  console.error(`缺 ${path.join(DIR, 'cues_en.json')}——先用 ted_fetch.mjs / ted_subs.mjs 抓字幕`);
  process.exit(2);
}
const zh = BILINGUAL ? readCues(path.join(DIR, 'cues_zh-cn.json')) : null;
if (BILINGUAL && !zh) {
  console.error('⚠ 没有 cues_zh-cn.json，改回纯英文导出');
}

const mmss = (s) => {
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};
const norm = (t) => String(t).replace(/\s+/g, ' ').trim();

/** 区间内所有 zh cue 的文本（按时间重叠即算，不做精确归属——读稿不求精确） */
function zhIn(a, b) {
  if (!zh) return '';
  return norm(
    zh
      .filter((c) => c.end > a - 0.5 && c.start < b + 0.5)
      .map((c) => c.text)
      .join(' ')
  );
}

const lines = [];
let bucketS = null;
let bucketE = null;
let bufEn = [];

const flush = () => {
  if (bufEn.length === 0) return;
  const head = `[${mmss(bucketS)}–${mmss(bucketE)}]`;
  lines.push(`${head} ${norm(bufEn.join(' '))}`);
  if (BILINGUAL && zh) {
    // 按桶区间一次性取中文：若按每个 en cue 去抓重叠 zh，同一条 zh 会被重复拼 N 次
    const z = zhIn(bucketS, bucketE);
    if (z) lines.push(`${' '.repeat(head.length)} ${z}`);
  }
  lines.push('');
  bufEn = [];
};

for (const c of en) {
  if (c.start < FROM || c.start > TO) continue;
  const b = Math.floor(c.start / BUCKET) * BUCKET;
  if (bucketS === null) {
    bucketS = b;
    bucketE = b + BUCKET;
  } else if (b !== bucketS) {
    flush();
    bucketS = b;
    bucketE = b + BUCKET;
  }
  bufEn.push(c.text);
  bucketE = Math.max(bucketE, c.end);
}
flush();

const span = en.length ? `${mmss(en[0].start)} → ${mmss(en.at(-1).end)}` : '空';
const head = [
  `# ${path.basename(DIR)} 全文（bucket=${BUCKET}s，${span}）`,
  `# cue ${en.length} 条${BILINGUAL && zh ? `｜中译 cue ${zh.length} 条` : ''}${FROM || TO !== Infinity ? `｜截段 ${mmss(FROM)}–${TO === Infinity ? 'END' : mmss(TO)}` : ''}`,
  '',
].join('\n');

const text = head + lines.join('\n');
if (OUT) {
  const p = path.resolve(ROOT, OUT);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
  console.error(`已写 ${path.relative(ROOT, p)}（${lines.filter((l) => l.startsWith('[')).length} 桶）`);
} else {
  process.stdout.write(text);
}
