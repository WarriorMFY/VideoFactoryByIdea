#!/usr/bin/env node
/**
 * select_speech4_excerpts.mjs — 小循环 4：从「整片」里挑出对白最密的 90s 片段当测试样本
 *
 * 为什么需要：整片（BBB 596s / W3C 片段 300s）直接跑字幕链路太贵，而且大部分时间没对白；
 * 而随机截一段可能整段没人说话（实测 BBB 预告片 33s、W3C movie300 前 120s 都是 0 词）。
 * 所以先整片识别一遍 → 按 15s 步长滑 90s 窗 → 选**识别词数最多**的窗口 → ffmpeg 精确截取。
 *
 * 副产物：整片对白密度分布（每 60s 一个桶），可直接回答"素材里到底有多少可翻译内容"。
 *
 * 用法：node Tool\setup\select_speech4_excerpts.mjs [--window 90] [--step 15]
 * 输出：Workspace/assets/speech4_excerpts/<id>.mp4 + History/loops/loop04/excerpts.json
 *       （run_multi_speech_acceptance.mjs 会自动把 excerpts.json 里的片段加进样本列表）
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ffmpeg, durationOf, ROOT } from '../lib/ff.mjs';

const args = process.argv.slice(2);
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const WINDOW = Number(getOpt('--window', 90));
const STEP = Number(getOpt('--step', 15));
const AF = 'afftdn=nf=-25,highpass=f=300,lowpass=f=3400';
const OUT = path.join(ROOT, 'Workspace', 'assets', 'speech4_excerpts');
const L4 = path.join(ROOT, 'History', 'loops', 'loop04');
const ASRDIR = path.join(ROOT, 'History', 'asr', 'speech4');
const LOGS = path.join(ROOT, 'History', 'runs', '_logs');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(L4, { recursive: true });
fs.mkdirSync(ASRDIR, { recursive: true });
fs.mkdirSync(LOGS, { recursive: true });

const SOURCES = [
  ['bbb_movie_90s', path.join(ROOT, 'Workspace', 'assets', 'speech4', 'bbb_movie_full', 'bbb_movie_full.mp4'),
    'Big Buck Bunny 完整电影的对白密集片段（多角色卡通配音）'],
  ['w3c_movie300_90s', path.join(ROOT, 'Workspace', 'assets', 'speech4', 'toS_movie300', 'toS_movie300.mp4'),
    'W3C movie300（Tears of Steel 片段）的对白密集片段'],
];

function asrFull(id, clip) {
  const out = path.join(ASRDIR, `${id}.full.json`);
  const log = path.join(LOGS, `m4_excerpt_asr_${id}.log`);
  const fd = fs.openSync(log, 'w');
  let r;
  try {
    r = spawnSync(process.execPath, [path.join(ROOT, 'Tool', 'subtitle', 'asr_vosk.mjs'), clip, '--out', out, '--af', AF],
      { stdio: ['ignore', fd, fd], cwd: ROOT });
  } finally { fs.closeSync(fd); }
  if (r.status !== 0) throw new Error(`整片识别失败: ${fs.readFileSync(log, 'utf8').split('\n').slice(-3).join(' | ')}`);
  return JSON.parse(fs.readFileSync(out, 'utf8'));
}

/** 每 60s 一桶的词数（对白密度分布） */
function densityBins(words, total) {
  const bins = [];
  for (let t = 0; t < total; t += 60) {
    const n = words.filter((w) => w.start >= t && w.start < t + 60).length;
    bins.push({ from_s: t, to_s: Math.min(t + 60, Math.round(total)), words: n });
  }
  return bins;
}

/** 滑窗选词数最多的 [start, start+WINDOW) */
function bestWindow(words, total) {
  if (!words.length) return null;
  const win = Math.min(WINDOW, Math.max(10, total));
  let best = { start: 0, count: 0 };
  for (let t = 0; t + win <= total; t += STEP) {
    const count = words.filter((w) => w.start >= t && w.start < t + win).length;
    if (count > best.count) best = { start: t, count };
  }
  // 尾巴也要考虑：若剩余不足一个步长，补一个贴末尾的窗口
  if (total > win) {
    const t = total - win;
    const count = words.filter((w) => w.start >= t && w.end <= total).length;
    if (count > best.count) best = { start: t, count };
  }
  return { ...best, window: win };
}

const excerpts = [];
for (const [id, clip, note] of SOURCES) {
  if (!fs.existsSync(clip)) { console.log(`[skip] ${id}：缺文件 ${path.relative(ROOT, clip)}`); continue; }
  const dur = durationOf(clip, path.join(LOGS, `m4_excerpt_dur_${id}.log`));
  console.log(`\n[${id}] ${dur.toFixed(1)}s，整片识别中（带通降噪）…`);
  const t0 = Date.now();
  const tr = asrFull(id, clip);
  const sec = (Date.now() - t0) / 1000;
  console.log(`  识别完成：${tr.words.length} 词 / 置信度 ${tr.stats.avg_conf} / 用时 ${sec.toFixed(1)}s（${(dur / sec).toFixed(1)}× 实时）`);
  const bins = densityBins(tr.words, dur);
  console.log(`  对白密度（每 60s 词数）：${bins.map((b) => b.words).join(' ')}`);
  const bw = bestWindow(tr.words, dur);
  if (!bw || bw.count < 8) { console.log(`  [warn] 整片只有 ${tr.words.length} 词，找不到有意义的对白窗口 → 跳过`); continue; }
  const outFile = path.join(OUT, `${id}.mp4`);
  const r = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(bw.start), '-t', String(bw.window), '-i', clip,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', outFile],
  path.join(OUT, `_${id}.cut.log`));
  if (r.status !== 0) { console.log(`  [fail] 截取失败: ${r.text.split('\n').slice(-2).join(' ')}`); continue; }
  const outDur = durationOf(outFile, path.join(OUT, `_${id}.dur.log`));
  excerpts.push({
    id, clip: path.relative(ROOT, outFile), from_s: bw.start, duration_s: Number(outDur.toFixed(2)),
    window_words: bw.count, full_words: tr.words.length, full_conf: tr.stats.avg_conf,
    asr_speed_x: Number((dur / sec).toFixed(1)), note,
    density_bins: bins,
  });
  console.log(`  选出 ${bw.start.toFixed(0)}–${(bw.start + bw.window).toFixed(0)}s（该窗口 ${bw.count} 词）→ ${path.relative(ROOT, outFile)}（${outDur.toFixed(1)}s）`);
}

fs.writeFileSync(path.join(L4, 'excerpts.json'), JSON.stringify({ generated_at: new Date().toISOString(), window_s: WINDOW, step_s: STEP, excerpts }, null, 2));
console.log(`\n[done] ${excerpts.length} 个片段 → ${path.relative(ROOT, path.join(L4, 'excerpts.json'))}`);
