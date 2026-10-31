#!/usr/bin/env node
/**
 * pick_cover_frame.mjs — 给封面自动挑一帧「干净、有信息、不被文字占满」的画面
 *
 * 为什么需要（小循环 12 实测的缺陷）：原封面取的是成片第 2 秒 —— 正好是 Big Buck Bunny 片头标题卡
 * （白底蓝大字 "THE PEACH OPEN MOVIE PROJECT PRESENTS"），并且成片里已经烧了双语字幕，
 * 于是封面标题 + 视频字幕 + 片头大字三层文字糊在一起，完全不可用。
 * 结论：封面必须 (a) 从**无字幕的干净成片**取帧；(b) 用可量化规则挑帧，而不是写死第 2 秒。
 *
 * 挑帧规则（越小越差，全部用像素统计，不靠感觉）：
 *   · 下半区（y≥62%）要暗：封面会在这里压黑蒙版写字，底下亮就会透出来 → 取 (1 - 下半区亮度均值)
 *   · 整体要有一点细节：灰度标准差太小 = 纯色/白屏 → 取 std（封顶 0.25 避免噪声主导）
 *   · 不要过曝：整图亮度均值 > 0.62 直接扣分（白底标题卡就是这种）
 *   · 不要死黑：整图亮度均值 < 0.08 扣分
 *
 * 用法：node Tool\ops\pick_cover_frame.mjs --video <clean.mp4> [--count 12] [--from 1] [--to <自动=时长-1>] [--json out.json]
 * 输出：打印最佳时刻（喂给 make_cover.mjs 的 --at）+ 候选评分表
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, FF, durationOf } from '../lib/ff.mjs';

const args = process.argv.slice(2);
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const VIDEO = getOpt('--video', '');
if (!VIDEO) { console.error('用法: node Tool/ops/pick_cover_frame.mjs --video <clean.mp4> [--count 12]'); process.exit(2); }
const SRC = path.resolve(ROOT, VIDEO);
if (!fs.existsSync(SRC)) { console.error('视频不存在:', SRC); process.exit(1); }
const COUNT = Number(getOpt('--count', 12));
const FROM = Number(getOpt('--from', 1));
const WORK = path.join(ROOT, 'Workspace', 'cache', 'pickframe');
fs.mkdirSync(WORK, { recursive: true });
const dur = durationOf(SRC, path.join(WORK, '_dur.log'));
const TO = Number(getOpt('--to', Math.max(FROM + 1, dur - 1)));

/** 抽一帧 → 320 宽灰度原始像素 */
function grayAt(t, idx) {
  const out = path.join(WORK, `f${idx}.gray`);
  const r = spawnSync(FF, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(t), '-i', SRC,
    '-frames:v', '1', '-vf', 'scale=320:-2:flags=area,format=gray', '-f', 'rawvideo', '-pix_fmt', 'gray', out], {
    stdio: 'ignore', timeout: 120000, windowsHide: true,
  });
  if (r.status !== 0 || !fs.existsSync(out)) return null;
  const buf = fs.readFileSync(out);
  try { fs.unlinkSync(out); } catch { /* ignore */ }
  return { buf, w: 320 };
}
function analyze(g) {
  const n = g.buf.length;
  const h = Math.floor(n / 320);
  const bandTop = Math.round(h * 0.62);
  let sumAll = 0, sum2 = 0, sumBand = 0, nBand = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < 320; x++) {
      const p = g.buf[y * 320 + x] / 255;
      sumAll += p; sum2 += p * p;
      if (y >= bandTop) { sumBand += p; nBand++; }
    }
  }
  const mean = sumAll / (h * 320);
  const std = Math.sqrt(Math.max(0, sum2 / (h * 320) - mean * mean));
  const bandMean = nBand ? sumBand / nBand : 1;
  let score = (1 - bandMean) * 1.0 + Math.min(std, 0.25) * 2.0;
  if (mean > 0.62) score -= (mean - 0.62) * 3.0;   // 白底标题卡
  if (mean < 0.08) score -= 0.3;                    // 死黑
  return { mean: +mean.toFixed(3), std: +std.toFixed(3), bandMean: +bandMean.toFixed(3), score: +score.toFixed(3) };
}

const times = [];
const step = (TO - FROM) / Math.max(1, COUNT - 1);
for (let i = 0; i < COUNT; i++) times.push(Number((FROM + step * i).toFixed(2)));
const rows = [];
for (let i = 0; i < times.length; i++) {
  const g = grayAt(times[i], i);
  if (!g) { rows.push({ t: times[i], error: '抽帧失败' }); continue; }
  rows.push({ t: times[i], ...analyze(g) });
}
const ok = rows.filter((r) => !r.error).sort((a, b) => b.score - a.score);
if (!ok.length) { console.error('全部候选帧抽帧失败'); process.exit(1); }
const best = ok[0];
console.log(`[pick] ${path.relative(ROOT, SRC)} 时长 ${dur.toFixed(1)}s，候选 ${ok.length} 帧：`);
for (const r of ok.slice(0, 6)) console.log(`   t=${String(r.t).padStart(6)}s  score=${r.score}  bandMean=${r.bandMean}  std=${r.std}  mean=${r.mean}`);
console.log(`[pick] 最佳时刻 --at ${best.t}（下半区亮度 ${best.bandMean}，细节 std ${best.std}）`);
const jsonOut = getOpt('--json', '');
if (jsonOut) {
  fs.mkdirSync(path.dirname(path.resolve(ROOT, jsonOut)), { recursive: true });
  fs.writeFileSync(path.resolve(ROOT, jsonOut), JSON.stringify({ video: path.relative(ROOT, SRC), duration_s: dur, best_at: best.t, candidates: ok }, null, 2), 'utf8');
}
console.log(`AT=${best.t}`);
