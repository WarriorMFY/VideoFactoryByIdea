#!/usr/bin/env node
/**
 * loop07_rescue_chain_probe.mjs — 小循环 7 探针：漏句的那一小段音频，换不同"喂法"能不能听出来？
 *
 * 上一支探针（oov_probe）已经证明：这些短句在**干净 TTS** 下模型基本听得见（Abort/Cut/I know…），
 * 但在**原片混音**里几乎全丢。所以问题出在"混音 + 短时长"这个组合，值得把预处理链在**这些具体片段上**穷举一遍：
 *   每条漏句 × 7 条预处理链，看哪条链能吐出对得上真值的词。
 * 找到的链子会写进 asr_rescue 的默认参数（如果确实有链能稳定救回）。
 *
 * 输出：History/loops/loop07/rescue_chain_probe.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { ffmpeg, ROOT } from '../../Tool/lib/ff.mjs';
import { openRecognizer } from '../../Tool/lib/vosk.mjs';

const CLIP = path.join(ROOT, 'Workspace', 'assets', 'tos_excerpts', 'tos_90s.mp4');
const GT = path.join(ROOT, 'Workspace', 'assets', 'tos_excerpts', 'tos_90s.ground_truth.json');
const VERIFY_BASE = path.join(ROOT, 'History', 'loops', 'loop07', 'verify_base.json');
const OUTDIR = path.join(ROOT, 'History', 'loops', 'loop07');
const WORK = path.join(ROOT, 'History', 'asr', '.chain');
fs.mkdirSync(WORK, { recursive: true });

const gt = JSON.parse(fs.readFileSync(GT, 'utf8'));
const vb = JSON.parse(fs.readFileSync(VERIFY_BASE, 'utf8'));
const missed = (gt.sentences || []).map((g, i) => ({
  text: g.text, start: g.start, end: g.end, covered: vb.timing?.sentences?.[i]?.covered_ratio ?? null,
})).filter((g) => g.covered != null && g.covered < 0.2);

const CHAINS = [
  { id: 'band200_4000', af: 'highpass=f=200,lowpass=f=4000' },
  { id: 'band300_3400', af: 'highpass=f=300,lowpass=f=3400' },
  { id: 'afftdn_band', af: 'afftdn=nf=-20,highpass=f=250,lowpass=f=3500' },
  { id: 'dynaudnorm', af: 'dynaudnorm=f=100:g=25,highpass=f=250,lowpass=f=3500' },
  { id: 'speechnorm', af: 'speechnorm=e=10:r=0.0001:l=1,highpass=f=250,lowpass=f=3500' },
  { id: 'boost12', af: 'volume=12dB,highpass=f=250,lowpass=f=3500' },
  { id: 'combo', af: 'afftdn=nf=-20,dynaudnorm=f=100:g=20,highpass=f=250,lowpass=f=3500,volume=6dB' },
];

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z' ]+/g, ' ').replace(/\s+/g, ' ').trim();
const tokens = (s) => norm(s).split(' ').filter(Boolean);
/** 命中率：真值词有多少出现在识别结果里（"whoaaa"≈"woah" 这类前缀近似也算中） */
function hitRate(truth, hyp) {
  const t = tokens(truth), h = tokens(hyp);
  if (!t.length) return 0;
  let hit = 0;
  for (const w of t) {
    const wl = w.replace(/'s$/, '');
    if (h.some((x) => x === wl || (wl.length > 3 && x.startsWith(wl.slice(0, Math.max(3, wl.length - 2)))) || (x.length > 3 && wl.startsWith(x.slice(0, Math.max(3, x.length - 2)))))) hit++;
  }
  return hit / t.length;
}

const rec = openRecognizer();
const rows = [];
try {
  for (const m of missed) {
    const bestPerChain = {};
    for (const c of CHAINS) {
      const pcmFile = path.join(WORK, `${c.id}.pcm`);
      const r = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y',
        '-ss', String(Math.max(0, m.start - 0.25)), '-t', String(Math.max(1.0, m.end - m.start + 0.5)),
        '-i', CLIP, '-vn', '-ac', '1', '-ar', '16000', '-af', c.af,
        '-f', 's16le', '-acodec', 'pcm_s16le', pcmFile], path.join(WORK, 'ff.log'));
      const hyp = r.status === 0 && fs.existsSync(pcmFile) ? rec.recognize(fs.readFileSync(pcmFile)).words.map((w) => w.word).join(' ') : '';
      bestPerChain[c.id] = { hyp, hit: Number(hitRate(m.text, hyp).toFixed(2)) };
    }
    rows.push({ text: m.text, start: m.start, covered_in_base: m.covered, chains: bestPerChain });
    const brief = Object.entries(bestPerChain).map(([k, v]) => `${k}:${v.hit}>0?${v.hit > 0 ? 'Y' : 'n'}`).join(' ');
    console.log(`  "${m.text}"  ${brief}`);
  }
} finally {
  rec.free();
}

const chainStats = CHAINS.map((c) => {
  const vals = rows.map((r) => r.chains[c.id].hit);
  return {
    id: c.id, af: c.af,
    hits: vals.filter((v) => v > 0).length,
    full: vals.filter((v) => v >= 0.99).length,
    mean: Number((vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length)).toFixed(3)),
  };
}).sort((a, b) => b.hits - a.hits || b.mean - a.mean);

fs.writeFileSync(path.join(OUTDIR, 'rescue_chain_probe.json'), JSON.stringify({
  generated_at: new Date().toISOString(),
  note: '漏句片段 × 预处理链；hit=真值词被识别出来的比例（前缀近似也算中）',
  missed: rows.length, chain_stats: chainStats, rows,
}, null, 2));
fs.rmSync(WORK, { recursive: true, force: true });
console.log('\n[chain] 各链命中漏句数（共 ' + rows.length + ' 条）：');
for (const s of chainStats) console.log(`  ${s.id.padEnd(16)} hits ${s.hits}/${rows.length}  完全命中 ${s.full}  平均命中率 ${(s.mean * 100).toFixed(0)}%`);
console.log('[chain] -> History/loops/loop07/rescue_chain_probe.json');
