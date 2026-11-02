#!/usr/bin/env node
/**
 * make_opus_cards.mjs — 生成 B 站「图文动态」用竖版卡片（1080×1440）
 *
 * 为什么单独写：封面工具（make_cover）只支持「角标 + 两行主标题 + 单行副标题」，
 * 装不下动态需要的多行要点；动态是竖图，版式也完全不同。
 *
 * 用法：
 *   node Tool/ops/make_opus_cards.mjs --spec <cards.json> [--out Prototype/xxx/cards]
 *
 * spec 结构：
 * {
 *   "video": "Prototype/ep_x/final.mp4",
 *   "cards": [
 *     { "at": 12, "kicker": "TED 2024 · 李飞飞",
 *       "headline": ["看见不等于理解", "AI 缺的是空间智能"],
 *       "bullets": ["5.4 亿年前第一双眼睛…"],
 *       "footer": "完整版 15:02 ｜ 3 分钟摘要见评论区" }
 *   ]
 * }
 *
 * 依赖：ffmpeg 走 lib/ff.mjs（自带 fontconfig 与 SimHei），不新增依赖。
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, ffmpeg } from '../lib/ff.mjs';

const W = 1080;
const H = 1440;
const FRAME_H = 760;
const PAD = 72;
const PANEL_TOP = FRAME_H;
const C = { panel: '#14121A', yellow: '#FFD84D', white: '#E8E6EF', gray: '#8A8798', teal: '#7FE9D5' };

const esc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/:/g, '\\:').replace(/%/g, '\\%');

/** 视觉宽度：CJK 记 1.0，拉丁/数字记 0.55（与封面工具同一经验公式） */
const vw = (s) => [...String(s)].reduce((a, c) => a + (/[\u3000-\u9fff\uff00-\uffef]/.test(c) ? 1 : 0.55), 0);
/** 按视觉宽度折行，返回行数组 */
function wrap(text, fontsize, avail) {
  const maxUnits = avail / fontsize;
  const out = [];
  let cur = '';
  let units = 0;
  for (const ch of String(text)) {
    const w = /[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? 1 : 0.55;
    if (units + w > maxUnits && cur) { out.push(cur); cur = ''; units = 0; }
    cur += ch;
    units += w;
  }
  if (cur) out.push(cur);
  return out;
}
/** 找能放下的最大字号（下限 min），保证标题不被裁切 */
function fitSize(lines, maxSize, minSize, avail) {
  for (let f = maxSize; f >= minSize; f -= 2) {
    if (lines.every((l) => vw(l) * f <= avail)) return f;
  }
  return minSize;
}

const args = process.argv.slice(2);
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const SPEC = getOpt('--spec', '');
if (!SPEC) { console.error('用法: node Tool/ops/make_opus_cards.mjs --spec <cards.json> [--out dir]'); process.exit(2); }

const specPath = path.resolve(ROOT, SPEC);
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
const VIDEO = spec.video ? path.resolve(ROOT, spec.video) : '';
const OUT = path.resolve(ROOT, getOpt('--out', path.join(path.dirname(SPEC), 'cards')));
fs.mkdirSync(OUT, { recursive: true });
const LOG = path.join(ROOT, 'History', 'runs', '_logs', 'cards.log');

const strip = (s) => String(s ?? '').replace(/[\r\n]+/g, ' ').trim();
const avail = W - PAD * 2;
const made = [];

for (const [i, card] of (spec.cards || []).entries()) {
  const name = `card_${String(i + 1).padStart(2, '0')}.jpg`;
  const out = path.join(OUT, name);

  // 两种画面来源：video+at（现场抽帧）或 frame（现成图片，如 HLS 定点抓帧产物）
  let frame;
  if (card.frame) {
    frame = path.resolve(ROOT, card.frame);
    if (!fs.existsSync(frame)) { console.error(`frame 不存在: ${frame}`); process.exit(1); }
  } else {
    frame = path.join(OUT, `.f${i}.jpg`);
    const rf = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(card.at ?? 0), '-i', VIDEO,
      '-frames:v', '1', '-update', '1', '-q:v', '2', frame], LOG);
    if (rf.status !== 0 || !fs.existsSync(frame)) { console.error(`抽帧失败 @${card.at}`); process.exit(1); }
  }

  const inputs = ['-i', frame, '-f', 'lavfi', '-i', `color=c=${C.panel}:s=${W}x${H - FRAME_H}`];
  const parts = [];
  // 顶部画面：等比填满后裁切，轻微压暗以便叠加文字
  parts.push(`[0:v]scale=${W}:${FRAME_H}:force_original_aspect_ratio=increase,crop=${W}:${FRAME_H},eq=brightness=-0.04[top]`);
  parts.push('[1:v]null[bot]');
  parts.push('[top][bot]vstack=inputs=2[base]');

  const texts = [];
  // 顶部渐变遮罩（让画面下缘与深色面板过渡）
  const fadeH = 180;
  parts.push(`[base]drawbox=x=0:y=${PANEL_TOP - fadeH}:w=${W}:h=${fadeH}:color=black@0.45:t=fill[base]`);
  // 左侧强调竖条
  parts.push(`[base]drawbox=x=0:y=${PANEL_TOP}:w=6:h=${H - PANEL_TOP}:color=${C.yellow}@0.9:t=fill[base]`);

  let y = PANEL_TOP + 64;
  if (card.kicker) {
    texts.push(`drawtext=font=SimHei:expansion=none:text='${esc(strip(card.kicker))}':fontsize=34:fontcolor=${C.teal}:x=${PAD}:y=${y}`);
    y += 66;
  }
  const head = (card.headline || []).map(strip).filter(Boolean).slice(0, 2);
  if (head.length) {
    const fs2 = fitSize(head, card.big ? 96 : 78, 52, avail);
    const lh = Math.round(fs2 * 1.16);
    head.forEach((ln) => {
      texts.push(`drawtext=font=SimHei:expansion=none:text='${esc(ln)}':fontsize=${fs2}:fontcolor=${C.yellow}:borderw=3:bordercolor=black@0.75:x=${PAD}:y=${y}`);
      y += lh;
    });
    y += 26;
  }
  const bodyFs = 40;
  for (const b of (card.bullets || [])) {
    const raw = strip(b);
    if (!raw) continue;
    const lines = wrap(raw, bodyFs, avail);
    lines.forEach((ln, k) => {
      const prefix = k === 0 ? '· ' : '  ';
      texts.push(`drawtext=font=SimHei:expansion=none:text='${esc(prefix + ln)}':fontsize=${bodyFs}:fontcolor=${C.white}:x=${PAD}:y=${y}`);
      y += Math.round(bodyFs * 1.62);
    });
    y += 12;
  }
  if (card.footer) {
    texts.push(`drawtext=font=SimHei:expansion=none:text='${esc(strip(card.footer))}':fontsize=30:fontcolor=${C.gray}:x=${PAD}:y=${H - 84}`);
  }
  if (y > H - 110) console.warn(`  ! ${name} 内容可能溢出（y=${y}），建议减少要点`);
  parts.push(`[base]${texts.join(',')}[out]`);

  const r = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', ...inputs,
    '-filter_complex', parts.join(';'), '-map', '[out]', '-frames:v', '1', '-q:v', '2', out], LOG);
  if (r.status !== 0) { console.error(`渲染失败 ${name}\n${r.text.slice(-400)}`); process.exit(1); }
  if (!card.frame) fs.unlinkSync(frame);
  made.push(out);
  console.log(`[cards] ${name}  ← @${card.at}s  「${head[0] || card.kicker || ''}」`);
}

console.log(`[cards] 完成 ${made.length} 张 → ${path.relative(ROOT, OUT)}`);
