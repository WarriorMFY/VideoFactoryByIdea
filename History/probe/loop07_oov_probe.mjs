#!/usr/bin/env node
/**
 * loop07_oov_probe.mjs — 小循环 7 关键探针：漏掉的短句，是"识别策略"问题还是"模型能力"问题？
 *
 * 问法：把 TOS 片段里**基线漏掉的真值短句**（`Abort!` / `Cut!` / `Nooooo!` / `I know.` …）单独拿出来，
 *   ① 用 Edge TTS 合成**干净语音** → 识别；
 *   ② 从原片对应时间点切出**原始混音** → 识别。
 * 如果连干净语音都识别不出来，那就不是"混音/切窗/增益"能救的，而是模型根本没有这些词/说话方式的表征
 * （Vosk 小模型词表与声学模型的上限）——这条结论决定了后续该不该继续在"喂法"上投入。
 *
 * 输出：History/loops/loop07/oov_probe.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ffmpeg, ROOT } from '../../Tool/lib/ff.mjs';
import { openRecognizer } from '../../Tool/lib/vosk.mjs';

const CLIP = path.join(ROOT, 'Workspace', 'assets', 'tos_excerpts', 'tos_90s.mp4');
const GT = path.join(ROOT, 'Workspace', 'assets', 'tos_excerpts', 'tos_90s.ground_truth.json');
const VERIFY_BASE = path.join(ROOT, 'History', 'loops', 'loop07', 'verify_base.json');
const OUTDIR = path.join(ROOT, 'History', 'loops', 'loop07');
const WORK = path.join(ROOT, 'History', 'asr', '.oov');
fs.mkdirSync(WORK, { recursive: true });
fs.mkdirSync(OUTDIR, { recursive: true });

const gt = JSON.parse(fs.readFileSync(GT, 'utf8'));
const vb = JSON.parse(fs.readFileSync(VERIFY_BASE, 'utf8'));
// 字符级相似度（只用来判断"这条短句到底有没有被听出来"，阈值 0.5）
const normStr = (s) => String(s || '').toLowerCase().replace(/[^a-z' ]+/g, '').replace(/\s+/g, ' ').trim();
function sim(a, b) {
  const A = [...normStr(a).replace(/ /g, '')], B = [...normStr(b).replace(/ /g, '')];
  if (!A.length || !B.length) return 0;
  const dp = Array.from({ length: A.length + 1 }, () => new Array(B.length + 1).fill(0));
  for (let i = 0; i <= A.length; i++) dp[i][0] = i;
  for (let j = 0; j <= B.length; j++) dp[0][j] = j;
  for (let i = 1; i <= A.length; i++) for (let j = 1; j <= B.length; j++) {
    dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1));
  }
  return 1 - dp[A.length][B.length] / Math.max(A.length, B.length);
}
const MATCH = 0.5;
// 基线里被"完全漏掉"（覆盖 < 20%）的真值行
const missed = (gt.sentences || []).map((g, i) => ({
  text: g.text, start: g.start, end: g.end,
  covered: vb.timing?.sentences?.[i]?.covered_ratio ?? null,
})).filter((g) => g.covered != null && g.covered < 0.2);
console.log(`[oov] 基线完全漏掉的真值行 ${missed.length} 条：${missed.map((m) => m.text).join(' / ')}`);

const require = createRequire(path.join(ROOT, 'Workspace', 'asr', 'index.cjs'));
const { EdgeTTS } = require('@andresaya/edge-tts');
const rec = openRecognizer();
const toPcm = (input, out, af) => {
  const r = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-vn', '-ac', '1', '-ar', '16000',
    ...(af ? ['-af', af] : []), '-f', 's16le', '-acodec', 'pcm_s16le', out], path.join(WORK, 'ff.log'));
  return r.status === 0 && fs.existsSync(out) ? fs.readFileSync(out) : null;
};
const asr = (pcm) => (pcm && pcm.length > 3200 ? rec.recognize(pcm).words.map((w) => w.word).join(' ') : '');

const rows = [];
try {
  for (const [i, m] of missed.entries()) {
    // ① Edge TTS 干净语音
    const mp3 = path.join(WORK, `tts_${i}.mp3`);
    let ttsOk = false;
    for (let attempt = 0; attempt < 3 && !ttsOk; attempt++) {
      try {
        const tts = new EdgeTTS();
        await tts.synthesize(m.text, 'en-US-AriaNeural', { rate: '+0%' });
        const buf = await tts.toBuffer();
        if (!buf || buf.length < 1000) throw new Error('输出异常');
        fs.writeFileSync(mp3, buf);
        ttsOk = true;
      } catch (e) { await new Promise((r) => setTimeout(r, 1200)); }
    }
    const clean = ttsOk ? asr(toPcm(mp3, path.join(WORK, `tts_${i}.pcm`), null)) : '(TTS 失败)';
    const cleanBand = ttsOk ? asr(toPcm(mp3, path.join(WORK, `tts_${i}_b.pcm`), 'highpass=f=200,lowpass=f=4000')) : '(TTS 失败)';
    // ② 原片里对应时间点的混音
    const segFile = path.join(WORK, `mix_${i}.wav`);
    const cut = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(Math.max(0, m.start - 0.3)), '-t', String(Math.max(0.8, m.end - m.start + 0.6)),
      '-i', CLIP, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', segFile], path.join(WORK, `cut_${i}.log`));
    const mix = cut.status === 0 ? asr(fs.readFileSync(segFile)) : '(切片失败)';
    const row = {
      text: m.text, gt_start: m.start, covered_in_base: m.covered,
      tts_clean: clean, tts_clean_band: cleanBand, in_mix: mix,
      clean_sim: Number(sim(m.text, clean).toFixed(2)), mix_sim: Number(sim(m.text, mix).toFixed(2)),
      clean_matched: sim(m.text, clean) >= MATCH, mix_matched: sim(m.text, mix) >= MATCH,
    };
    rows.push(row);
    console.log(`  "${m.text}"  → clean:[${clean}] band:[${cleanBand}] mix:[${mix}]`);
  }
} finally {
  rec.free();
}

const singleWords = rows.filter((r) => String(r.text).split(/\s+/).filter(Boolean).length === 1);
const cleanHits = rows.filter((r) => r.tts_clean && r.tts_clean.trim().length > 0).length;
const mixHits = rows.filter((r) => r.in_mix && r.in_mix.trim().length > 0).length;
const summary = {
  missed_lines: rows.length,
  clean_tts_recognized_any: cleanHits,
  clean_tts_recognized_exact: rows.filter((r) => r.tts_clean.replace(/[^a-z ]/gi, '').trim().toLowerCase() === r.text.replace(/[^a-z ]/gi, '').toLowerCase()).length,
  in_mix_recognized_any: mixHits,
  // "听出来"的严格口径：字符相似度 ≥ 0.5
  clean_matched: rows.filter((r) => r.clean_matched).length,
  mix_matched: rows.filter((r) => r.mix_matched).length,
  single_word_total: singleWords.length,
  single_word_clean_exact: singleWords.filter((r) => r.tts_clean.replace(/[^a-z ]/gi, '').trim().toLowerCase() === r.text.replace(/[^a-z ]/gi, '').toLowerCase()).length,
  single_word_detail: singleWords.map((r) => ({ text: r.text, clean: r.tts_clean, matched: r.clean_matched })),
};
const out = { generated_at: new Date().toISOString(), clip: path.relative(ROOT, CLIP), note: '干净 TTS vs 原片混音 vs 基线漏句，用来区分"策略问题"与"模型能力问题"', summary, rows };
fs.writeFileSync(path.join(OUTDIR, 'oov_probe.json'), JSON.stringify(out, null, 2));
fs.rmSync(WORK, { recursive: true, force: true });

console.log(`\n[oov] 漏句 ${summary.missed_lines} 条；干净 TTS 能识别出词的 ${cleanHits} 条（"听出来" ${summary.clean_matched} 条）`);
console.log(`[oov] 原片混音能识别出词的 ${mixHits} 条（"听出来" ${summary.mix_matched} 条）`);
console.log(`[oov] 单词感叹句 ${summary.single_word_total} 条：干净语音完全对上 ${summary.single_word_clean_exact} 条`);
console.log(`[oov] -> History/loops/loop07/oov_probe.json`);
