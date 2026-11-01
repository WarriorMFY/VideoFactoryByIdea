#!/usr/bin/env node
// trace_text.mjs —— 把 cue 字幕导成「带时间戳的分桶全文」，给写稿的人看
//
// 为什么有它：写摘要稿的原料是官方中文字幕（cues_zh-cn.json），但它是几百条碎 cue，
// 直接看是断句瀑布。loop14 写五条稿时每次都要临时写个 node -e 拼桶 —— 这里固化下来。
//
// 用法：
//   node Tool/ops/trace_text.mjs --dir Workspace/tmp/ted_feifei
//        [--lang zh-cn]       默认 zh-cn，找不到自动退 en
//        [--bucket 45]        每桶秒数（0 = 逐条输出，不合并）
//        [--bilingual]        同一桶里中英并排（要 cues_en.json 与 cues_zh-cn.json 同时存在）
//        [--from 120 --to 300]  只看某段时间
//        [--out trace.txt]    写文件（默认只打印）
//
// 输出形状：
//   [00:45] 五亿四千万年前，海洋里没有一双眼睛。阳光能照进千米深的海底……
//   [01:30] ……
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const flag = (k) => args.includes('--' + k);

const DIR = opt('dir', '');
const CUES = opt('cues', '');
const LANG = opt('lang', 'zh-cn');
const BUCKET = Number(opt('bucket', '45'));
const BILINGUAL = flag('bilingual');
const FROM = opt('from', '') === '' ? -Infinity : Number(opt('from'));
const TO = opt('to', '') === '' ? Infinity : Number(opt('to'));
const OUT = opt('out', '');

const readCues = (p) => {
  if (!p || !fs.existsSync(p)) return null;
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  const arr = Array.isArray(j) ? j : (j.cues || j.sentences || []);
  return Array.isArray(arr) && arr.length ? arr : null;
};

// 定位素材目录与字幕文件
let dir = DIR ? path.resolve(ROOT, DIR) : null;
let zhPath = CUES ? path.resolve(ROOT, CUES) : null;
if (!zhPath) {
  if (!dir) { console.error('需要 --dir <素材目录> 或 --cues <cues.json>'); process.exit(2); }
  const cand = [path.join(dir, `cues_${LANG}.json`), path.join(dir, 'cues_zh-cn.json'), path.join(dir, 'cues_en.json')];
  zhPath = cand.find(p => fs.existsSync(p)) || null;
}
const zh = readCues(zhPath);
if (!zh) { console.error(`找不到可用字幕：${zhPath || '(未指定)'}`); process.exit(1); }

const en = BILINGUAL && dir ? readCues(path.join(dir, 'cues_en.json')) : null;

const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const span = zh.at(-1).end - zh[0].start;

/** 把 en 的 cue 按时间窗塞进同一桶（只取该桶时间范围内的） */
const enIn = (a, b) => (en ? en.filter(c => c.end > a && c.start < b).map(c => c.text).join(' ').trim() : '');

const lines = [];
lines.push(`# ${path.basename(zhPath)}  ${zh.length} 条 / ${fmt(zh[0].start)}–${fmt(zh.at(-1).end)}（${Math.round(span)}s）`);
lines.push('');

if (BUCKET <= 0) {
  for (const c of zh) {
    if (c.start < FROM || c.start > TO) continue;
    lines.push(`[${fmt(c.start)}] ${c.text}`);
    if (en) { const e = enIn(c.start, c.end); if (e) lines.push(`         ${e}`); }
  }
} else {
  let cur = Math.floor(zh[0].start / BUCKET) * BUCKET;
  let buf = [], bufStart = cur;
  const flush = () => {
    if (!buf.length) return;
    if (bufStart + BUCKET > FROM && bufStart <= TO) {
      lines.push(`[${fmt(bufStart)}] ${buf.join('')}`);
      if (en) {
        const e = enIn(bufStart, bufStart + BUCKET);
        if (e) lines.push(`         ${e}`);
      }
      lines.push('');
    }
    buf = [];
  };
  for (const c of zh) {
    const b = Math.floor(c.start / BUCKET) * BUCKET;
    if (b !== cur) { flush(); cur = b; bufStart = b; }
    buf.push(c.text);
  }
  flush();
}

const text = lines.join('\n').trimEnd() + '\n';
if (OUT) {
  const p = path.resolve(ROOT, OUT);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
  console.log(`[trace] ${zh.length} 条 cue → ${path.relative(ROOT, p).replace(/\\/g, '/')}（${lines.length} 行）`);
} else {
  process.stdout.write(text);
}
