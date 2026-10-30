#!/usr/bin/env node
/**
 * make_long_source.mjs — 造一段**长视频**压测素材（默认 49 分钟），用来暴露规模问题
 *
 * 为什么用"循环拼接"而不是另找一部长片：
 *   本机能拿到的合法长片只有 Tears of Steel（12 分钟，CC-BY）。要找 40 分钟以上的真实长片，
 *   要么下大文件（通道不稳）、要么版权不明。这里用 `-stream_loop` 把 12 分钟循环 4 次拼成 49 分钟：
 *   **测的是规模/稳定性（内存、事件数、耗时、字幕行数），不是内容多样性** —— 这一点在验收报告里必须写明。
 *
 * 用法：node Tool/setup/make_long_source.mjs [--minutes 49] [--out Workspace/assets/longbench/source_long.mp4]
 * 输出：长视频 mp4 + `.complete` 标记；已存在则跳过（幂等）
 */
import fs from 'node:fs';
import path from 'node:path';
import { ffmpeg, durationOf, ROOT } from '../lib/ff.mjs';

const args = process.argv.slice(2);
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const MINUTES = Number(getOpt('--minutes', 49));
const SRC = path.join(ROOT, 'Workspace', 'assets', 'tos', 'tears_of_steel_720p.mov');
const OUTDIR = path.join(ROOT, 'Workspace', 'assets', 'longbench');
const DEST = path.resolve(ROOT, getOpt('--out', path.join(OUTDIR, 'source_long.mp4')));
const DONE = `${DEST}.complete`;
const LOGS = path.join(ROOT, 'History', 'runs', '_logs');
fs.mkdirSync(OUTDIR, { recursive: true });
fs.mkdirSync(LOGS, { recursive: true });

if (!fs.existsSync(SRC)) {
  console.error(`缺少 ${path.relative(ROOT, SRC)}（先跑 node Tool/setup/fetch_tos_movie.mjs）`);
  process.exit(1);
}
const srcDur = durationOf(SRC, path.join(LOGS, 'l9_long_src_dur.log'));
const target = MINUTES * 60;
const loops = Math.max(1, Math.ceil(target / srcDur));
console.log(`[long] 源 ${srcDur.toFixed(1)}s × ${loops} 次 → 目标 ${MINUTES} 分钟`);

if (fs.existsSync(DONE) && fs.existsSync(DEST)) {
  console.log(`[long] 已完成，跳过：${path.relative(ROOT, DEST)} ${(fs.statSync(DEST).size / 1048576).toFixed(0)}MB`);
  process.exit(0);
}

const t0 = Date.now();
// -stream_loop n 会重复输入 n 次；-c copy 不重编码（几百 MB 一分钟内搞定）
const r = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-stream_loop', String(loops - 1), '-i', SRC,
  '-t', String(target), '-c', 'copy', '-movflags', '+faststart', DEST], path.join(LOGS, 'l9_long_build.log'));
if (r.status !== 0) {
  console.error('[long] 拼接失败:', (r.text || '').split('\n').slice(-4).join(' | '));
  process.exit(1);
}
const dur = durationOf(DEST, path.join(LOGS, 'l9_long_dur.log'));
const mb = fs.statSync(DEST).size / 1048576;
if (Math.abs(dur - target) > 5) {
  console.error(`[long] 时长不符：${dur.toFixed(1)}s vs 目标 ${target}s`);
  process.exit(1);
}
fs.writeFileSync(DONE, `${new Date().toISOString()} ${dur.toFixed(2)}s ${mb.toFixed(0)}MB\n`);
console.log(`[long] 完成 ${dur.toFixed(1)}s / ${mb.toFixed(0)}MB / ${((Date.now() - t0) / 1000).toFixed(1)}s → ${path.relative(ROOT, DEST)}`);
