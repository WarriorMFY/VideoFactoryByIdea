#!/usr/bin/env node
/**
 * make_stub_transcript.mjs — 开发用：把 ground_truth 句子摊成"伪 ASR transcript"（低置信度，仅供联调）
 * 目的：在离线 ASR 模型还在下载时，先验证「断句→翻译→重映射→烧入」链路。
 * 注意：这不是识别结果，不得用于任何对外结论。
 */
import fs from 'node:fs';
import path from 'node:path';

const gt = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const out = process.argv[3] || 'History/asr/transcript_stub.json';
const words = [];
for (const s of gt.sentences) {
  const toks = s.text.toLowerCase().replace(/[^a-z0-9' ]+/g, '').split(/\s+/).filter(Boolean);
  const span = (s.end - s.start) / toks.length;
  toks.forEach((w, i) => {
    words.push({ word: w, start: Number((s.start + i * span).toFixed(3)), end: Number((s.start + (i + 0.92) * span).toFixed(3)), conf: 1 });
  });
}
const doc = {
  generated_at: new Date().toISOString(),
  engine: 'STUB（由真值句式反推，仅供联调，不是 ASR 结果）',
  model: 'stub',
  input: gt.source || null,
  audio_duration_s: gt.duration_s,
  text: words.map((w) => w.word).join(' '),
  words,
  sentences: gt.sentences.map((s) => ({ start: s.start, end: s.end, text: s.text, n: 0 })),
  stats: { words: words.length, sentences: gt.sentences.length, avg_conf: 1, stub: true },
};
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
fs.writeFileSync(path.resolve(out), JSON.stringify(doc, null, 2));
console.log('[stub] ->', out, words.length, 'words');
