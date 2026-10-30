#!/usr/bin/env node
/**
 * asr_rescue.mjs — 短句救援：把"有声音但没识别出词"的片段挑出来，单独放大/滤波后再识别一遍
 *
 * 为什么需要（小循环 4 暴露的事实）：
 *   Tears of Steel 90s 片段上用官方字幕作真值，WER 30.5%、语音覆盖 59.9%，
 *   而**漏掉的几乎全是 1–3 词的短句**（`Abort!` / `Cut!` / `Nooooo!` / `I know.`，短句覆盖率仅 24%）。
 *   原因是 Vosk 的端点检测与小模型对"短促、被音乐压住"的一句话不敏感：
 *   整段喂进去时，这些 0.3–1.5s 的小段要么被当成噪声丢掉，要么被前后长句吞掉时间戳。
 *
 * 做法（不改模型、不改词表，只改"喂法"）：
 *   1. 用 20ms 帧能量找出"有声区间"（阈值 = 噪声底 p10 + 12dB）；
 *   2. 减掉基线 transcript 已覆盖的区间（±pad-cover），剩下的就是**疑似漏掉的地方**；
 *   3. 对每个候选窗单独切出来 → 带通 + 压缩 + 增益（把被音乐压住的对白"抬"出来）→ 识别；
 *   4. 回收的词按置信度 + 与既有词的时间重叠（IoU）过滤，合并回 transcript。
 *
 * 诚实说明：救援会**同时**带回一些音乐/音效被误识别的词 —— 收益看"短句覆盖率"，代价看"WER"，
 * 两个数都要报（由 acceptance/run_rescue_acceptance.mjs 量化）。
 *
 * 用法：
 *   node Tool/subtitle/asr_rescue.mjs <media> --transcript <基线.json> --out <救援后.json>
 *        [--pad 0.30] [--pad-cover 0.25] [--min-gap 0.20] [--min-dur 0.20] [--max-dur 5]
 *        [--min-conf 0.45] [--max-windows 80] [--thr-db auto] [--af "滤镜链"]
 */
import fs from 'node:fs';
import path from 'node:path';
import { ffmpeg, durationOf, run, ROOT } from '../lib/ff.mjs';
import { openRecognizer, DEFAULT_MODEL } from '../lib/vosk.mjs';

const args = process.argv.slice(2);
if (!args[0]) { console.error('用法: node Tool/subtitle/asr_rescue.mjs <media> --transcript <base.json> --out <out.json>'); process.exit(2); }
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const MEDIA = path.resolve(args[0]);
const BASE = path.resolve(getOpt('--transcript', ''));
const OUT = path.resolve(getOpt('--out', ''));
const MODEL = path.resolve(getOpt('--model', DEFAULT_MODEL));
if (!getOpt('--transcript', '') || !getOpt('--out', '')) { console.error('必须同时给 --transcript 与 --out'); process.exit(2); }

const P = {
  pad: Number(getOpt('--pad', 0.30)),          // 候选窗两端补的余量（防止切掉起始辅音）
  padCover: Number(getOpt('--pad-cover', 0.25)),// 基线词区间外扩多少算"已覆盖"
  minGap: Number(getOpt('--min-gap', 0.20)),   // 与已覆盖区最小间隔（小于此不算漏）
  minDur: Number(getOpt('--min-dur', 0.20)),
  maxDur: Number(getOpt('--max-dur', 5.0)),
  minConf: Number(getOpt('--min-conf', 0.45)),
  maxWindows: Number(getOpt('--max-windows', 80)),
  mergeGap: 0.25,                              // 有声帧间隔小于此则并成一段
  iouReject: 0.35,                             // 与既有词时间重叠超过此比例则丢弃
  af: getOpt('--af', 'highpass=f=180,lowpass=f=4200,acompressor=threshold=-26dB:ratio=4:attack=5:release=120:makeup=3'),
};
const THR_DB = getOpt('--thr-db', 'auto');

const WORK = path.join(path.dirname(OUT), '.rescue_work', `${path.basename(OUT, '.json')}_${process.pid}`);
fs.mkdirSync(WORK, { recursive: true });

const base = JSON.parse(fs.readFileSync(BASE, 'utf8'));
const baseWords = (base.words || []).slice();
const srcDur = durationOf(MEDIA, path.join(WORK, 'dur.log'));
if (!srcDur) { console.error('读不到媒体时长:', MEDIA); process.exit(1); }

// ---------- 1. 抽 16k mono 裸 PCM ----------
const pcmFile = path.join(WORK, 'full.pcm');
const r0 = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-i', MEDIA, '-vn', '-ac', '1', '-ar', '16000',
  '-f', 's16le', '-acodec', 'pcm_s16le', pcmFile], path.join(WORK, 'extract.log'));
if (r0.status !== 0) { console.error('抽音频失败:', r0.text.split('\n').slice(-4).join(' | ')); process.exit(1); }
const pcm = fs.readFileSync(pcmFile);
const audioDur = pcm.length / 32000;
if (Math.abs(audioDur - srcDur) > Math.max(1.0, srcDur * 0.02)) { console.error(`时长不符 PCM ${audioDur} vs ${srcDur}`); process.exit(1); }

// ---------- 2. 帧能量 → 有声区间 ----------
const FRAME = 320;                       // 20ms
const nFrames = Math.floor(pcm.length / 2 / FRAME);
const db = new Float32Array(nFrames);
for (let i = 0; i < nFrames; i++) {
  let sum = 0;
  const off = i * FRAME * 2;
  for (let j = 0; j < FRAME; j++) {
    const v = pcm.readInt16LE(off + j * 2) / 32768;
    sum += v * v;
  }
  const rms = Math.sqrt(sum / FRAME);
  db[i] = 20 * Math.log10(rms + 1e-9);
}
const sorted = Float32Array.from(db).sort();
const pct = (q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))];
const noise = pct(0.10);
const thr = THR_DB === 'auto' ? Math.max(noise + 12, -52) : Number(THR_DB);
const active = new Uint8Array(nFrames);
for (let i = 0; i < nFrames; i++) active[i] = db[i] > thr ? 1 : 0;

// 合并成区间（间隔 <= mergeGap 视为同一段）
let regions = [];
{
  let start = -1;
  for (let i = 0; i < nFrames; i++) {
    if (active[i] && start < 0) start = i;
    if (start >= 0) {
      const nextSilent = i + 1 >= nFrames || !active[i + 1];
      const gapFrames = Math.round(P.mergeGap / 0.02);
      let runEnd = i;
      if (nextSilent) {
        let k = i + 1;
        while (k < nFrames && k - i <= gapFrames && !active[k]) k++;
        if (k < nFrames && k - i <= gapFrames && active[k]) { i = k - 1; continue; }  // 短静音跨过去
        regions.push({ start: start * 0.02, end: (runEnd + 1) * 0.02 });
        start = -1;
      }
    }
  }
  if (start >= 0) regions.push({ start: start * 0.02, end: nFrames * 0.02 });
}
regions = regions.filter((g) => g.end - g.start >= 0.15);

// ---------- 3. 减掉基线已覆盖区间 ----------
const covered = baseWords.map((w) => ({ s: w.start - P.padCover, e: w.end + P.padCover })).sort((a, b) => a.s - b.s);
const merged = [];
for (const c of covered) {
  const last = merged[merged.length - 1];
  if (last && c.s <= last.e) last.e = Math.max(last.e, c.e);
  else merged.push({ ...c });
}
const uncovered = [];
for (const g of regions) {
  let pieces = [{ s: g.start, e: g.end }];
  for (const c of merged) {
    const next = [];
    for (const p of pieces) {
      if (c.e <= p.s || c.s >= p.e) { next.push(p); continue; }
      if (c.s - p.s > 0) next.push({ s: p.s, e: Math.min(c.s, p.e) });
      if (p.e - c.e > 0) next.push({ s: Math.max(c.e, p.s), e: p.e });
    }
    pieces = next;
  }
  for (const p of pieces) if (p.e - p.s >= P.minGap) uncovered.push({ start: p.s, end: p.e });
}
let candidates = uncovered
  .map((c) => ({ start: Math.max(0, c.start - P.pad), end: Math.min(srcDur, c.end + P.pad) }))
  .filter((c) => c.end - c.start >= P.minDur && c.end - c.start <= P.maxDur + 2 * P.pad);

// 3b) "词间大空档"候选：基线词与词之间空了 ≥ --gap-s 秒，但那段音频并不是安静，
//     说明中间可能有一句话被整体漏掉了（能量阈值高的时候，这种情况前面那套 VAD 抓不到）。
const GAP_S = Number(getOpt('--gap-s', 1.0));
const meanDb = (s, e) => {
  const i0 = Math.max(0, Math.round(s / 0.02));
  const i1 = Math.min(nFrames - 1, Math.round(e / 0.02));
  if (i1 <= i0) return -99;
  let sum = 0;
  for (let i = i0; i <= i1; i++) sum += db[i];
  return sum / (i1 - i0 + 1);
};
{
  const edges = [{ start: 0, end: baseWords.length ? baseWords[0].start : srcDur }].concat(
    baseWords.slice(1).map((w, i) => ({ start: baseWords[i].end, end: w.start })),
    baseWords.length ? [{ start: baseWords[baseWords.length - 1].end, end: srcDur }] : [],
  );
  for (const g of edges) {
    if (g.end - g.start < GAP_S) continue;
    if (meanDb(g.start, g.end) < noise + 6) continue;   // 真的是静音就不管
    candidates.push({ start: Math.max(0, g.start - 0.15), end: Math.min(srcDur, g.end + 0.15) });
  }
}
// 去重（重叠 ≥60% 的只保留长的）
candidates.sort((a, b) => (b.end - b.start) - (a.end - a.start));
{
  const keep = [];
  for (const c of candidates) {
    const len = c.end - c.start;
    if (keep.some((k) => Math.max(0, Math.min(k.end, c.end) - Math.max(k.start, c.start)) / Math.max(0.1, len) > 0.6)) continue;
    keep.push(c);
  }
  candidates = keep;
}
candidates = candidates.slice(0, P.maxWindows).sort((a, b) => a.start - b.start);

// ---------- 4. 逐窗识别 ----------
const rec = openRecognizer(MODEL);
const windows = [];
const added = [];
let rejectedConf = 0, rejectedOverlap = 0, emptyWindows = 0;
const overlapsBase = (w) => {
  const len = Math.max(0.05, w.end - w.start);
  for (const b of baseWords) {
    const ov = Math.max(0, Math.min(w.end, b.end) - Math.max(w.start, b.start));
    if (ov / len > P.iouReject) return true;
  }
  return false;
};
try {
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const dur = c.end - c.start;
    const wavPcm = path.join(WORK, `win_${String(i).padStart(3, '0')}.pcm`);
    // 先试预处理版（带通+压缩+增益）；没词再试原声
    const variants = [
      { name: 'af', extra: ['-af', P.af] },
      { name: 'raw', extra: [] },
    ];
    let best = null;
    for (const v of variants) {
      const rr = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-ss', c.start.toFixed(3), '-t', dur.toFixed(3),
        '-i', MEDIA, '-vn', '-ac', '1', '-ar', '16000', ...v.extra,
        '-f', 's16le', '-acodec', 'pcm_s16le', wavPcm], path.join(WORK, `cut_${i}_${v.name}.log`));
      if (rr.status !== 0 || !fs.existsSync(wavPcm)) continue;
      const buf = fs.readFileSync(wavPcm);
      if (buf.length < 3200) continue;
      const res = rec.recognize(buf);
      const words = res.words.map((w) => ({
        word: w.word,
        start: Number((w.start + c.start).toFixed(3)),
        end: Number((w.end + c.start).toFixed(3)),
        conf: w.conf,
      })).filter((w) => w.conf >= P.minConf);
      const score = words.length ? words.reduce((a, w) => a + w.conf, 0) + words.length * 0.2 : 0;
      if (!best || score > best.score) best = { score, words, variant: v.name };
      if (words.length >= 2 && words.reduce((a, w) => a + w.conf, 0) / words.length > 0.8) break;  // 够好就不再试
    }
    const got = best ? best.words : [];
    if (!got.length) { emptyWindows++; windows.push({ ...c, variant: best?.variant || null, words: 0 }); continue; }
    let kept = 0;
    for (const w of got) {
      if (!/^[a-z']+$/.test(w.word)) continue;
      if (overlapsBase(w)) { rejectedOverlap++; continue; }
      if (baseWords.some((b) => Math.abs(b.start - w.start) < 0.12 && b.word === w.word)) { rejectedOverlap++; continue; }
      added.push(w); kept++;
    }
    windows.push({ start: Number(c.start.toFixed(3)), end: Number(c.end.toFixed(3)), variant: best.variant, words: kept });
  }
} finally {
  rec.free();
}

// ---------- 5. 合并 + 输出 ----------
const words = baseWords.concat(added).sort((a, b) => a.start - b.start);
const sentences = [];
{
  let cur = [];
  for (let i = 0; i < words.length; i++) {
    cur.push(words[i]);
    const nxt = words[i + 1];
    const gap = nxt ? nxt.start - words[i].end : 99;
    if (!nxt || gap > 0.45) {
      sentences.push({ start: Number(cur[0].start.toFixed(3)), end: Number(cur[cur.length - 1].end.toFixed(3)), text: cur.map((w) => w.word).join(' '), n: cur.length });
      cur = [];
    }
  }
}
const out = {
  generated_at: new Date().toISOString(),
  engine: 'vosk+rescue',
  model: path.basename(MODEL),
  model_license: 'Apache-2.0',
  input: MEDIA,
  base_transcript: BASE,
  audio_duration_s: Number(audioDur.toFixed(3)),
  text: words.map((w) => w.word).join(' '),
  words,
  sentences,
  stats: {
    words: words.length, sentences: sentences.length,
    avg_conf: words.length ? Number((words.reduce((a, w) => a + w.conf, 0) / words.length).toFixed(4)) : 0,
    added: added.length,
  },
  rescue: {
    params: P,
    threshold_db: Number(thr.toFixed(1)),
    noise_floor_db: Number(noise.toFixed(1)),
    speech_regions: regions.length,
    uncovered_regions: uncovered.length,
    windows_tried: candidates.length,
    windows_empty: emptyWindows,
    words_added: added.length,
    rejected_low_conf: rejectedConf,
    rejected_overlap: rejectedOverlap,
    window_detail: windows,
    added_words: added,
  },
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
fs.rmSync(WORK, { recursive: true, force: true });

console.log(`[rescue] 有声区间 ${regions.length} / 未被基线覆盖 ${uncovered.length} / 试识别窗口 ${candidates.length}`);
console.log(`[rescue] 空窗 ${emptyWindows} / 新增词 ${added.length} / 重叠丢弃 ${rejectedOverlap} / 低置信丢弃 ${rejectedConf}`);
console.log(`[rescue] 词数 ${baseWords.length} → ${words.length}，新增：${added.map((w) => `${w.word}@${w.start}s`).join(' ') || '(无)'}`);
console.log(`[rescue] -> ${OUT}`);
