#!/usr/bin/env node
/**
 * asr_vosk.mjs 鈥?绂荤嚎璇煶璇嗗埆锛圴osk + koffi 鐩磋繛 libvosk.dll锛夛紝杈撳嚭甯﹁瘝绾ф椂闂存埑鐨?transcript
 *
 * 涓轰粈涔堜笉鐢?npm 鐨?vosk 鍖咃細瀹冧緷璧?ffi-napi锛堥渶 node-gyp 缂栬瘧锛屾湰鏈烘棤缂栬瘧閾撅級銆? * 杩欓噷鐢?koffi锛堥缂栬瘧 FFI锛屾棤闇€缂栬瘧锛夌洿杩?Vosk 鐨?C API锛屽彧鐢ㄥ埌 5 涓嚱鏁帮細
 *   vosk_model_new / vosk_recognizer_new / vosk_recognizer_accept_waveform / vosk_recognizer_result / vosk_recognizer_final_result
 *
 * 鐢ㄦ硶锛歯ode Tool/asr_vosk.mjs <audio|video> [--model <dir>] [--out transcript.json] [--lang en]
 * 璇存槑锛氳緭鍏ヨ嫢鏄棰戯紝鍏堢敤 ffmpeg 鎶?16k 鍗曞０閬?PCM锛沄osk 鍙悆 16k mono s16le銆? */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ffmpeg, durationOf, ROOT } from './lib/ff.mjs';

const args = process.argv.slice(2);
const input = args[0];
if (!input) { console.error('鐢ㄦ硶: node Tool/asr_vosk.mjs <audio|video> [--model dir] [--out file.json]'); process.exit(2); }
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const MODEL = path.resolve(getOpt('--model', path.join(ROOT, 'Workspace', 'asr', 'models', 'vosk-model-small-en-us-0.15')));
const OUT = path.resolve(getOpt('--out', path.join(ROOT, 'History', 'asr', 'transcript.json')));
const ASRDIR = path.join(ROOT, 'Workspace', 'asr');
const WORK = path.join(path.dirname(OUT), '.asr_work');
fs.mkdirSync(WORK, { recursive: true });

const require = createRequire(path.join(ASRDIR, 'index.cjs'));
const koffi = require('koffi');
const lib = koffi.load(path.join(ASRDIR, 'node_modules', 'vosk', 'lib', 'win-x86_64', 'libvosk.dll'));

// ---- 缁戝畾 Vosk C API ----
const vosk_model_new = lib.func('void *vosk_model_new(const char *model_path)');
const vosk_model_free = lib.func('void vosk_model_free(void *model)');
const vosk_recognizer_new = lib.func('void *vosk_recognizer_new(void *model, float sample_rate)');
const vosk_recognizer_free = lib.func('void vosk_recognizer_free(void *rec)');
const vosk_recognizer_accept_waveform = lib.func('int vosk_recognizer_accept_waveform(void *rec, const void *data, int len)');
const vosk_recognizer_result = lib.func('const char *vosk_recognizer_result(void *rec)');
const vosk_recognizer_final_result = lib.func('const char *vosk_recognizer_final_result(void *rec)');
const vosk_recognizer_set_words = lib.func('void vosk_recognizer_set_words(void *rec, int words)');

// ---- 1. 鎶介煶棰戜负 16k mono s16le 瑁?PCM锛堜笉鐢?WAV锛岄伩鍏?WAV 澶撮暱搴︿笉涓€鑷村鑷寸殑閿欎綅锛?---
const pcmFile = path.join(WORK, 'asr_16k.pcm');
const r = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-vn', '-ac', '1', '-ar', '16000', '-f', 's16le', '-acodec', 'pcm_s16le', pcmFile], path.join(WORK, 'extract.log'));
if (r.status !== 0) { console.error('鎶介煶棰戝け璐?', r.text.split('\n').slice(-6).join(' | ')); process.exit(1); }
const pcm = fs.readFileSync(pcmFile);
const audioDur = pcm.length / (16000 * 2);

// ---- 2. 璇嗗埆 ----
if (!fs.existsSync(MODEL)) { console.error('妯″瀷涓嶅瓨鍦?', MODEL, '锛堝厛璺?node Tool/fetch_vosk_model.mjs锛?); process.exit(1); }
const model = vosk_model_new(MODEL); console.error('[dbg] model', model);
if (!model || koffi.address(model) === 0n) { console.error('妯″瀷鍔犺浇澶辫触:', MODEL); process.exit(1); }
const rec = vosk_recognizer_new(model, 16000.0);
console.error('[dbg] rec', rec); vosk_recognizer_set_words(rec, 1);

const data = pcm; // 瑁?PCM锛氭棤澶撮儴鍋忕Щ闂
const CHUNK = 16000 * 2 * 0.5; // 0.5s
const partials = [];
for (let off = 0; off < data.length; off += CHUNK) {
  const seg = data.subarray(off, Math.min(off + CHUNK, data.length)); if (off === 0) console.error('[dbg] first seg len', seg.length);
  const ok = vosk_recognizer_accept_waveform(rec, seg, seg.length);
  if (ok) {
    const res = JSON.parse(vosk_recognizer_result(rec).toString());
    if (res.partial) partials.push(res.partial);
  }
}
const rawFinal = String(vosk_recognizer_final_result(rec)); console.error('[dbg] pcm', data.length, 'finalLen', rawFinal.length); const final = JSON.parse(rawFinal);
vosk_recognizer_free(rec);
vosk_model_free(model);

// ---- 3. 缁勮 transcript ----
const words = [];
for (const w of final.result || []) {
  if (w.word === undefined) continue;
  if (w.word === '[unk]') continue;
  words.push({ word: w.word, start: Number(w.start), end: Number(w.end), conf: Number(w.conf ?? 0) });
}
// Vosk 鐨?result 鏁扮粍閲屾病鏈夋爣鐐癸紱鎸夊仠椤?>0.45s)涓庨暱搴﹀垏鎴愬彞
const pauses = [];
const sentences = [];
let cur = [];
for (let i = 0; i < words.length; i++) {
  cur.push(words[i]);
  const nxt = words[i + 1];
  const gap = nxt ? nxt.start - words[i].end : 99;
  if (!nxt || gap > 0.45) {
    if (!nxt && gap !== 99) pauses.push(gap);
    sentences.push({ start: cur[0].start, end: cur[cur.length - 1].end, words: cur.slice() });
    cur = [];
  }
}
const text = words.map((w) => w.word).join(' ');
const out = {
  generated_at: new Date().toISOString(),
  engine: 'vosk',
  model: path.basename(MODEL),
  model_license: 'Apache-2.0',
  input: path.resolve(input),
  audio_duration_s: Number(audioDur.toFixed(3)),
  text,
  words,
  sentences: sentences.map((s) => ({ start: Number(s.start.toFixed(3)), end: Number(s.end.toFixed(3)), text: s.words.map((w) => w.word).join(' '), n: s.words.length })),
  stats: { words: words.length, sentences: sentences.length, avg_conf: words.length ? Number((words.reduce((a, w) => a + w.conf, 0) / words.length).toFixed(4)) : 0 },
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`[asr] ${path.basename(input)} -> ${words.length} words / ${sentences.length} sentences / audio ${audioDur.toFixed(2)}s / avg conf ${out.stats.avg_conf}`);
console.log(`[asr] text: ${text.slice(0, 220)}${text.length > 220 ? '鈥? : ''}`);
console.log(`[asr] -> ${OUT}`);

