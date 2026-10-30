/**
 * lib/vosk.mjs — Vosk 识别内核（koffi 直连 libvosk.dll），供 asr_vosk / asr_rescue 共用
 *
 * 为什么抽出来：
 *   1. `asr_vosk.mjs` 需要一个"整段识别"入口；
 *   2. 小循环 7 的"短句救援"要对**几十个小窗口**做识别 —— 若每个窗口都起一个 node 进程（= 重新加载模型），
 *      光是模型加载就要 40s+；抽成库之后同一个进程里换 PCM 反复识别，模型只加载一次。
 *
 * 关键实现事实（都是踩坑留下的）：
 *   · Vosk 每识别完一段（端点检测命中）就通过 `result()` 吐出该段结果**并把它从内部缓冲移走**；
 *     `final_result()` 只返回最后残留的尾巴，常见是空 —— 所以必须逐段收集 `res.result`。
 *   · PCM 必须是 16k 单声道 s16le **裸数据**（WAV 头长度不固定，按 44 字节跳会读出垃圾）。
 *   · 段与段之间可能重叠，需按时间戳去重，否则同一句会出现两遍。
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT } from './ff.mjs';

const ASRDIR = path.join(ROOT, 'Workspace', 'asr');
const LIB_PATH = path.join(ASRDIR, 'node_modules', 'vosk', 'lib', 'win-x86_64', 'libvosk.dll');

export const DEFAULT_MODEL = path.join(ROOT, 'Workspace', 'asr', 'models', 'vosk-model-small-en-us-0.15');

let _koffi = null;
let _fns = null;

function bindings() {
  if (_fns) return _fns;
  if (!fs.existsSync(LIB_PATH)) throw new Error(`找不到 libvosk.dll：${LIB_PATH}（先跑 node Tool/setup/bootstrap_asr.mjs）`);
  const require = createRequire(path.join(ASRDIR, 'index.cjs'));
  _koffi = _koffi || require('koffi');
  const lib = _koffi.load(LIB_PATH);
  _fns = {
    model_new: lib.func('void *vosk_model_new(const char *model_path)'),
    model_free: lib.func('void vosk_model_free(void *model)'),
    rec_new: lib.func('void *vosk_recognizer_new(void *model, float sample_rate)'),
    rec_free: lib.func('void vosk_recognizer_free(void *rec)'),
    accept: lib.func('int vosk_recognizer_accept_waveform(void *rec, const void *data, int len)'),
    result: lib.func('const char *vosk_recognizer_result(void *rec)'),
    final: lib.func('const char *vosk_recognizer_final_result(void *rec)'),
    set_words: lib.func('void vosk_recognizer_set_words(void *rec, int words)'),
  };
  return _fns;
}

/** 段结果合并 + 去重（v1 逻辑原样搬过来，行为不变） */
export function mergeWords(segResults, finalWords) {
  const raw = [];
  for (const seg of segResults) for (const w of seg.result || []) raw.push(w);
  for (const w of finalWords || []) raw.push(w);
  raw.sort((a, b) => a.start - b.start);
  const words = [];
  let lastEnd = -1;
  for (const w of raw) {
    if (w.word === undefined || w.word === '[unk]') continue;
    if (Number(w.start) < lastEnd - 0.05) continue;
    words.push({ word: w.word, start: Number(w.start), end: Number(w.end), conf: Number(w.conf ?? 0) });
    lastEnd = Number(w.end);
  }
  return words;
}

/**
 * 打开一个识别器（模型只加载一次，可反复 recognize）。
 *
 * 注意：**每次 recognize 都会新建一个 recognizer**。Vosk 的 recognizer 是有状态的
 * （端点检测 + 解码链 + 时间戳都接着上一次继续），复用它去识别"另一段音频"会得到
 * 递加的假时间戳（实测：90s 素材的救援窗里出现了 105s / 112s 的词）。模型复用即可，
 * 建 recognizer 的成本可以忽略。
 *
 * @param {string} modelDir Vosk 模型目录
 * @param {number} sampleRate 采样率（PCM 必须与之匹配，默认 16000）
 */
export function openRecognizer(modelDir = DEFAULT_MODEL, sampleRate = 16000) {
  if (!fs.existsSync(modelDir)) throw new Error(`模型不存在：${modelDir}`);
  const f = bindings();
  const model = f.model_new(modelDir);
  if (!model || _koffi.address(model) === 0n) throw new Error(`模型加载失败：${modelDir}`);
  let freed = false;

  return {
    /**
     * 识别一段裸 PCM（s16le）。
     * @param {Buffer} pcm
     * @param {{chunkSec?: number, debug?: boolean}} opts
     * @returns {{words: Array, acceptHits: number, segments: number, stats: object}}
     */
    recognize(pcm, opts = {}) {
      if (freed) throw new Error('recognizer 已释放');
      const chunkSec = opts.chunkSec || 0.5;
      const CHUNK = Math.max(2, Math.round(sampleRate * 2 * chunkSec));
      const rec = f.rec_new(model, sampleRate);
      f.set_words(rec, 1);
      const segResults = [];
      let acceptHits = 0;
      try {
        for (let off = 0; off < pcm.length; off += CHUNK) {
          const seg = pcm.subarray(off, Math.min(off + CHUNK, pcm.length));
          if (f.accept(rec, seg, seg.length)) {
            acceptHits++;
            const res = JSON.parse(f.result(rec).toString());
            if (res.result && res.result.length) segResults.push(res);
          }
        }
        const final = JSON.parse(f.final(rec).toString());
        const words = mergeWords(segResults, final.result);
        if (opts.debug) console.error(`[vosk] chunks=${Math.ceil(pcm.length / CHUNK)} acceptHits=${acceptHits} segments=${segResults.length} finalWords=${(final.result || []).length} words=${words.length}`);
        return {
          words,
          acceptHits,
          segments: segResults.length,
          stats: {
            words: words.length,
            avg_conf: words.length ? Number((words.reduce((a, w) => a + w.conf, 0) / words.length).toFixed(4)) : 0,
          },
        };
      } finally {
        f.rec_free(rec);
      }
    },
    free() {
      if (freed) return;
      freed = true;
      f.model_free(model);
    },
  };
}
