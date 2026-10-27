#!/usr/bin/env node
/**
 * make_zh_agent.mjs — 生成"人工精译"字幕文件（--mt agent 的输入）
 *
 * 做法：把 ASR 切出的每句，按文本相似度对齐到真值句（真值句带人工精译），
 *      用它的人工精译作为该句译文。这样"精译版"= 人工级译文 + 真实识别出的断句时间轴，
 *      可与机翻版并列对比（机翻版证明全自动，精译版代表质量上限）。
 *
 * 用法：node History/probe/make_zh_agent.mjs <cues.json> <ground_truth.json> <out.json>
 */
import fs from 'node:fs';

const [cuesPath, gtPath, outPath] = process.argv.slice(2);
const cuesDoc = JSON.parse(fs.readFileSync(cuesPath, 'utf8'));
const gt = JSON.parse(fs.readFileSync(gtPath, 'utf8'));
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const words = (s) => norm(s).split(' ').filter(Boolean);

function overlapScore(a, b) {
  const A = new Set(words(a)), B = new Set(words(b));
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const w of A) if (B.has(w)) hit++;
  return (2 * hit) / (A.size + B.size);
}

const map = {};
const rows = [];
for (const s of cuesDoc.sentences || []) {
  let best = null, bestScore = -1;
  for (const g of gt.sentences) {
    const sc = overlapScore(s.en, g.text);
    if (sc > bestScore) { bestScore = sc; best = g; }
  }
  if (!best || bestScore < 0.25) {
    rows.push({ en: s.en, zh: null, sim: bestScore, note: '对齐失败，跳过' });
    continue;
  }
  map[s.en] = best.ref_zh;
  rows.push({ en: s.en, matched_gt: best.idx, sim: Number(bestScore.toFixed(2)), zh: best.ref_zh });
}
fs.writeFileSync(outPath, JSON.stringify({ note: '人工精译（按真值参考译文对齐到 ASR 断句）', map, rows }, null, 2));
console.log(`[zh-agent] ${rows.length} 句，对齐成功 ${Object.keys(map).length} 句 -> ${outPath}`);
for (const r of rows) console.log(`   sim=${r.sim} ${r.zh ? '' : '(未对齐)'} ${r.en.slice(0, 62)}${r.zh ? `\n        → ${r.zh}` : ''}`);
