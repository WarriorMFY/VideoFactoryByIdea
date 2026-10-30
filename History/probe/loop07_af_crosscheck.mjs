#!/usr/bin/env node
/**
 * loop07_af_crosscheck.mjs — 小循环 7 交叉验证：在**另一段真实素材**上复核预处理链，防"单片段过拟合"
 *
 * af_grid 只在 TOS 90s 上调出了 `highpass=200,lowpass=4000`；但 loop3 曾记录
 * `afftdn=nf=-25,highpass=300,lowpass=3400` 在 Sintel 上把置信度从 0.816 抬到 0.918。
 * 两支链到底谁更强？在 Sintel 预告片（无真值，看词数/置信度）和 TOS（有真值，看 WER）上都跑一遍。
 *
 * 输出：History/loops/loop07/af_crosscheck.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { ffmpeg, ROOT } from '../../Tool/lib/ff.mjs';
import { openRecognizer } from '../../Tool/lib/vosk.mjs';

const WORK = path.join(ROOT, 'History', 'asr', '.afcross');
fs.mkdirSync(WORK, { recursive: true });
const CLIPS = [
  { id: 'tos_90s', file: path.join(ROOT, 'Workspace', 'assets', 'tos_excerpts', 'tos_90s.mp4'), gt: path.join(ROOT, 'Workspace', 'assets', 'tos_excerpts', 'tos_90s.ground_truth.json') },
  { id: 'sintel_trailer', file: path.join(ROOT, 'Workspace', 'assets', 'realspeech', 'sintel-trailer.mp4'), gt: null },
];
const CHAINS = [
  { id: 'none', af: '' },
  { id: 'band200_4000', af: 'highpass=f=200,lowpass=f=4000' },
  { id: 'afftdn_300_3400', af: 'afftdn=nf=-25,highpass=f=300,lowpass=f=3400' },
  { id: 'afftdn_band200', af: 'afftdn=nf=-25,highpass=f=200,lowpass=f=4000' },
];
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9']+/g, ' ').replace(/\s+/g, ' ').trim();
const tok = (s) => norm(s).split(' ').filter(Boolean);
function wer(ref, hyp) {
  const r = tok(ref), h = tok(hyp);
  const dp = Array.from({ length: r.length + 1 }, () => new Array(h.length + 1).fill(0));
  for (let i = 0; i <= r.length; i++) dp[i][0] = i;
  for (let j = 0; j <= h.length; j++) dp[0][j] = j;
  for (let i = 1; i <= r.length; i++) for (let j = 1; j <= h.length; j++) {
    dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1));
  }
  return r.length ? dp[r.length][h.length] / r.length : 0;
}

const rec = openRecognizer();
const rows = [];
try {
  for (const c of CLIPS) {
    const gt = c.gt ? JSON.parse(fs.readFileSync(c.gt, 'utf8')) : null;
    for (const ch of CHAINS) {
      const pcmFile = path.join(WORK, `${c.id}_${ch.id}.pcm`);
      const r = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-i', c.file, '-vn', '-ac', '1', '-ar', '16000',
        ...(ch.af ? ['-af', ch.af] : []), '-f', 's16le', '-acodec', 'pcm_s16le', pcmFile], path.join(WORK, 'ff.log'));
      if (r.status !== 0 || !fs.existsSync(pcmFile)) { rows.push({ clip: c.id, chain: ch.id, error: (r.text || '').slice(-120) }); continue; }
      const res = rec.recognize(fs.readFileSync(pcmFile));
      const text = res.words.map((w) => w.word).join(' ');
      rows.push({
        clip: c.id, chain: ch.id, af: ch.af || null,
        words: res.words.length, avg_conf: res.stats.avg_conf,
        wer: gt ? Number(wer(gt.script, text).toFixed(4)) : null,
        text: text.slice(0, 300),
      });
      console.log(`[${c.id}/${ch.id}] words ${String(res.words.length).padStart(3)} conf ${res.stats.avg_conf.toFixed(4)}${gt ? ` WER ${(wer(gt.script, text) * 100).toFixed(1)}%` : ''}`);
    }
  }
} finally {
  rec.free();
}
fs.writeFileSync(path.join(ROOT, 'History', 'loops', 'loop07', 'af_crosscheck.json'), JSON.stringify({
  generated_at: new Date().toISOString(),
  note: '两条候选预处理链在 TOS（有真值）与 Sintel（无真值，看词数/置信度）上的交叉对比',
  rows,
}, null, 2));
fs.rmSync(WORK, { recursive: true, force: true });
console.log('[crosscheck] -> History/loops/loop07/af_crosscheck.json');
