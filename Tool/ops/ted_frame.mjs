#!/usr/bin/env node
/**
 * ted_frame.mjs — 不下载整片，直接从 TED HLS 定点抓帧（含可选联系表）
 *
 * 为什么需要：做封面/动态卡片时只想要几张画面，整片下载 90MB 太浪费；
 * HLS 支持按 `-ss` 只取邻近分段，实测约 4~5 秒一帧。也用于素材已清理后回捞画面。
 *
 * 用法：
 *   node Tool/ops/ted_frame.mjs --pm 3235 --at 100,300,600 --out Workspace/tmp/frames_b [--sheet sheet.jpg]
 *   node Tool/ops/ted_frame.mjs --pm 3235 --fracs 0.12,0.35,0.6,0.85 --dur 880 --out dir
 *
 * 产物：<out>/f_<秒>.jpg（+ 可选联系表，每帧左上角标时间戳）
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, ffmpeg, ffprobeValue } from '../lib/ff.mjs';

const args = process.argv.slice(2);
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const PM = getOpt('--pm', '');
if (!PM) { console.error('用法: --pm <project_masters id> --at 12,300,600 | --fracs 0.1,0.5 [--dur 880] --out dir'); process.exit(2); }

const OUT = path.resolve(ROOT, getOpt('--out', `Workspace/tmp/frames_${PM}`));
fs.mkdirSync(OUT, { recursive: true });
const LOG = path.join(ROOT, 'History', 'runs', '_logs', 'ted_frame.log');
const URL = `https://hls.ted.com/project_masters/${PM}/index-f11-v1.m3u8?intro_master_id=9294`;
const WHITELIST = ['-protocol_whitelist', 'file,http,https,tcp,tls,crypto,httpproxy'];

let times = [];
if (getOpt('--at', '')) times = getOpt('--at').split(',').map((x) => Number(x.trim())).filter(Number.isFinite);
else if (getOpt('--fracs', '')) {
  const dur = Number(getOpt('--dur', 0));
  if (!dur) { console.error('--fracs 需要 --dur <秒>'); process.exit(2); }
  times = getOpt('--fracs').split(',').map((f) => Math.round(Number(f) * dur));
}
if (!times.length) { console.error('缺 --at 或 --fracs'); process.exit(2); }

// 日志里出现的帧号即时间戳，用于联系表标注
const files = [];
for (const t of times) {
  const out = path.join(OUT, `f_${String(t).padStart(5, '0')}.jpg`);
  const r = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', ...WHITELIST, '-ss', String(t), '-i', URL,
    '-frames:v', '1', '-update', '1', '-q:v', '2', out], LOG);
  if (r.status !== 0 || !fs.existsSync(out)) { console.error(`✗ @${t}s ${r.text.slice(-200)}`); continue; }
  files.push({ t, out });
  console.log(`[frame] ${path.basename(out)}  ← @${t}s  ${Math.round(fs.statSync(out).size / 1024)}KB  ${(r.ms / 1000).toFixed(1)}s`);
}

const SHEET = getOpt('--sheet', '');
if (SHEET && files.length) {
  const sheet = path.resolve(ROOT, SHEET);
  fs.mkdirSync(path.dirname(sheet), { recursive: true });
  const inputs = files.flatMap((f) => ['-i', f.out]);
  const n = files.length;
  const CW = 384, CH = 216;
  const cols = n <= 3 ? n : n <= 6 ? 3 : 4;
  const rows = Math.ceil(n / cols);
  const parts = [];
  // 每帧统一 384×216（等比填满后裁切），左上角烧时间戳
  files.forEach((f, i) => {
    const lbl = `${String(Math.floor(f.t / 60)).padStart(2, '0')}:${String(f.t % 60).padStart(2, '0')}`;
    parts.push(`[${i}:v]scale=${CW}:${CH}:force_original_aspect_ratio=increase,crop=${CW}:${CH},` +
      `drawtext=font=SimHei:text='${lbl}':fontsize=26:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=6:x=8:y=8[v${i}]`);
  });
  // 逐行 hstack（不足一行用 pad 补黑边到同宽），再 vstack —— 不引入额外 lavfi 输入，避免多帧 packet 问题
  const rowW = cols * CW;
  for (let r = 0; r < rows; r++) {
    const idx = files.slice(r * cols, (r + 1) * cols).map((_, k) => r * cols + k);
    const labels = idx.map((v) => `[v${v}]`).join('');
    if (idx.length === 1) {
      parts.push(`${labels}pad=${rowW}:${CH}:0:0:black[row${r}]`);
    } else {
      parts.push(`${labels}hstack=inputs=${idx.length},pad=${rowW}:${CH}:0:0:black[row${r}]`);
    }
  }
  parts.push(`${rows > 1 ? Array.from({ length: rows }, (_, r) => `[row${r}]`).join('') + `vstack=inputs=${rows}` : '[row0]'},format=yuvj420p[out]`);

  const r = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', ...inputs,
    '-filter_complex', parts.join(';'), '-map', '[out]', '-frames:v', '1', '-update', '1', '-q:v', '3', sheet], LOG);
  if (r.status !== 0) console.error(`联系表失败\n${r.text.slice(-300)}`);
  else console.log(`[frame] 联系表 ${path.relative(ROOT, sheet)}`);
}
console.log(`[frame] 完成 ${files.length} 帧 → ${path.relative(ROOT, OUT)}`);
