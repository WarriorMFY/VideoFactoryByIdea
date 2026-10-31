#!/usr/bin/env node
/**
 * make_episode.mjs — 造一期"可交付样片"的源素材（口播 + 画面），给市场闭环用
 *
 * 用途：市场侦查选了题材后，工厂要先有一条能拿出去的东西。这里用**完全可授权**的素材合成：
 *   · 画面：CC-BY 的 Blender 开放影片（默认 Big Buck Bunny 预告片，循环铺满时长）
 *   · 声音：Edge TTS 合成的英语口播（不是真人，但语速/停顿接近口播，够验证链路）
 *   · 真值：脚本原句 + 逐句时间码（由 TTS 实际时长累加得到，可用于算 WER）
 *
 * 为什么不用真·英文教程视频：版权不明确（B 站上的"搬运"内容不能直接再分发）。
 * 这条样片的意义是**验证"工厂 → 交付包"这一段能跑通**，不是伪装成真实搬运。
 *
 * 用法：node Tool/ops/make_episode.mjs --script episodes/ep01.txt --out Workspace/deliverables/ep01 --footage <mp4>
 * 输出：<out>/source.mp4、<out>/ground_truth.json、<out>/script.txt
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ffmpeg, durationOf, ffprobeJson, ROOT } from '../lib/ff.mjs';

const args = process.argv.slice(2);
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const SCRIPT = path.resolve(ROOT, getOpt('--script', ''));
const OUT = path.resolve(ROOT, getOpt('--out', 'Workspace/deliverables/ep01'));
const FOOTAGE = path.resolve(ROOT, getOpt('--footage', path.join('Workspace', 'assets', 'realspeech', 'w3c-bunny-trailer.mp4')));
const VOICE = getOpt('--voice', 'en-US-AriaNeural');
const RATE = getOpt('--rate', '+0%');
const GAP = Number(getOpt('--gap', 0.32));          // 句间停顿
const W = Number(getOpt('--width', 1280));
const H = Number(getOpt('--height', 720));
if (!getOpt('--script', '')) { console.error('必须给 --script <txt>'); process.exit(2); }
if (!fs.existsSync(SCRIPT)) { console.error('脚本不存在:', SCRIPT); process.exit(1); }
if (!fs.existsSync(FOOTAGE)) { console.error('画面素材不存在:', FOOTAGE); process.exit(1); }

const work = path.join(OUT, '.work');
fs.mkdirSync(work, { recursive: true });
const lines = fs.readFileSync(SCRIPT, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith('#'));
if (!lines.length) { console.error('脚本为空'); process.exit(1); }
console.log(`[ep] ${lines.length} 句口播 / 画面 ${path.relative(ROOT, FOOTAGE)}`);

const log = (n) => path.join(ROOT, 'History', 'runs', '_logs', `ep_${n}.log`);
const require = createRequire(path.join(ROOT, 'Workspace', 'asr', 'index.cjs'));
const { EdgeTTS } = require('@andresaya/edge-tts');

const wavs = [];
const durs = [];
for (let i = 0; i < lines.length; i++) {
  const mp3 = path.join(work, `s${String(i).padStart(2, '0')}.mp3`);
  const wav = path.join(work, `s${String(i).padStart(2, '0')}.wav`);
  let ok = false;
  for (let attempt = 0; attempt < 3 && !ok; attempt++) {
    try {
      const tts = new EdgeTTS();
      await tts.synthesize(lines[i], VOICE, { rate: RATE });
      const buf = await tts.toBuffer();
      if (!buf || buf.length < 1000) throw new Error('TTS 输出异常');
      fs.writeFileSync(mp3, buf);
      ok = true;
    } catch (e) { await new Promise((r) => setTimeout(r, 1200)); }
  }
  if (!ok) { console.error(`TTS 失败（第 ${i} 句）`); process.exit(1); }
  // 去掉每句首尾静音（Edge TTS 自带 ~0.6s 尾巴），否则句间停顿会忽长忽短、时间轴发飘
  const r = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-i', mp3,
    '-af', 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.03,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.03,areverse',
    '-ac', '2', '-ar', '48000', '-c:a', 'pcm_s16le', wav], log(`tts_${i}`));
  if (r.status !== 0) { console.error(`TTS 转码失败（第 ${i} 句）: ${(r.text || '').slice(-200)}`); process.exit(1); }
  wavs.push(wav);
  durs.push(durationOf(wav, log(`dur_${i}`)));
  console.log(`  #${i} ${durs[i].toFixed(2)}s  ${lines[i].slice(0, 56)}`);
}

// 拼成一条连续语音：句 + 静音间隔（静音用 anullsrc 生成，长度精确）
const listTxt = path.join(work, 'audio_list.txt');
const parts = [];
for (let i = 0; i < wavs.length; i++) {
  parts.push(wavs[i]);
  if (i < wavs.length - 1) {
    const sil = path.join(work, `g${String(i).padStart(2, '0')}.wav`);
    ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `anullsrc=r=48000:cl=stereo`, '-t', String(GAP), '-c:a', 'pcm_s16le', sil], log(`gap_${i}`));
    parts.push(sil);
  }
}
const speech = path.join(OUT, 'speech.wav');
fs.writeFileSync(listTxt, parts.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n'));
{
  const r = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', listTxt, '-c:a', 'pcm_s16le', speech], log('concat'));
  if (r.status !== 0) { console.error('音频拼接失败:', (r.text || '').slice(-200)); process.exit(1); }
}
const total = durationOf(speech, log('total'));
console.log(`[ep] 语音总长 ${total.toFixed(2)}s`);

// 画面：循环铺满，等比缩放 + 黑边填充，恒定 30fps
// 注意必须**显式 -map**：第一个输入（画面）自带音轨（影片配乐），ffmpeg 默认流选择会挑它，
// 结果成片里是配乐而不是刚合成的口播（实测：ASR 0 词、acceptHits=7 全空结果，查了半天）
const src = path.join(OUT, 'source.mp4');
const rv = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-stream_loop', '-1', '-i', FOOTAGE, '-i', speech,
  '-map', '0:v:0', '-map', '1:a:0',
  '-t', String(total),
  '-vf', `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30`,
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', src], log('mux'));
if (rv.status !== 0) { console.error('合成失败:', (rv.text || '').slice(-300)); process.exit(1); }
const srcDur = durationOf(src, log('srcdur'));

// 真值：逐句时间码
const sentences = [];
let t = 0;
for (let i = 0; i < durs.length; i++) {
  const start = t, end = t + durs[i];
  sentences.push({ idx: i, start: Number(start.toFixed(3)), end: Number(end.toFixed(3)), text: lines[i] });
  t = end + (i < durs.length - 1 ? GAP : 0);
}
const gt = {
  generated_at: new Date().toISOString(),
  source: 'Tool/ops/make_episode.mjs',
  note: '画面：Big Buck Bunny（© Blender Foundation, CC-BY 3.0）；声音：Edge TTS 合成英语口播；时间码由 TTS 实际时长累加得到',
  language: 'en',
  license: 'CC-BY 3.0 (footage) / 合成语音',
  duration_s: Number(srcDur.toFixed(3)),
  sentences,
  script: lines.join(' '),
};
fs.writeFileSync(path.join(OUT, 'ground_truth.json'), JSON.stringify(gt, null, 2));
fs.copyFileSync(SCRIPT, path.join(OUT, 'script.txt'));
fs.rmSync(work, { recursive: true, force: true });

console.log(`[ep] 成片素材 ${path.relative(ROOT, src)} ${srcDur.toFixed(2)}s ${W}x${H}`);
console.log(`[ep] 真值 ${sentences.length} 句 → ground_truth.json`);
