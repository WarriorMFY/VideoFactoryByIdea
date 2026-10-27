#!/usr/bin/env node
/**
 * asr_vosk.mjs — 离线语音识别（Vosk + koffi 直连 libvosk.dll），输出带词级时间戳的 transcript
 *
 * 为什么不用 npm 的 vosk 包：它依赖 ffi-napi（需 node-gyp 编译，本机无编译链）。
 * 这里用 koffi（预编译 FFI，无需编译）直连 Vosk 的 C API，只用到 5 个函数：
 *   vosk_model_new / vosk_recognizer_new / vosk_recognizer_accept_waveform / vosk_recognizer_result / vosk_recognizer_final_result
 *
 * 用法：node Tool/asr_vosk.mjs <audio|video> [--model <dir>] [--out transcript.json] [--lang en]
 * 说明：输入若是视频，先用 ffmpeg 抽 16k 单声道 PCM；Vosk 只吃 16k mono s16le。
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ffmpeg, durationOf, ROOT } from '../lib/ff.mjs';

const args = process.argv.slice(2);
const input = args[0];
if (!input) { console.error('用法: node Tool/asr_vosk.mjs <audio|video> [--model dir] [--out file.json]'); process.exit(2); }
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const MODEL = path.resolve(getOpt('--model', path.join(ROOT, 'Workspace', 'asr', 'models', 'vosk-model-small-en-us-0.15')));
const OUT = path.resolve(getOpt('--out', path.join(ROOT, 'History', 'asr', 'transcript.json')));
const AF = getOpt('--af', '');   // 可选音频预处理链，例如 "highpass=f=200,loudnorm=I=-16"
const ASRDIR = path.join(ROOT, 'Workspace', 'asr');
const WORK = path.join(path.dirname(OUT), '.asr_work');
fs.mkdirSync(WORK, { recursive: true });

const require = createRequire(path.join(ASRDIR, 'index.cjs'));
const koffi = require('koffi');
const lib = koffi.load(path.join(ASRDIR, 'node_modules', 'vosk', 'lib', 'win-x86_64', 'libvosk.dll'));

// ---- 绑定 Vosk C API ----
const vosk_model_new = lib.func('void *vosk_model_new(const char *model_path)');
const vosk_model_free = lib.func('void vosk_model_free(void *model)');
const vosk_recognizer_new = lib.func('void *vosk_recognizer_new(void *model, float sample_rate)');
const vosk_recognizer_free = lib.func('void vosk_recognizer_free(void *rec)');
const vosk_recognizer_accept_waveform = lib.func('int vosk_recognizer_accept_waveform(void *rec, const void *data, int len)');
const vosk_recognizer_result = lib.func('const char *vosk_recognizer_result(void *rec)');
const vosk_recognizer_final_result = lib.func('const char *vosk_recognizer_final_result(void *rec)');
const vosk_recognizer_set_words = lib.func('void vosk_recognizer_set_words(void *rec, int words)');

// ---- 1. 抽音频为 16k mono s16le 裸 PCM（不用 WAV，避免 WAV 头长度不一致导致的错位）----
const pcmFile = path.join(WORK, 'asr_16k.pcm');
const extractArgs = ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-vn', '-ac', '1', '-ar', '16000'];
if (AF) extractArgs.push('-af', AF);   // 真实素材常带音乐/音效，预处理能明显影响识别率
extractArgs.push('-f', 's16le', '-acodec', 'pcm_s16le', pcmFile);
const r = ffmpeg(extractArgs, path.join(WORK, 'extract.log'));
if (r.status !== 0) { console.error('抽音频失败:', r.text.split('\n').slice(-6).join(' | ')); process.exit(1); }
const pcm = fs.readFileSync(pcmFile);
const audioDur = pcm.length / (16000 * 2);

// ---- 2. 识别 ----
if (!fs.existsSync(MODEL)) { console.error('模型不存在:', MODEL, '（先跑 node Tool/fetch_vosk_model.mjs）'); process.exit(1); }
const model = vosk_model_new(MODEL);
if (!model || koffi.address(model) === 0n) { console.error('模型加载失败:', MODEL); process.exit(1); }
const rec = vosk_recognizer_new(model, 16000.0);
vosk_recognizer_set_words(rec, 1);
if (process.env.ASR_DEBUG) console.error('[dbg] model=', model, 'rec=', rec, 'pcm=', pcm.length, 'modelDir=', MODEL);

const data = pcm; // 裸 PCM：无头部偏移问题
const CHUNK = 16000 * 2 * 0.5; // 0.5s
const segResults = [];
let acceptHits = 0;
for (let off = 0; off < data.length; off += CHUNK) {
  const seg = data.subarray(off, Math.min(off + CHUNK, data.length));
  const ok = vosk_recognizer_accept_waveform(rec, seg, seg.length);
  if (ok) {
    acceptHits++;
    const res = JSON.parse(vosk_recognizer_result(rec).toString());
    // 注意：Vosk 每识别完一段（端点检测命中）就通过 result() 吐出该段结果并把它从内部缓冲移走；
    // final_result() 只返回"最后残留的一点尾巴"，常见是空 —— 所以必须逐段收集 res.result。
    if (res.result && res.result.length) segResults.push(res);
  }
}
const final = JSON.parse(vosk_recognizer_final_result(rec).toString());
if (process.env.ASR_DEBUG) console.error('[dbg] chunks=', Math.ceil(data.length / CHUNK), 'acceptHits=', acceptHits, 'segments=', segResults.length, 'finalWords=', (final.result || []).length);
vosk_recognizer_free(rec);
vosk_model_free(model);

// ---- 3. 组装 transcript（逐段结果 + final 尾巴，按时间去重） ----
const rawWords = [];
for (const seg of segResults) for (const w of seg.result || []) rawWords.push(w);
for (const w of final.result || []) rawWords.push(w);
rawWords.sort((a, b) => a.start - b.start);
const words = [];
let lastEnd = -1;
for (const w of rawWords) {
  if (w.word === undefined || w.word === '[unk]') continue;
  if (Number(w.start) < lastEnd - 0.05) continue; // 去重（段与段之间可能有重叠词）
  words.push({ word: w.word, start: Number(w.start), end: Number(w.end), conf: Number(w.conf ?? 0) });
  lastEnd = Number(w.end);
}
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
console.log(`[asr] ${path.basename(input)} -> ${words.length} words / ${sentences.length} sentences / audio ${audioDur.toFixed(2)}s / avg conf ${out.stats.avg_conf}`);
console.log(`[asr] text: ${text.slice(0, 220)}${text.length > 220 ? '…' : ''}`);
console.log(`[asr] -> ${OUT}`);
