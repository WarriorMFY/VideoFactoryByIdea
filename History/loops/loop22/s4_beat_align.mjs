#!/usr/bin/env node
/**
 * s4_beat_align.mjs — loop22 S4/H2 分析：混剪切点是否真的对齐音乐节拍？
 * 方法：提取样本音轨的能量包络（astats 每 1024 样本窗口 RMS）→ 能量峰 = 近似节拍/鼓点
 *      → 检验 shot_profile 切点落峰比例（±60ms 容差）。
 * 对照：随机分布切点落峰比例（同容差，用样本切点密度做泊松期望）。
 * 用法: node s4_beat_align.mjs <video.mp4> <profile.json>
 */
import { ffmpeg, ROOT } from '../../../Tool/lib/ff.mjs';
import fs from 'node:fs';
import path from 'node:path';

const [video, profilePath] = process.argv.slice(2);
if (!video || !profilePath) { console.log('用法: s4_beat_align.mjs video.mp4 profile.json'); process.exit(2); }

// 1. 切点序列
const prof = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
const cuts = (Array.isArray(prof.cuts) ? prof.cuts : prof.cuts?.times || []).map(Number).filter(Number.isFinite);
if (!cuts.length) { console.error('profile 里没找到切点序列，字段：' + Object.keys(prof).join(',')); process.exit(1); }
console.log(`切点 ${cuts.length} 个`);

// 2. 能量包络：48kHz 下每 1024 样本一窗（≈21.3ms）。ametadata print 默认进日志（ff.mjs 已把 stdout+stderr 落盘）
ffmpeg(['-hide_banner', '-y', '-i', video, '-vn', '-af',
  'asetnsamples=n=1024,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level',
  '-f', 'null', '-'], path.join(ROOT, 'History/runs/_logs/loop22_env.log'));
const lines = fs.readFileSync(path.join(ROOT, 'History/runs/_logs/loop22_env.log'), 'utf8').split('\n');
const env = [];   // [{t, rms}]
let t = 0;
for (const ln of lines) {
  const mT = ln.match(/frame:\d+\s+pts:\d+\s+pts_time:([\d.]+)/);
  const mR = ln.match(/lavfi\.astats\.Overall\.RMS_level=(-?[\d.]+|(-?inf))/);
  if (mT) t = +mT[1];
  if (mR) { env.push({ t, rms: mR[1] === '-inf' ? -90 : +mR[1] }); }
}
console.log(`能量窗口 ${env.length} 个（≈${(env.length * 1024 / 48000).toFixed(1)}s）`);
if (env.length < 100) { console.error('能量包络提取失败'); process.exit(1); }

// 3. 能量峰（onset 近似）：RMS 突增 > 4dB 且是局部 5 窗最大
const onsets = [];
for (let i = 2; i < env.length - 2; i++) {
  const rise = env[i].rms - env[i - 1].rms;
  if (rise > 4 && env[i].rms >= Math.max(env[i - 2].rms, env[i - 1].rms, env[i + 1].rms, env[i + 2].rms)) {
    onsets.push(env[i].t);
  }
}
console.log(`能量峰（近似鼓点/节拍）${onsets.length} 个，密度 ${(onsets.length / (env[env.length - 1].t / 60)).toFixed(1)}/min`);

// 4. 切点落峰比例（±60ms 容差）
const TOL = 0.06;
let hit = 0;
for (const c of cuts) if (onsets.some(o => Math.abs(o - c) <= TOL)) hit++;
const ratio = hit / cuts.length;
// 随机期望：每切点 ±60ms 窗口覆盖的 onset 期望数
const dur = env[env.length - 1].t;
const randExp = Math.min(1, (onsets.length / dur) * TOL * 2);
console.log(`\n切点落峰比例: ${(ratio * 100).toFixed(1)}%（${hit}/${cuts.length}）`);
console.log(`随机切点期望落峰: ${(randExp * 100).toFixed(1)}%`);
console.log(`对齐增强倍数: ${(ratio / Math.max(randExp, 0.001)).toFixed(1)}×  → ${ratio > randExp * 2 ? '✅ 切点显著对齐节拍（H2 方向性证据）' : ratio > randExp * 1.3 ? '⚠️ 弱对齐' : '❌ 未对齐（切点跟随动作/语义而非音乐）'}`);
