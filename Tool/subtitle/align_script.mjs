#!/usr/bin/env node
/**
 * align_script.mjs — 有讲稿/官方字幕时，用"真值句子"强制对齐 ASR 词流（而不是靠停顿猜断句）
 *
 * 为什么需要（小循环 12 实测）：
 *   TTS/连续口播的素材里，Vosk 给出的词时间轴常常是**首尾相接**的（词间 gap 中位数 0.000s），
 *   `restore_punct` 靠"停顿分位"断句就会把 7 句并成 5 句，还把 `number two` 听成 `number to` 之后又串行。
 *   而知识型内容恰恰经常**有讲稿/官方字幕/slide 文案** —— 这时最稳的做法是：
 *   拿真值句子，按时间把词分给每句，再让 make_subs 用这套句子去翻译。
 *
 * 做法：对每个真值句子 [start,end]，取"词中心落在区间内"的词；相邻句子边界上的词按重叠多少归给更近的一句。
 * 输出与 restore_punct 同构（sentences[].w0/w1/text/start/end），可直接喂 make_subs --punct。
 *
 * 用法：node Tool/subtitle/align_script.mjs <transcript.json> <ground_truth.json> --out <aligned.json> [--punct-file <script.srt|txt>]
 * 输出：对齐后的 transcript + 控制台报告（每句命中词数、未分配词数）
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../lib/ff.mjs';

const args = process.argv.slice(2);
if (args.length < 2) { console.error('用法: node Tool/subtitle/align_script.mjs <transcript.json> <ground_truth.json> --out <aligned.json>'); process.exit(2); }
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const TR = JSON.parse(fs.readFileSync(path.resolve(ROOT, args[0]), 'utf8'));
const GT = JSON.parse(fs.readFileSync(path.resolve(ROOT, args[1]), 'utf8'));
const OUT = path.resolve(ROOT, getOpt('--out', ''));
if (!getOpt('--out', '')) { console.error('必须给 --out'); process.exit(2); }

const words = TR.words || [];
if (!words.length) { console.error('transcript 没有词级时间戳'); process.exit(1); }
const gtSents = (GT.sentences || []).filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end));
if (!gtSents.length) { console.error('ground_truth 没有 sentences[].start/end'); process.exit(1); }

// 词归属：按词中心点落在哪个真值区间；边界落在缝里的词，归给"时间上更近"的那句
const centers = words.map((w) => ({ i: words.indexOf(w), c: (w.start + w.end) / 2 }));
const assigned = gtSents.map(() => []);
let unassigned = 0;
centers.forEach(({ i, c }) => {
  let best = -1, bestDist = Infinity;
  gtSents.forEach((s, k) => {
    const inside = c >= s.start - 0.05 && c <= s.end + 0.05;
    const dist = inside ? 0 : Math.min(Math.abs(c - s.start), Math.abs(c - s.end));
    if (dist < bestDist) { bestDist = dist; best = k; }
  });
  if (best >= 0 && bestDist <= 0.6) assigned[best].push(i);
  else unassigned++;
});

// 修正：保证每个词只出现一次、且句内索引连续（Vosk 词序已按时间排序，取 min/max 即可）
const sentences = gtSents.map((s, k) => {
  const idxs = assigned[k];
  const w0 = idxs.length ? Math.min(...idxs) : -1;
  const w1 = idxs.length ? Math.max(...idxs) : -1;
  return {
    start: Number(s.start.toFixed(3)), end: Number(s.end.toFixed(3)),
    text: String(s.text || '').trim(),
    w0, w1, n: idxs.length,
  };
}).filter((s) => s.w0 >= 0);

const covered = sentences.reduce((a, s) => a + s.n, 0);
const out = {
  ...TR,
  generated_at: new Date().toISOString(),
  aligned_by: 'align_script.mjs',
  align_from: { transcript: args[0], ground_truth: args[1] },
  sentences,
  align_stats: { words: words.length, covered, unassigned, sentences: sentences.length },
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));

console.log(`[align] ${words.length} 词 → ${sentences.length} 句（覆盖 ${covered} 词 / 未分配 ${unassigned}）`);
for (const s of sentences) console.log(`   ${s.start.toFixed(2)}–${s.end.toFixed(2)} [${s.w0}..${s.w1}] ${s.text.slice(0, 72)}`);
console.log(`[align] -> ${path.relative(ROOT, OUT)}`);
