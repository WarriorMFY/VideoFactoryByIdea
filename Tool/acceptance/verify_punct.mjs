#!/usr/bin/env node
/**
 * verify_punct.mjs — 标点/大小写恢复的客观验收（用"讲稿真值"当标准）
 *
 * 判四件事：
 *   1. 句数是否对得上（真值讲稿几行 = 恢复出几句）；
 *   2. **句界 F1**：预测句子的起点能否对上真值句起点（容差 ±tol 秒）；
 *   3. **句末标点准确率**：对上的句子，句末是 `?`/`!`/`.` 是否一致；
 *   4. **文本完整性**：去掉标点后，与真值文本的词级差异（WER）——确认"只补标点、没改词"。
 * 另附"逗号 F1"（按逗号前那个词匹配），作为信息指标（阈值为经验值，不作硬门槛）。
 *
 * 用法：node Tool/acceptance/verify_punct.mjs <transcript_punct.json> <script.txt> <ground_truth.json> [--tol 0.8] [--json out.json]
 */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
if (args.length < 3) { console.error('用法: node Tool/acceptance/verify_punct.mjs <transcript_punct.json> <script.txt> <ground_truth.json> [--tol 0.8]'); process.exit(2); }
const [TR_PATH, SCRIPT_PATH, GT_PATH] = args;
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const TOL = Number(getOpt('--tol', 0.8));
const JSON_OUT = getOpt('--json', '');
const TH = { boundaryF1: 0.85, endPunctAcc: 0.85, werMax: 0.10, commaF1Info: 0.5 };

const tr = JSON.parse(fs.readFileSync(TR_PATH, 'utf8'));
const script = fs.readFileSync(SCRIPT_PATH, 'utf8').split(/\r?\n/).filter((l) => l.trim());
const gt = JSON.parse(fs.readFileSync(GT_PATH, 'utf8'));
const pred = tr.sentences || [];
const findWords = (s) => (s || '').toLowerCase().replace(/[^a-z0-9']+/g, ' ').split(' ').filter(Boolean);
const normText = (s) => findWords(s).join(' ');

// ---- 1. 句数 ----
const countOk = pred.length === script.length;

// ---- 2. 句界 F1（起点匹配，±TOL） ----
const gtStarts = (gt.sentences || []).map((s) => s.start);
const predStarts = pred.map((s) => s.start);
const used = new Set();
let tp = 0;
const matchLog = [];
for (const ps of predStarts) {
  let best = -1, bestD = Infinity;
  gtStarts.forEach((gs, i) => { if (used.has(i)) return; const d = Math.abs(gs - ps); if (d < bestD) { bestD = d; best = i; } });
  if (best >= 0 && bestD <= TOL) { used.add(best); tp++; matchLog.push({ pred: ps, gt: gtStarts[best], d: Number(bestD.toFixed(3)), gtIdx: best }); }
}
const precision = predStarts.length ? tp / predStarts.length : 0;
const recall = gtStarts.length ? tp / gtStarts.length : 0;
const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;

// ---- 3. 句末标点准确率（用已匹配的句子） ----
const gtEndMark = (line) => (line.trim().slice(-1).match(/[.?!]/) || ['.'])[0];
let endHit = 0;
for (const m of matchLog) {
  const p = pred.find((s) => s.start === m.pred);
  const g = script[m.gtIdx];
  if (!p || g === undefined) continue;
  const pm = (String(p.text || '').trim().slice(-1).match(/[.?!]/) || [''])[0];
  if (pm === gtEndMark(g)) endHit++;
}
const endAcc = matchLog.length ? endHit / matchLog.length : 0;

// ---- 4. 文本完整性（WER，去标点） ----
function wer(ref, hyp) {
  const r = findWords(ref), h = findWords(hyp);
  const dp = Array.from({ length: r.length + 1 }, () => new Array(h.length + 1).fill(0));
  for (let i = 0; i <= r.length; i++) dp[i][0] = i;
  for (let j = 0; j <= h.length; j++) dp[0][j] = j;
  for (let i = 1; i <= r.length; i++) for (let j = 1; j <= h.length; j++) {
    dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1));
  }
  return { dist: dp[r.length][h.length], refWords: r.length, rate: r.length ? dp[r.length][h.length] / r.length : 0 };
}
const w = wer(script.join(' '), pred.map((s) => s.text).join(' '));

// ---- 5. 逗号 F1（按"逗号前那个词"匹配，仅信息） ----
function commaTokens(text) {
  const toks = String(text).split(/\s+/);
  const out = [];
  for (let i = 1; i < toks.length; i++) if (/,$/.test(toks[i - 1])) out.push(toks[i - 1].replace(/,$/, '').toLowerCase());
  return out;
}
const gtComm = commaTokens(script.join(' '));
const prComm = commaTokens(pred.map((s) => s.text).join(' '));
const commUsed = new Set();
let commTp = 0;
for (const t of prComm) {
  const i = gtComm.findIndex((g, idx) => !commUsed.has(idx) && g === t);
  if (i >= 0) { commUsed.add(i); commTp++; }
}
const cPrec = prComm.length ? commTp / prComm.length : 0;
const cRec = gtComm.length ? commTp / gtComm.length : 0;
const commaF1 = cPrec + cRec ? (2 * cPrec * cRec) / (cPrec + cRec) : 0;

const pass = {
  sentence_count: countOk,
  boundary_f1: f1 >= TH.boundaryF1,
  end_punct: endAcc >= TH.endPunctAcc,
  text_integrity: w.rate <= TH.werMax,
};
const result = {
  verdict: Object.values(pass).every(Boolean) ? 'PASS' : 'FAIL',
  checked_at: new Date().toISOString(),
  inputs: { transcript: TR_PATH, script: SCRIPT_PATH, gt: GT_PATH },
  thresholds: { ...TH, tol_s: TOL },
  metrics: {
    predicted_sentences: pred.length, gt_sentences: script.length,
    boundary: { tp, precision: Number(precision.toFixed(3)), recall: Number(recall.toFixed(3)), f1: Number(f1.toFixed(3)) },
    end_punct_accuracy: Number(endAcc.toFixed(3)),
    wer: { rate: Number(w.rate.toFixed(4)), dist: w.dist, refWords: w.refWords },
    comma: { gt: gtComm.length, pred: prComm.length, f1: Number(commaF1.toFixed(3)) },
  },
  pass, matched: matchLog, predicted: pred.map((s) => ({ start: s.start, end: s.end, text: s.text })),
};
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(result, null, 2));

console.log(`\n=== 标点恢复验收: ${result.verdict} ===`);
console.log(`句数：预测 ${pred.length} vs 真值 ${script.length} ${countOk ? 'OK' : '✗'}`);
console.log(`句界：P ${precision.toFixed(2)} / R ${recall.toFixed(2)} / F1 ${f1.toFixed(2)}（容差 ±${TOL}s）`);
console.log(`句末标点准确率 ${(endAcc * 100).toFixed(0)}%　|　文本 WER ${(w.rate * 100).toFixed(1)}%（应≈ASR 自身水平，说明只补标点没改词）`);
console.log(`逗号 F1 ${commaF1.toFixed(2)}（真值 ${gtComm.length} 个 / 预测 ${prComm.length} 个，信息指标）`);
console.log(`判定: ${Object.entries(pass).map(([k, v]) => `${k}=${v ? 'ok' : '✗'}`).join(' ')}`);
process.exit(result.verdict === 'PASS' ? 0 : 1);
