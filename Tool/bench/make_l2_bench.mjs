#!/usr/bin/env node
/**
 * make_l2_bench.mjs — 构造「外语视频 + 已知文本」测试素材（小循环 2）
 *
 * 办法：用 Windows SAPI 离线 TTS（Microsoft Zira, en-US）逐句合成英文语音，
 * 句子之间插入固定静音再拼接 —— 于是**每句的起止时间都是已知的**，
 * 语音识别（WER）与字幕时间轴（误差秒数）都能被机器验收，不用靠耳朵。
 * 画面用真实公开素材（Big Buck Bunny, CC-BY 3.0）循环铺底。
 *
 * 用法：node Tool/make_l2_bench.mjs [--out History/bench/l2_en] [--lang en]
 * 输出：<out>/script.txt、<out>/source.mp4、<out>/ground_truth.json、<out>/reference_zh.json（人工精译参考）
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ffmpeg, ffprobeJson, durationOf, ROOT } from '../lib/ff.mjs';

const args = process.argv.slice(2);
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const OUT = path.resolve(ROOT, getOpt('--out', 'History/bench/l2_en'));
const GAP = Number(getOpt('--gap', 0.35));
const VOICE = getOpt('--voice', 'en-US-AriaNeural');
const RATE = getOpt('--rate', '+0%');
const CLIP = path.join(ROOT, 'Workspace', 'assets', 'Big_Buck_Bunny_1080_10s_5MB.mp4');
fs.mkdirSync(OUT, { recursive: true });
const lf = (n) => path.join(OUT, `_${n}.log`);

// 脚本：7 句，含数字、单位、专有做法，故意给 ASR 制造压力
const SCRIPT = [
  'Welcome back to the workshop, where we turn raw footage into finished films.',
  'Today I will show you three simple tricks that save about two hours of editing time.',
  'First, always cut on the beat, because rhythm is what keeps the audience awake.',
  'Second, remove the silent gaps longer than half a second before you touch the colors.',
  'Third, normalize the audio to minus sixteen LUFS, which is the standard for online video platforms.',
  'Finally, export at fifteen megabits per second, and never trust the first render.',
  'That is it for this episode, see you in the next one.',
];
// 人工精译参考（用于对比机翻质量，不参与自动判定）
const REF_ZH = [
  '欢迎回到工作坊，我们在这里把原始素材变成成片。',
  '今天我会演示三个简单的小技巧，能省下大约两个小时的剪辑时间。',
  '第一，永远在节拍上剪，因为节奏才能让观众保持清醒。',
  '第二，在碰调色之前，先把长度超过半秒的静音空隙去掉。',
  '第三，把音频响度归一到负十六 LUFS，这是在线视频平台的标准。',
  '最后，以每秒十五兆的码率导出，而且永远不要相信第一次渲染。',
  '本期就到这里，我们下期见。',
];

fs.writeFileSync(path.join(OUT, 'script.txt'), SCRIPT.join('\n') + '\n');

// 1) TTS 逐句合成（Edge 神经语音，离线 SAPI 在本沙箱被拒 E_ACCESSDENIED，已实测）
const ttsDir = path.join(OUT, 'tts');
fs.mkdirSync(ttsDir, { recursive: true });
console.log(`[l2] TTS 合成英文语音（edge-tts / ${VOICE} / rate ${RATE}）...`);
const require = createRequire(path.join(ROOT, 'Workspace', 'asr', 'index.cjs'));
const { EdgeTTS } = require('@andresaya/edge-tts');
const wavs = [];
const durs = [];
for (let i = 0; i < SCRIPT.length; i++) {
  const mp3 = path.join(ttsDir, `${String(i).padStart(3, '0')}.mp3`);
  const wav = path.join(ttsDir, `${String(i).padStart(3, '0')}.wav`);
  // 幂等 + 可断点：已经合成过且文件正常的句子直接复用（Edge TTS 偶发网络抖动）
  if (!(fs.existsSync(mp3) && fs.statSync(mp3).size > 2000)) {
    let ok = false, lastErr = null;
    for (let attempt = 0; attempt < 3 && !ok; attempt++) {
      try {
        const tts = new EdgeTTS();
        await tts.synthesize(SCRIPT[i], VOICE, { rate: RATE });
        const buf = await tts.toBuffer();
        if (!buf || buf.length < 2000) throw new Error(`输出异常 ${buf?.length ?? 0} 字节`);
        fs.writeFileSync(mp3, buf);
        ok = true;
      } catch (e) { lastErr = e; await new Promise((r) => setTimeout(r, 1200)); }
    }
    if (!ok) throw new Error(`TTS 失败（第 ${i} 句）: ${lastErr?.message || '未知'}`);
  }
  const r = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-i', mp3,
    // 去掉 Edge TTS 每句首尾自带的静音，否则"真值句时长"里混进静音，会让字幕覆盖率指标虚低（实测每句尾约 0.8s）
    '-af', 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.03,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.03,areverse',
    '-ac', '2', '-ar', '48000', '-c:a', 'pcm_s16le', wav], lf(`tts_${i}`));
  if (r.status !== 0) throw new Error(`TTS 转码失败（第 ${i} 句）: ${r.text.split('\n').slice(-3).join(' ')}`);
  wavs.push(wav);
  durs.push(durationOf(wav, lf('tts_dur')));
  console.log(`   #${i} ${durs[i].toFixed(2)}s <- ${SCRIPT[i].slice(0, 52)}…`);
}

// 2) 句子时间轴（精确已知）
const sentences = [];
let t = 0;
SCRIPT.forEach((s, i) => {
  sentences.push({ idx: i, text: s, ref_zh: REF_ZH[i], start: Number(t.toFixed(3)), end: Number((t + durs[i]).toFixed(3)), dur: Number(durs[i].toFixed(3)) });
  t += durs[i] + GAP;
});
const speechDur = Number(t.toFixed(3));

// 3) 拼音频（句子 + 静音间隔），统一 48k 立体声
const sil = path.join(OUT, '_silence.wav');
ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `anullsrc=r=48000:cl=stereo:d=${GAP}`, '-c:a', 'pcm_s16le', sil], lf('sil'));
const fcParts = [];
const inArgs = [];
wavs.forEach((w, i) => {
  inArgs.push('-i', w);
  fcParts.push(`[${i}:a]aresample=48000,aformat=sample_rates=48000:channel_layouts=stereo[a${i}]`);
});
// 逐句 + 间隔 concat（每段静音用独立源标签：anullsrc 只能输出一个流，不能复用同一标签）
const seq = [];
wavs.forEach((_, i) => {
  seq.push(`[a${i}]`);
  if (i !== wavs.length - 1) seq.push(`[s${i}]`);
});
const speechWav = path.join(OUT, 'speech.wav');
const fc = [
  ...fcParts,
  ...wavs.slice(0, -1).map((_, i) => `anullsrc=r=48000:cl=stereo:d=${GAP}[s${i}]`),
  `${seq.join('')}concat=n=${seq.length}:v=0:a=1[aout]`,
].join(';');
const rr = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', ...inArgs, '-filter_complex', fc, '-map', '[aout]', '-c:a', 'pcm_s16le', speechWav], lf('speech'));
if (rr.status !== 0) { console.error(rr.text.split('\n').slice(-12).join('\n')); process.exit(1); }

// 4) 画面：真实片段循环铺底到语音时长（1080p，静音轨由后续 mux 提供）
const videoOnly = path.join(OUT, '_video.mp4');
const rv = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-stream_loop', '-1', '-i', CLIP, '-t', String(speechDur),
  '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', videoOnly], lf('video'));
if (rv.status !== 0) { console.error(rv.text.split('\n').slice(-10).join('\n')); process.exit(1); }

// 5) mux 成「外语视频」
const srcFile = path.join(OUT, 'source.mp4');
const rm = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-i', videoOnly, '-i', speechWav,
  '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
  '-shortest', '-movflags', '+faststart', srcFile], lf('mux'));
if (rm.status !== 0) { console.error(rm.text.split('\n').slice(-10).join('\n')); process.exit(1); }

const total = durationOf(srcFile, lf('dur'));
const gt = {
  generated_at: new Date().toISOString(),
  source: 'Tool/make_l2_bench.mjs',
  note: '语音为 SAPI Zira 离线合成（en-US），逐句合成后按固定静音间隔拼接，因此每句起止时间即真值；画面为 Big Buck Bunny（CC-BY 3.0）循环铺底。',
  language: 'en',
  tts: { engine: 'Windows SAPI5 / Microsoft Zira Desktop (en-US)', gap_s: GAP },
  duration_s: total,
  sentences,
  script: SCRIPT.join(' '),
};
fs.writeFileSync(path.join(OUT, 'ground_truth.json'), JSON.stringify(gt, null, 2));
fs.writeFileSync(path.join(OUT, 'reference_zh.json'), JSON.stringify({ note: '人工精译参考（用于对比机翻质量）', sentences: sentences.map((s) => ({ idx: s.idx, en: s.text, zh: s.ref_zh })) }, null, 2));

console.log(`[l2] source.mp4 ${total.toFixed(2)}s / ${(fs.statSync(srcFile).size / 1048576).toFixed(1)}MB / ${sentences.length} 句 / 语音 ${speechDur.toFixed(2)}s`);
for (const s of sentences) console.log(`   #${s.idx} [${s.start.toFixed(2)}–${s.end.toFixed(2)}] ${s.text.slice(0, 58)}…`);
