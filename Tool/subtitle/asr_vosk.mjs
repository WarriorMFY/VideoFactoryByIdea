#!/usr/bin/env node
/**
 * asr_vosk.mjs — 离线语音识别（Vosk），输出带词级时间戳的 transcript
 *
 * 识别内核在 `Tool/lib/vosk.mjs`（koffi 直连 libvosk.dll）；本脚本只负责
 * "抽音频 → 调内核 → 组装 transcript"，这样短句救援（asr_rescue.mjs）能复用同一个模型实例。
 *
 * 用法：node Tool/asr_vosk.mjs <audio|video> [--model <dir>] [--out transcript.json] [--af "滤镜链"]
 * 说明：输入若是视频，先用 ffmpeg 抽 16k 单声道裸 PCM；Vosk 只吃 16k mono s16le。
 */
import fs from 'node:fs';
import path from 'node:path';
import { ffmpeg, durationOf, ROOT } from '../lib/ff.mjs';
import { openRecognizer, DEFAULT_MODEL } from '../lib/vosk.mjs';

const args = process.argv.slice(2);
const input = args[0];
if (!input) { console.error('用法: node Tool/asr_vosk.mjs <audio|video> [--model dir] [--out file.json] [--af 滤镜链]'); process.exit(2); }
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const MODEL = path.resolve(getOpt('--model', DEFAULT_MODEL));
const OUT = path.resolve(getOpt('--out', path.join(ROOT, 'History', 'asr', 'transcript.json')));
const AF = getOpt('--af', '');   // 可选音频预处理链，例如 "highpass=f=200,loudnorm=I=-16"
// 工作目录必须**每次独立**：曾经用固定的 .asr_work，结果同一目录被两个识别进程共用
// （上一个被 kill 的 job 留下的孤儿进程 + 新进程），读回来的 PCM 是别人的音频，
// 于是"33 秒的片子"识别出 262 秒的词、字幕时间码全错位。用 pid + 输出名隔离。
const WORK = path.join(path.dirname(OUT), '.asr_work', `${path.basename(OUT, '.json')}_${process.pid}`);
fs.mkdirSync(WORK, { recursive: true });

// ---- 1. 抽音频为 16k mono s16le 裸 PCM（不用 WAV，避免 WAV 头长度不一致导致的错位）----
const pcmFile = path.join(WORK, 'asr_16k.pcm');
const extractArgs = ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-vn', '-ac', '1', '-ar', '16000'];
if (AF) extractArgs.push('-af', AF);   // 真实素材常带音乐/音效，预处理能明显影响识别率
extractArgs.push('-f', 's16le', '-acodec', 'pcm_s16le', pcmFile);
const r = ffmpeg(extractArgs, path.join(WORK, 'extract.log'));
if (r.status !== 0) { console.error('抽音频失败:', r.text.split('\n').slice(-6).join(' | ')); process.exit(1); }
const pcm = fs.readFileSync(pcmFile);
const audioDur = pcm.length / (16000 * 2);
// 自检：抽出来的音频时长必须和输入对得上（防"读到别人的 PCM"这类静默错误）
const srcDur = durationOf(input, path.join(WORK, 'src_dur.log'));
if (srcDur > 1 && Math.abs(audioDur - srcDur) > Math.max(1.0, srcDur * 0.02)) {
  console.error(`抽音频时长与输入不符：PCM ${audioDur.toFixed(2)}s vs 输入 ${srcDur.toFixed(2)}s（${WORK}）`);
  process.exit(1);
}

// ---- 2. 识别 ----
const rec = openRecognizer(MODEL);
let words;
try {
  const res = rec.recognize(pcm, { debug: !!process.env.ASR_DEBUG });
  if (process.env.ASR_DEBUG) console.error('[dbg] pcm=', pcm.length, 'modelDir=', MODEL);
  words = res.words;
} finally {
  rec.free();
}

// ---- 3. 组装 transcript ----
// Vosk 的 result 数组里没有标点；按停顿切成句（只用于概览，字幕断句在 make_subs 里另有逻辑）
const sentences = [];
let cur = [];
for (let i = 0; i < words.length; i++) {
  cur.push(words[i]);
  const nxt = words[i + 1];
  const gap = nxt ? nxt.start - words[i].end : 99;
  if (!nxt || gap > 0.45) {
    sentences.push({ start: cur[0].start, end: cur[cur.length - 1].end, text: cur.map((w) => w.word).join(' '), n: cur.length });
    cur = [];
  }
}
const text = words.map((w) => w.word).join(' ');
const out = {
  generated_at: new Date().toISOString(),
  engine: 'vosk',
  model: path.basename(MODEL),
  model_license: 'Apache-2.0',
  audio_filter: AF || null,
  input: path.resolve(input),
  audio_duration_s: Number(audioDur.toFixed(3)),
  text,
  words,
  sentences: sentences.map((s) => ({ start: Number(s.start.toFixed(3)), end: Number(s.end.toFixed(3)), text: s.text, n: s.n })),
  stats: { words: words.length, sentences: sentences.length, avg_conf: words.length ? Number((words.reduce((a, w) => a + w.conf, 0) / words.length).toFixed(4)) : 0 },
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
fs.rmSync(WORK, { recursive: true, force: true }); // 临时 PCM 占空间（16k 单声道 ≈ 32KB/s），用完即删
console.log(`[asr] ${path.basename(input)} -> ${words.length} words / ${sentences.length} sentences / audio ${audioDur.toFixed(2)}s / avg conf ${out.stats.avg_conf}`);
console.log(`[asr] text: ${text.slice(0, 220)}${text.length > 220 ? '…' : ''}`);
console.log(`[asr] -> ${OUT}`);
