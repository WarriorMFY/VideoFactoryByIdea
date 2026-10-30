#!/usr/bin/env node
/**
 * loop07_af_grid.mjs — 小循环 7 探针：真实影视素材上，音频预处理链对识别率的影响
 *
 * 背景：TOS 90s 片段（官方字幕真值）上 WER 30.5%、覆盖 59.9%，漏的多是短句。
 * 在改"喂法"（asr_rescue）之前，先把"喂进去的信号"调好 —— 这一步便宜、见效直接。
 *
 * 做法：同一段素材 × 6 条预处理链，各自抽 16k PCM（一次抽、一次识别，模型只加载一次），
 *       算 WER / 平均置信度 / 词数，结果写 History/loops/loop07/af_grid.json。
 */
import fs from 'node:fs';
import path from 'node:path';
import { ffmpeg, ROOT } from '../../Tool/lib/ff.mjs';
import { openRecognizer } from '../../Tool/lib/vosk.mjs';

const MEDIA = path.join(ROOT, 'Workspace', 'assets', 'tos_excerpts', 'tos_90s.mp4');
const GT = path.join(ROOT, 'Workspace', 'assets', 'tos_excerpts', 'tos_90s.ground_truth.json');
const OUTDIR = path.join(ROOT, 'History', 'loops', 'loop07');
const WORK = path.join(ROOT, 'History', 'asr', '.af_grid');
fs.mkdirSync(OUTDIR, { recursive: true });
fs.mkdirSync(WORK, { recursive: true });

const CHAINS = [
  { id: 'none', af: '' },
  { id: 'band', af: 'highpass=f=200,lowpass=f=4000' },
  { id: 'band_afftdn', af: 'afftdn=nf=-25,highpass=f=200,lowpass=f=4000' },
  { id: 'afftdn_speechnorm', af: 'afftdn=nf=-25,speechnorm=e=12.5:r=0.0001:l=1,highpass=f=150,lowpass=f=4500' },
  { id: 'dynaudnorm', af: 'dynaudnorm=f=200:g=15,highpass=f=150,lowpass=f=4500' },
  { id: 'compress', af: 'highpass=f=150,lowpass=f=4500,acompressor=threshold=-24dB:ratio=3:attack=5:release=150:makeup=4' },
];

const gt = JSON.parse(fs.readFileSync(GT, 'utf8'));
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
  return { rate: r.length ? dp[r.length][h.length] / r.length : 0, refWords: r.length, hypWords: h.length };
}

const rec = openRecognizer();
const rows = [];
try {
  for (const c of CHAINS) {
    const pcmFile = path.join(WORK, `${c.id}.pcm`);
    const r = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-i', MEDIA, '-vn', '-ac', '1', '-ar', '16000',
      ...(c.af ? ['-af', c.af] : []), '-f', 's16le', '-acodec', 'pcm_s16le', pcmFile], path.join(WORK, `${c.id}.log`));
    if (r.status !== 0) { rows.push({ id: c.id, error: String(r.text).slice(-200) }); console.log(`[${c.id}] ffmpeg 失败`); continue; }
    const pcm = fs.readFileSync(pcmFile);
    const t0 = Date.now();
    const res = rec.recognize(pcm);
    const w = wer(gt.script, res.words.map((x) => x.word).join(' '));
    const row = {
      id: c.id, af: c.af || null, words: res.words.length, avg_conf: res.stats.avg_conf,
      wer: Number(w.rate.toFixed(4)), ref_words: w.refWords, sec: Number(((Date.now() - t0) / 1000).toFixed(1)),
      text: res.words.map((x) => x.word).join(' '),
    };
    rows.push(row);
    console.log(`[${row.id}] words ${row.words} conf ${row.avg_conf} WER ${(row.wer * 100).toFixed(1)}% (${row.sec}s)`);
  }
} finally {
  rec.free();
}
const best = rows.filter((r) => !r.error).sort((a, b) => a.wer - b.wer)[0];
const out = { generated_at: new Date().toISOString(), media: path.relative(ROOT, MEDIA), gt_script_words: tok(gt.script).length, best: best?.id ?? null, rows };
fs.writeFileSync(path.join(OUTDIR, 'af_grid.json'), JSON.stringify(out, null, 2));
fs.rmSync(WORK, { recursive: true, force: true });
console.log(`\n[best] ${best?.id} WER ${(best?.wer * 100).toFixed(1)}% → History/loops/loop07/af_grid.json`);
