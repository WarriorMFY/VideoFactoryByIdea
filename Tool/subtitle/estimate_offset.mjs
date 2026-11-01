#!/usr/bin/env node
// estimate_offset.mjs —— 用 ASR 词流给"外部字幕时间轴"标定恒定预卷偏移
//
// 场景：TED 等平台的 vtt cue 时间相对**片头预卷**，与视频实际播放时间差一个常量
// （小循环 14 EP-A 实测 +3.504s）。这个常量按站点/片头固定，但换片必须实测，
// 否则 align_script 按窗口分词的整条时间轴会整体错位。
//
// 做法：把真值每句拆成词，取首个 3-gram 在 ASR 词流里找位置，
// 差值 = asr_time(首词) - gt_time(首词)；对所有句子取中位数，剔除离群。
//
// 用法：
//   node Tool/subtitle/estimate_offset.mjs tr.json gt.json [--apply 3.504] [--out gt_shifted.json]
import fs from 'node:fs';

const args = process.argv.slice(2);
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const TR = JSON.parse(fs.readFileSync(args[0], 'utf8'));
const GT = JSON.parse(fs.readFileSync(args[1], 'utf8'));

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9'\s]/g, ' ').split(/\s+/).filter(Boolean);
const words = (TR.words || []).map(w => ({ ...w, n: norm(w.word || w.text || '')[0] || '' }));
if (!words.length) { console.error('transcript 无词级时间戳'); process.exit(1); }
const flat = words.map(w => w.n);

const sents = (GT.sentences || []).filter(s => Number.isFinite(s.start));
const deltas = [];
for (const s of sents) {
  const toks = norm(s.text);
  if (toks.length < 3) continue;
  // 在 ASR 词流里找这个 3-gram（顺序扫描，允许多次命中取第一个）
  let hit = -1;
  for (let i = 0; i + 2 < flat.length; i++) {
    if (flat[i] === toks[0] && flat[i + 1] === toks[1] && flat[i + 2] === toks[2]) { hit = i; break; }
  }
  if (hit < 0) continue;
  deltas.push({ d: +(words[hit].start - s.start).toFixed(3), gt: s.start, text: s.text.slice(0, 60) });
}

if (!deltas.length) { console.error('没有一句 3-gram 命中，检查 gt 文本是否与音频同源'); process.exit(1); }

const sorted = deltas.map(x => x.d).sort((a, b) => a - b);
const med = sorted[Math.floor(sorted.length / 2)];
const near = deltas.filter(x => Math.abs(x.d - med) < 1.5);
const final = +(near.reduce((a, b) => a + b.d, 0) / near.length).toFixed(3);

console.log(`[offset] 命中句=${deltas.length}/${sents.length} 中位数=${med}s 内点=${near.length} → **建议偏移 ${final}s**`);
const hist = {};
for (const x of deltas) { const k = (Math.round(x.d * 2) / 2).toFixed(1); hist[k] = (hist[k] || 0) + 1; }
console.log('[offset] 分布(0.5s 桶):', Object.entries(hist).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k}s×${v}`).join(' '));

const APPLY = getOpt('--apply', '');
const OUT = getOpt('--out', '');
if (APPLY && OUT) {
  const off = Number(APPLY);
  const out = { ...GT, sentences: sents.map(s => ({ ...s, start: +(s.start + off).toFixed(3), end: +(s.end + off).toFixed(3) })) };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log(`[offset] 已应用 ${off}s → ${OUT}（${out.sentences.length} 句）`);
}
