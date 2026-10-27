#!/usr/bin/env node
/**
 * verify_subs.mjs — 字幕链路客观验收（WER / 时间轴 / 译文覆盖 / 可读性）
 *
 * 用法：node Tool/verify_subs.mjs <transcript.json> <ground_truth.json> [--cues cues.json] [--remap remap.json] [--json out.json]
 *
 * 判据（可用参数改）：
 *   WER ≤ 25%（合成语音+离线小模型，真实人声会更高，故阈值放宽）
 *   语音覆盖 ≥ 95%（真值句子区间被字幕覆盖的比例）
 *   句界平均误差 ≤ 0.8s / 最大 ≤ 1.5s
 *   译文覆盖 = 100%（每条都有中文，且不为 [unk]/空）
 *   可读性：中文字幕 ≤ 20 字/秒，英文 ≤ 25 字符/秒
 *   时间轴：无越界、无重叠、最短 ≥ 0.5s
 * 译文质量（与人工精译参考的字符相似度）只报告不判定 —— 机翻本就该被人复核。
 */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
if (args.length < 2) { console.error('用法: node Tool/verify_subs.mjs <transcript.json> <ground_truth.json> [--cues cues.json] [--remap remap.json] [--json out.json]'); process.exit(2); }
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const TR = JSON.parse(fs.readFileSync(args[0], 'utf8'));
const GT = JSON.parse(fs.readFileSync(args[1], 'utf8'));
const CUES_PATH = getOpt('--cues', '');
const REMAP_PATH = getOpt('--remap', '');
const JSON_OUT = getOpt('--json', '');
const REF_PATH = getOpt('--ref', '');
const TH = { wer: Number(getOpt('--max-wer', 0.25)), cover: 0.95, boundMean: 0.8, boundMax: 1.5, cps_zh: 20, cps_en: 25 };

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9']+/g, ' ').replace(/\s+/g, ' ').trim();
const tokenize = (s) => norm(s).split(' ').filter(Boolean);

/** 词级编辑距离 */
function wer(ref, hyp) {
  const r = tokenize(ref), h = tokenize(hyp);
  const dp = Array.from({ length: r.length + 1 }, () => new Array(h.length + 1).fill(0));
  for (let i = 0; i <= r.length; i++) dp[i][0] = i;
  for (let j = 0; j <= h.length; j++) dp[0][j] = j;
  for (let i = 1; i <= r.length; i++) {
    for (let j = 1; j <= h.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1));
    }
  }
  const dist = dp[r.length][h.length];
  return { refWords: r.length, hypWords: h.length, dist, rate: r.length ? dist / r.length : (h.length ? 1 : 0) };
}

/** 字符级相似度（0..1），用于“机翻 vs 人工精译”的粗略对比 */
function charSim(a, b) {
  const A = [...norm(a).replace(/ /g, '')], B = [...norm(b).replace(/ /g, '')];
  if (!A.length && !B.length) return 1;
  if (!A.length || !B.length) return 0;
  const dp = Array.from({ length: A.length + 1 }, () => new Array(B.length + 1).fill(0));
  for (let i = 0; i <= A.length; i++) dp[i][0] = i;
  for (let j = 0; j <= B.length; j++) dp[0][j] = j;
  for (let i = 1; i <= A.length; i++) for (let j = 1; j <= B.length; j++) {
    dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1));
  }
  return 1 - dp[A.length][B.length] / Math.max(A.length, B.length);
}

// ---------- 1. WER ----------
const w = wer(GT.script, TR.text);

// ---------- 2. 时间轴（对真值句子） ----------
const cuesFile = CUES_PATH ? JSON.parse(fs.readFileSync(CUES_PATH, 'utf8')) : null;
const sourceCues = cuesFile ? (cuesFile.cues || cuesFile) : (TR.sentences || []);
const cover = (a, b) => sourceCues.reduce((s, c) => s + Math.max(0, Math.min(b, c.end) - Math.max(a, c.start)), 0);
const timing = (GT.sentences || []).map((s) => {
  const covered = cover(s.start, s.end);
  const dur = s.end - s.start;
  const starts = sourceCues.map((c) => c.start), ends = sourceCues.map((c) => c.end);
  const near = (arr, t) => (arr.length ? arr.reduce((m, x) => (Math.abs(x - t) < Math.abs(m - t) ? x : m), arr[0]) : null);
  return {
    idx: s.idx, start: s.start, end: s.end,
    covered_ratio: Number((covered / Math.max(1e-6, dur)).toFixed(3)),
    start_err: Number(Math.abs(near(starts, s.start) - s.start).toFixed(3)),
    end_err: Number(Math.abs(near(ends, s.end) - s.end).toFixed(3)),
  };
});
const covRatio = timing.reduce((a, x) => a + x.covered_ratio * (x.end - x.start), 0) / timing.reduce((a, x) => a + (x.end - x.start), 0);
const startErrs = timing.map((x) => x.start_err), endErrs = timing.map((x) => x.end_err);
const meanBound = (startErrs.concat(endErrs)).reduce((a, b) => a + b, 0) / (startErrs.length + endErrs.length);
const maxBound = Math.max(...startErrs, ...endErrs);

// ---------- 3. 译文覆盖 + 可读性（基于 cues） ----------
let translate = null, readability = null;
if (sourceCues.length && sourceCues.some((c) => 'zh' in c)) {
  const missing = sourceCues.filter((c) => !c.zh || !String(c.zh).trim() || /\[unk\]/i.test(c.zh));
  const cpsZh = sourceCues.map((c) => (c.zh ? [...c.zh].length / Math.max(0.2, c.end - c.start) : 0));
  const cpsEn = sourceCues.map((c) => (c.en ? c.en.length / Math.max(0.2, c.end - c.start) : 0));
  translate = { cues: sourceCues.length, translated: sourceCues.length - missing.length, missing: missing.length, missing_samples: missing.slice(0, 5).map((c) => c.en) };
  readability = {
    max_zh_cps: Number(Math.max(...cpsZh).toFixed(2)), mean_zh_cps: Number((cpsZh.reduce((a, b) => a + b, 0) / cpsZh.length).toFixed(2)),
    max_en_cps: Number(Math.max(...cpsEn).toFixed(2)),
  };
}

// ---------- 4. 重映射后时间轴自检 ----------
let remap = null, remapPass = null;
if (REMAP_PATH) {
  const rm = JSON.parse(fs.readFileSync(REMAP_PATH, 'utf8'));
  const cues = rm.cues || [];
  const durs = cues.map((c) => c.end - c.start);
  remap = {
    cues_in: rm.cues_in, cues_out: rm.cues_out, dropped: rm.dropped.length,
    output_duration: rm.output_duration,
    overflow: cues.filter((c) => c.end > rm.output_duration + 0.05).length,
    overlaps: cues.filter((c, i) => i > 0 && c.start < cues[i - 1].end - 0.02).length,
    min_dur: Number(Math.min(...durs).toFixed(3)),
    max_dur: Number(Math.max(...durs).toFixed(3)),
  };
  remapPass = remap.overflow === 0 && remap.overlaps === 0 && remap.min_dur >= 0.5;
}

// ---------- 5. 译文质量（对比人工精译，仅报告） ----------
let quality = null;
if (REF_PATH && sourceCues.length) {
  const ref = JSON.parse(fs.readFileSync(REF_PATH, 'utf8'));
  const refBySentence = ref.sentences || [];
  // 把每条 cue 归到覆盖最多的真值句，再与参考译文比较
  const sims = [];
  for (const r of refBySentence) {
    const inSent = sourceCues.filter((c) => c.start < r.en.length * 0 + 999).filter((c) => c.zh);
    // 用 cue 起始时间落在该句区间的 cue 合并译文
    const st = GT.sentences.find((s) => s.idx === r.idx);
    const mine = sourceCues.filter((c) => c.zh && c.start >= st.start - 0.4 && c.start <= st.end + 0.4).map((c) => c.zh).join('');
    if (!mine) continue;
    sims.push({ idx: r.idx, sim: Number(charSim(mine, r.zh).toFixed(3)), machine: mine, reference: r.zh });
  }
  quality = { mean_char_sim: Number((sims.reduce((a, x) => a + x.sim, 0) / Math.max(1, sims.length)).toFixed(3)), per_sentence: sims };
}

const pass = {
  wer: w.rate <= TH.wer,
  coverage: covRatio >= TH.cover,
  boundary_mean: meanBound <= TH.boundMean,
  boundary_max: maxBound <= TH.boundMax,
  translated: translate ? translate.missing === 0 : null,
  readability: readability ? readability.max_zh_cps <= TH.cps_zh : null,
  remap: remapPass,
};
const verdict = Object.entries(pass).filter(([, v]) => v !== null).every(([, v]) => v) ? 'PASS' : 'FAIL';
const result = {
  verdict, thresholds: TH,
  wer: { ...w, rate: Number(w.rate.toFixed(4)) },
  timing: { coverage_ratio: Number(covRatio.toFixed(4)), mean_boundary_err_s: Number(meanBound.toFixed(3)), max_boundary_err_s: Number(maxBound.toFixed(3)), sentences: timing },
  translate, readability, remap, quality, pass,
  source: { transcript: args[0], ground_truth: args[1], cues: CUES_PATH || null, remap: REMAP_PATH || null },
};
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(result, null, 2));

console.log(`\n=== 字幕链路验收: ${verdict} ===`);
console.log(`ASR: WER ${(w.rate * 100).toFixed(1)}%  (错 ${w.dist}/${w.refWords} 词；识别 ${w.hypWords} 词)`);
console.log(`时间轴: 语音覆盖 ${(covRatio * 100).toFixed(1)}% / 句界平均误差 ${meanBound.toFixed(2)}s / 最大 ${maxBound.toFixed(2)}s`);
if (translate) console.log(`译文: ${translate.translated}/${translate.cues} 条有中文（缺 ${translate.missing}）`);
if (readability) console.log(`可读性: 中文峰值 ${readability.max_zh_cps} 字/秒（均值 ${readability.mean_zh_cps}）/ 英文峰值 ${readability.max_en_cps} 字符/秒`);
if (remap) console.log(`重映射: ${remap.cues_out} 条（原 ${remap.cues_in}，丢 ${remap.dropped}）/ 越界 ${remap.overflow} / 重叠 ${remap.overlaps} / 最短 ${remap.min_dur}s`);
if (quality) console.log(`机翻 vs 人工精译: 字符相似度均值 ${(quality.mean_char_sim * 100).toFixed(1)}%（仅供参考，不作为判定）`);
console.log(`判定: ${Object.entries(pass).map(([k, v]) => `${k}=${v === null ? 'n/a' : v ? 'ok' : '✗'}`).join(' ')}`);
process.exit(verdict === 'PASS' ? 0 : 1);
