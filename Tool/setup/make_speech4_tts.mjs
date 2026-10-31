#!/usr/bin/env node
/**
 * make_speech4_tts.mjs — 小循环 4：造「带逐句真值」的多口音英文样本（补真实素材无法算 WER 的短板）
 *
 * 做法与 Tool/bench/make_l2_bench.mjs 相同（逐句 Edge TTS → 已知起止时间 → 拼接 → 画面铺底），
 * 区别是**同一段讲稿换 4 个口音/音色**，用来回答："识别/翻译质量对口音有多敏感？"
 *   en-US-AriaNeural / en-GB-SoniaNeural / en-AU-NatashaNeural / en-IN-NeerjaNeural
 *
 * 用法：node Tool\setup\make_speech4_tts.mjs [--out Workspace/assets/speech4tts] [--gap 0.35]
 * 输出：<out>/<voice>/{source.mp4, ground_truth.json, reference_zh.json, script.txt}
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ffmpeg, durationOf, ROOT } from '../lib/ff.mjs';

const args = process.argv.slice(2);
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const OUT = path.resolve(ROOT, getOpt('--out', 'Workspace/assets/speech4tts'));
const GAP = Number(getOpt('--gap', 0.35));
// 画面铺底：用已下载的 Big Buck Bunny 预告片（CC-BY 3.0），避免再造素材
const BACKDROP = path.join(ROOT, 'Workspace', 'assets', 'speech4', 'bbb_trailer', 'bbb_trailer.mp4');
fs.mkdirSync(OUT, { recursive: true });

// 讲稿：故意包含数字、单位、专有名词、从句，便于观察不同口音下的识别与翻译差异
const SCRIPT = [
  'Good evening, and welcome to the second half of our factory tour.',
  'In the next five minutes, you will see how a raw clip becomes a finished film.',
  'The robot arm picks up twelve small boxes and stacks them beside the conveyor belt.',
  'Notice that the editor never touches the color wheel before the sound is balanced.',
  'If the dialogue is louder than the music by more than six decibels, the audience will complain.',
  'That is all for tonight; thank you for watching, and see you tomorrow at eight.',
];
const REF_ZH = [
  '晚上好，欢迎来到我们工厂参观的下半场。',
  '在接下来的五分钟里，你会看到一段原始素材如何变成一部成片。',
  '机械臂拿起十二个小箱子，把它们堆在传送带旁边。',
  '注意，剪辑师在声音平衡之前，绝不会去碰色轮。',
  '如果对白比音乐响超过六分贝，观众就会抱怨。',
  '今晚就到这里，感谢收看，我们明晚八点见。',
];

const VOICES = [
  ['en-US-Aria', 'en-US-AriaNeural', '美音女声'],
  ['en-GB-Sonia', 'en-GB-SoniaNeural', '英音女声'],
  ['en-AU-Natasha', 'en-AU-NatashaNeural', '澳音女声'],
  ['en-IN-Neerja', 'en-IN-NeerjaNeural', '印度英语女声'],
];

if (!fs.existsSync(BACKDROP)) {
  console.error(`缺少铺底素材 ${BACKDROP}（先跑 node Tool\\setup\\fetch_more_speech.mjs）`);
  process.exit(1);
}

const require = createRequire(path.join(ROOT, 'Workspace', 'deps', 'asr', 'index.cjs'));
const { EdgeTTS } = require('@andresaya/edge-tts');

for (const [dirName, voice, desc] of VOICES) {
  const dir = path.join(OUT, dirName);
  const ttsDir = path.join(dir, 'tts');
  fs.mkdirSync(ttsDir, { recursive: true });
  const lf = (n) => path.join(dir, `_${n}.log`);
  fs.writeFileSync(path.join(dir, 'script.txt'), `${SCRIPT.join('\n')}\n`);
  console.log(`\n[tts] ${dirName} (${desc} / ${voice})`);

  const wavs = [];
  const durs = [];
  for (let i = 0; i < SCRIPT.length; i++) {
    const mp3 = path.join(ttsDir, `${String(i).padStart(3, '0')}.mp3`);
    const wav = path.join(ttsDir, `${String(i).padStart(3, '0')}.wav`);
    if (!(fs.existsSync(mp3) && fs.statSync(mp3).size > 2000)) {
      let ok = false; let lastErr = null;
      for (let attempt = 0; attempt < 3 && !ok; attempt++) {
        try {
          const tts = new EdgeTTS();
          await tts.synthesize(SCRIPT[i], voice, { rate: '+0%' });
          const buf = await tts.toBuffer();
          if (!buf || buf.length < 2000) throw new Error(`输出异常 ${buf?.length ?? 0} 字节`);
          fs.writeFileSync(mp3, buf);
          ok = true;
        } catch (e) { lastErr = e; await new Promise((r) => setTimeout(r, 1500)); }
      }
      if (!ok) throw new Error(`TTS 失败（${voice} 第 ${i} 句）: ${lastErr?.message || '未知'}`);
    }
    // 去掉句首尾静音（否则真值时长里混入静音，会让覆盖率指标虚低）
    const r = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-i', mp3,
      '-af', 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.03,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.03,areverse',
      '-ac', '2', '-ar', '48000', '-c:a', 'pcm_s16le', wav], lf(`wav_${i}`));
    if (r.status !== 0) throw new Error(`转码失败（${voice} 第 ${i} 句）: ${r.text.split('\n').slice(-2).join(' ')}`);
    wavs.push(wav);
    durs.push(durationOf(wav, lf('dur')));
  }

  // 拼成一条音轨（句子 + 固定静音间隔；anullsrc 每段要独立标签）
  const sentences = [];
  let t = 0;
  SCRIPT.forEach((s, i) => {
    sentences.push({ idx: i, text: s, ref_zh: REF_ZH[i], start: Number(t.toFixed(3)), end: Number((t + durs[i]).toFixed(3)), dur: Number(durs[i].toFixed(3)) });
    t += durs[i] + GAP;
  });
  const speechDur = Number(t.toFixed(3));
  const inArgs = [];
  const fcParts = [];
  wavs.forEach((w, i) => {
    inArgs.push('-i', w);
    fcParts.push(`[${i}:a]aresample=48000,aformat=sample_rates=48000:channel_layouts=stereo[a${i}]`);
  });
  const seq = [];
  wavs.forEach((_, i) => {
    seq.push(`[a${i}]`);
    if (i !== wavs.length - 1) seq.push(`[s${i}]`);
  });
  const fc = [
    ...fcParts,
    ...wavs.slice(0, -1).map((_, i) => `anullsrc=r=48000:cl=stereo:d=${GAP}[s${i}]`),
    `${seq.join('')}concat=n=${seq.length}:v=0:a=1[aout]`,
  ].join(';');
  const speechWav = path.join(dir, 'speech.wav');
  const rr = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', ...inArgs, '-filter_complex', fc, '-map', '[aout]', '-c:a', 'pcm_s16le', speechWav], lf('speech'));
  if (rr.status !== 0) throw new Error(`拼接失败: ${rr.text.split('\n').slice(-4).join(' ')}`);

  // 画面铺底 + mux
  const videoOnly = path.join(dir, '_video.mp4');
  const rv = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-stream_loop', '-1', '-i', BACKDROP, '-t', String(speechDur),
    '-an', '-vf', 'scale=854:480', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', videoOnly], lf('video'));
  if (rv.status !== 0) throw new Error(`铺底失败: ${rv.text.split('\n').slice(-3).join(' ')}`);
  const srcFile = path.join(dir, 'source.mp4');
  const rm = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-i', videoOnly, '-i', speechWav,
    '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
    '-shortest', '-movflags', '+faststart', srcFile], lf('mux'));
  if (rm.status !== 0) throw new Error(`mux 失败: ${rm.text.split('\n').slice(-3).join(' ')}`);

  const total = durationOf(srcFile, lf('dur2'));
  const gt = {
    generated_at: new Date().toISOString(),
    source: 'Tool/setup/make_speech4_tts.mjs',
    note: `逐句 Edge TTS 合成（${voice}，${desc}）后按固定静音间隔拼接，句子起止即真值；画面为 Big Buck Bunny 预告片（CC-BY 3.0）铺底。`,
    language: 'en',
    tts: { engine: 'Edge TTS', voice, desc, gap_s: GAP, backdrop: 'Big Buck Bunny trailer (CC-BY 3.0)' },
    duration_s: total,
    sentences,
    script: SCRIPT.join(' '),
  };
  fs.writeFileSync(path.join(dir, 'ground_truth.json'), JSON.stringify(gt, null, 2));
  fs.writeFileSync(path.join(dir, 'reference_zh.json'), JSON.stringify({ note: '人工精译参考（用于对比机翻质量）', sentences: sentences.map((s) => ({ idx: s.idx, en: s.text, zh: s.ref_zh })) }, null, 2));
  console.log(`   source.mp4 ${total.toFixed(2)}s / 语音 ${speechDur.toFixed(2)}s / ${sentences.length} 句`);
}

console.log(`\n[done] TTS 样本 → ${OUT}`);
