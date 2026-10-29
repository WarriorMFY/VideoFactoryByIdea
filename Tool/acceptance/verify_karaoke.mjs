#!/usr/bin/env node
/**
 * verify_karaoke.mjs — 逐词高亮字幕的客观验收（不靠肉眼）
 *
 * 验三件事：
 *   1. 高亮确实存在：在 ASS 里每个英文词事件的中点抽帧，画面中应能检测到高亮色的像素块；
 *   2. 不重影：同一帧里高亮块应只有 **1 个**（相邻两个词事件若时间重叠，会出现两块 → 判失败）；
 *   3. 跟着语流走：不同词的中点帧，高亮块的水平重心应有明显位移（说明高亮在移动，而不是一直亮同一个词）。
 *
 * 实现：用 ffmpeg 把指定时刻的帧解成 rawvideo(rgb24) 落盘，再用 Node 直接扫描像素，
 *      不依赖任何图像库（本机 pip/npm 装不了 sharp 之类）。
 *
 * 用法：node Tool/acceptance/verify_karaoke.mjs <final.mp4> <karaoke.ass> [--hl 33E6C8] [--samples 12] [--json out.json]
 */
import fs from 'node:fs';
import path from 'node:path';
import { ffmpeg, ROOT } from '../lib/ff.mjs';

const args = process.argv.slice(2);
if (args.length < 2) { console.error('用法: node Tool/acceptance/verify_karaoke.mjs <final.mp4> <karaoke.ass> [--hl RRGGBB] [--samples 12] [--json out.json]'); process.exit(2); }
const VIDEO = path.resolve(args[0]);
const ASS = path.resolve(args[1]);
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const HL = getOpt('--hl', '33E6C8');
const SAMPLES = Number(getOpt('--samples', 12));
const JSON_OUT = getOpt('--json', '');
const W = Number(getOpt('--width', 1280));
const H = Number(getOpt('--height', 720));
const WORK = path.join(path.dirname(VIDEO), '.karaoke_verify');
fs.mkdirSync(WORK, { recursive: true });

// ---- 1. 从 ASS 取英文词事件 ----
const toSec = (t) => {
  const m = t.match(/^(\d+):(\d+):(\d+)\.(\d+)$/);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(`0.${m[4]}`) : null;
};
const events = fs.readFileSync(ASS, 'utf8').split(/\r?\n/)
  .filter((l) => l.startsWith('Dialogue:'))
  .map((l) => {
    const parts = l.slice(9).split(',');
    const [layer, start, end, style] = parts;
    const text = parts.slice(9).join(',');
    return { layer: Number(layer), start: toSec(start), end: toSec(end), style: style.trim(), text };
  })
  .filter((e) => e.style === 'EN' && Number.isFinite(e.start) && e.end > e.start);

if (!events.length) { console.error('ASS 里没有英文词事件'); process.exit(1); }
// 抽样：均匀取 SAMPLES 个事件
const step = Math.max(1, Math.floor(events.length / SAMPLES));
const picks = [];
for (let i = 0; i < events.length && picks.length < SAMPLES; i += step) picks.push(events[i]);

// ---- 2. 目标色统计 ----
const target = { r: parseInt(HL.slice(0, 2), 16), g: parseInt(HL.slice(2, 4), 16), b: parseInt(HL.slice(4, 6), 16) };
// 容差收紧到 28：素材本身（草地/树叶高光）也可能落在青绿色域，46 的容差会把背景误判为高亮（实测误报 5+ 块）
const near = (p) => Math.abs(p[0] - target.r) <= 28 && Math.abs(p[1] - target.g) <= 28 && Math.abs(p[2] - target.b) <= 28;

function analyzeFrame(raw) {
  // 逐像素找高亮色，按"列"投影，得到连续列段数（= 高亮块数）与水平重心
  const cols = new Uint16Array(W);
  let total = 0, sumX = 0;
  // 只扫字幕区（画面下方 34%）：英文行贴底，这样能把背景里的青绿色干扰彻底排除
  const y0 = Math.floor(H * 0.66);
  for (let y = y0; y < H; y++) {
    const row = y * W * 3;
    for (let x = 0; x < W; x++) {
      const i = row + x * 3;
      if (near([raw[i], raw[i + 1], raw[i + 2]])) { cols[x]++; total++; sumX += x; }
    }
  }
  // 统计"词块"：一个词内部字母间空隙较小（合并），词与词之间空隙较大（断开）。
  // 阈值 26px 对应 36–40px 字号的空格量级；否则会把同一个词的字母误判成多块（实测误报 13 块）。
  const minPix = 3;
  const xs = [];
  for (let x = 0; x < W; x++) if (cols[x] >= minPix) xs.push(x);
  let blocks = 0;
  if (xs.length) {
    blocks = 1;
    for (let i = 1; i < xs.length; i++) if (xs[i] - xs[i - 1] > 26) blocks++;
  }
  const bboxW = xs.length ? xs[xs.length - 1] - xs[0] : 0;   // 单词语通常 <300px；两词会明显更宽
  return { pixels: total, blocks, bboxW, centroidX: total ? Number((sumX / total).toFixed(1)) : null };
}

// ---- 3. 抽帧分析 ----
const rows = [];
const DUR = Number(process.env.KARAOKE_DUR || 0);
for (const [i, e] of picks.entries()) {
  let t = Number((((e.start + e.end) / 2)).toFixed(3));
  // 首尾有 0.5s 淡入 / 0.8s 淡出，会把高亮色压暗导致检测失败 → 采样避开
  if (t < 0.9) t = 0.9;
  if (DUR && t > DUR - 1.2) t = DUR - 1.2;
  const raw = path.join(WORK, `f${i}.rgb`);
  const r = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(t), '-i', VIDEO,
    '-frames:v', '1', '-vf', `scale=${W}:${H}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', raw], path.join(WORK, `f${i}.log`));
  if (r.status !== 0 || !fs.existsSync(raw)) { rows.push({ i, t, error: '抽帧失败' }); continue; }
  const a = analyzeFrame(fs.readFileSync(raw));
  fs.rmSync(raw, { force: true });
  rows.push({ i, t, text: e.text.replace(/\{[^}]*\}/g, '').replace(/\\N/g, ' ').slice(0, 46), ...a });
}

const okRows = rows.filter((r) => !r.error);
const withHighlight = okRows.filter((r) => r.pixels > 8).length;
const singleBlock = okRows.filter((r) => r.blocks === 1).length;
const centroids = okRows.map((r) => r.centroidX).filter((x) => x !== null);
const spread = centroids.length > 1 ? Math.max(...centroids) - Math.min(...centroids) : 0;

const result = {
  checked_at: new Date().toISOString(),
  video: VIDEO, ass: ASS, highlight: HL,
  events_total: events.length, sampled: picks.length,
  checks: {
    highlight_present: withHighlight === okRows.length,           // 每个采样帧都能检测到高亮色
    single_block_per_frame: singleBlock === okRows.length,        // 每帧只有一个高亮块（不重影）
    highlight_moves: spread >= 12,                                // 不同词的重心有位移
  },
  metrics: {
    frames: okRows.length, frames_with_highlight: withHighlight, frames_single_block: singleBlock,
    centroid_spread_px: Number(spread.toFixed(1)),
    avg_highlight_pixels: Number((okRows.reduce((a, r) => a + (r.pixels || 0), 0) / Math.max(1, okRows.length)).toFixed(1)),
  },
  samples: rows,
};
result.verdict = Object.values(result.checks).every(Boolean) ? 'PASS' : 'FAIL';
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(result, null, 2));

console.log(`\n=== 逐词高亮验收: ${result.verdict} ===`);
console.log(`ASS 英文词事件 ${events.length} 条，抽样 ${picks.length} 帧`);
console.log(`高亮存在 ${withHighlight}/${okRows.length} 帧 · 单块(不重影) ${singleBlock}/${okRows.length} 帧 · 重心位移 ${spread.toFixed(1)}px · 平均高亮像素 ${result.metrics.avg_highlight_pixels}`);
console.log(`判定: ${Object.entries(result.checks).map(([k, v]) => `${k}=${v ? 'ok' : '✗'}`).join(' ')}`);
for (const r of rows.slice(0, 8)) {
  if (r.error) { console.log(`  ✗ ${r.t}s ${r.error}`); continue; }
  console.log(`  ${r.t.toFixed(2)}s  pixels=${String(r.pixels).padStart(5)} blocks=${r.blocks} cx=${r.centroidX}  «${r.text}»`);
}
process.exit(result.verdict === 'PASS' ? 0 : 1);
