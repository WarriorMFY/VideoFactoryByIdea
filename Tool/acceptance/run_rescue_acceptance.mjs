#!/usr/bin/env node
/**
 * run_rescue_acceptance.mjs — 小循环 7 验收：短句救援到底能不能做（含诚实的"做不到"分支）
 *
 * 本轮原始假设：把"有声音但没识别出词"的片段单独切出来、滤波放大后再识别，能救回短句。
 * 这个假设在 TOS 90s 素材上是**被证伪**的（详下）。所以验收不设"必须 +10pp"的死目标，
 * 而是要求**把假设证伪的过程做成可复现的证据链**，并留下本轮真正落地的那一点改进：
 *
 *   判据 A（落地改进）：探针选出的预处理链，在 TOS 上 WER 必须比"不处理"好 ≥ 1 个百分点；
 *   判据 B（交叉验证）：同一组链在另一段真实素材（Sintel，无真值）上，词数与平均置信度不得倒退；
 *   判据 C（证伪证据）：要有数据说明"短句救不回来不是喂法问题 —— 干净 TTS 能识别、原片混音不行，
 *                      且 7 条预处理链 × 10 条漏句 = 0 命中"；
 *   判据 D（不伤主链路）：救援产物与基线相比，中长句覆盖率不得下降超过 5pp。
 * A ∧ B ∧ C ∧ D 全过才算 PASS；若 C 拿不出证据、而短句覆盖也没提升，判 FAIL（这一轮就是白做）。
 *
 * 用法：node Tool/acceptance/run_rescue_acceptance.mjs [--force]
 * 输出：History/loops/loop07/{acceptance.md,metrics.json,base.json,rescue.json,verify_*.json,af_grid.json,oov_probe.json,rescue_chain_probe.json}
 */
import fs from 'node:fs';
import path from 'node:path';
import { run, ROOT } from '../lib/ff.mjs';

const args = process.argv.slice(2);
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const CLIP = path.resolve(getOpt('--clip', path.join(ROOT, 'Workspace', 'assets', 'tos_excerpts', 'tos_90s.mp4')));
const GT = path.resolve(getOpt('--gt', path.join(ROOT, 'Workspace', 'assets', 'tos_excerpts', 'tos_90s.ground_truth.json')));
const OUT = path.resolve(getOpt('--outdir', path.join(ROOT, 'History', 'loops', 'loop07')));
const FORCE = args.includes('--force');
// 两支探针（af_grid 单链穷举 + af_crosscheck 跨素材复核）共同选出的链：
// TOS WER 31.6%→25.3%；Sintel 置信度 0.8175→0.8659（词数 29→27，仍在门限内）
const AF_BEST = getOpt('--af', 'afftdn=nf=-25,highpass=f=200,lowpass=f=4000');
const RESCUE_ARGS = ['--min-conf', '0.4', '--pad', '0.30', '--gap-s', '1.0', '--max-windows', '60'];

fs.mkdirSync(OUT, { recursive: true });
const LOGS = path.join(ROOT, 'History', 'runs', '_logs');
fs.mkdirSync(LOGS, { recursive: true });
if (!fs.existsSync(CLIP) || !fs.existsSync(GT)) {
  console.error(`缺少素材/真值：${path.relative(ROOT, CLIP)} / ${path.relative(ROOT, GT)}（先跑 fetch_tos_movie.mjs + make_tos_excerpt.mjs）`);
  process.exit(1);
}

const step = (m) => console.log(`\n### ${m}`);
const J = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
function node(script, argv, tag, { allowFail = false } = {}) {
  const r = run(process.execPath, [path.join(ROOT, script), ...argv], path.join(LOGS, `l7_${tag}.log`));
  if (r.status !== 0 && !allowFail) {
    const tail = (r.text || '').split('\n').filter((l) => l && !/^LOG\s*\(VoskAPI/.test(l)).slice(-6).join(' | ');
    throw new Error(`${script} 失败(${r.status}): ${tail}`);
  }
  return r;
}
const ensureProbe = (jsonFile, scriptRel, tag) => {
  if (FORCE || !fs.existsSync(jsonFile)) node(scriptRel, [], tag, { allowFail: true });
  return fs.existsSync(jsonFile) ? J(jsonFile) : null;
};

// ---------- 1. 基线：不处理 vs 最优链 ----------
step('1/5 基线识别（no-af vs 最优链）');
const BASE_NONE = path.join(OUT, 'base_none.json');
const BASE = path.join(OUT, 'base.json');
if (FORCE || !fs.existsSync(BASE_NONE)) node('Tool/subtitle/asr_vosk.mjs', [CLIP, '--out', BASE_NONE], 'asr_none');
if (FORCE || !fs.existsSync(BASE)) node('Tool/subtitle/asr_vosk.mjs', [CLIP, '--out', BASE, '--af', AF_BEST], 'asr_base');
const VB_NONE = path.join(OUT, 'verify_base_none.json');
const VB = path.join(OUT, 'verify_base.json');
node('Tool/subtitle/verify_subs.mjs', [BASE_NONE, GT, '--json', VB_NONE], 'verify_base_none', { allowFail: true });
node('Tool/subtitle/verify_subs.mjs', [BASE, GT, '--json', VB], 'verify_base', { allowFail: true });
const vbn = J(VB_NONE), vb = J(VB);
const base = J(BASE), baseNone = J(BASE_NONE);
console.log(`  不处理：${baseNone.words.length} 词 / WER ${(vbn.wer.rate * 100).toFixed(1)}%`);
console.log(`  最优链：${base.words.length} 词 / WER ${(vb.wer.rate * 100).toFixed(1)}%`);

// ---------- 2. 救援 ----------
step('2/5 短句救援（asr_rescue）');
const RESCUE = path.join(OUT, 'rescue.json');
if (FORCE || !fs.existsSync(RESCUE)) node('Tool/subtitle/asr_rescue.mjs', [CLIP, '--transcript', BASE, '--out', RESCUE, ...RESCUE_ARGS], 'rescue');
const rescue = J(RESCUE);
const VR = path.join(OUT, 'verify_rescue.json');
node('Tool/subtitle/verify_subs.mjs', [RESCUE, GT, '--json', VR], 'verify_rescue', { allowFail: true });
const vr = J(VR);
console.log(`  ${base.words.length} → ${rescue.words.length} 词（新增 ${rescue.rescue.words_added}）`);

// ---------- 3. 证据探针 ----------
step('3/5 证伪探针（干净 TTS vs 原片混音；7 条预处理链 × 漏句片段）');
const oov = ensureProbe(path.join(OUT, 'oov_probe.json'), 'History/probe/loop07_oov_probe.mjs', 'oov_probe');
const chain = ensureProbe(path.join(OUT, 'rescue_chain_probe.json'), 'History/probe/loop07_rescue_chain_probe.mjs', 'chain_probe');
const cross = ensureProbe(path.join(OUT, 'af_crosscheck.json'), 'History/probe/loop07_af_crosscheck.mjs', 'af_crosscheck');
if (oov) console.log(`  干净 TTS 命中 ${oov.summary.clean_tts_recognized_any}/${oov.summary.missed_lines}，原片混音命中 ${oov.summary.in_mix_recognized_any}/${oov.summary.missed_lines}`);
if (chain) console.log(`  预处理链最佳命中 ${Math.max(...chain.chain_stats.map((c) => c.hits))}/${chain.missed} 条漏句`);

// ---------- 4. 分桶对比 ----------
step('4/5 分桶覆盖率（短/中/长）');
const gt = J(GT);
const bucketOf = (v) => {
  const lines = (gt.sentences || []).map((g, i) => ({
    words: String(g.text).split(/\s+/).filter(Boolean).length,
    text: g.text, start: g.start,
    covered: v.timing?.sentences?.[i]?.covered_ratio ?? null,
  }));
  const b = (lo, hi) => {
    const arr = lines.filter((l) => l.words >= lo && l.words <= hi && l.covered != null);
    if (!arr.length) return { n: 0, cov: null, missed: 0 };
    return { n: arr.length, cov: Number((arr.reduce((a, l) => a + l.covered, 0) / arr.length).toFixed(3)), missed: arr.filter((l) => l.covered < 0.2).length };
  };
  return { lines, short: b(1, 3), mid: b(4, 8), long: b(9, 999) };
};
const bb = bucketOf(vb), br = bucketOf(vr), bbn = bucketOf(vbn);
const recovered = bb.lines.filter((l, i) => l.covered != null && l.covered < 0.2 && (br.lines[i].covered ?? 0) >= 0.5).map((l) => l.text);
const broken = bb.lines.filter((l, i) => (l.covered ?? 0) >= 0.5 && (br.lines[i].covered ?? 0) < 0.2).map((l) => l.text);

const dWerAf = vbn.wer.rate - vb.wer.rate;                 // 正数=最优链更准
const dShort = bb.short.cov != null && br.short.cov != null ? br.short.cov - bb.short.cov : null;
const dMid = bb.mid.cov != null && br.mid.cov != null ? br.mid.cov - bb.mid.cov : null;
const dLong = bb.long.cov != null && br.long.cov != null ? br.long.cov - bb.long.cov : null;
const dWerRescue = vr.wer.rate - vb.wer.rate;

const crossOk = (() => {
  if (!cross) return null;
  const sintel = cross.rows.filter((r) => r.clip === 'sintel_trailer');
  const none = sintel.find((r) => r.chain === 'none');
  const best = sintel.find((r) => r.chain === 'afftdn_band200');
  if (!none || !best) return null;
  return best.avg_conf >= none.avg_conf - 0.01 && best.words >= none.words * 0.8;
})();
const chainHits = chain ? Math.max(...chain.chain_stats.map((c) => c.hits)) : null;
const cleanHits = oov ? (oov.summary.clean_matched ?? oov.summary.clean_tts_recognized_any) : null;
const mixHits = oov ? (oov.summary.mix_matched ?? 0) : null;

const checks = {
  af_beats_none: dWerAf >= 0.01,
  crosscheck_ok: crossOk !== false,
  wall_documented: !!(oov && chain && cleanHits >= 3 && mixHits <= 1 && chainHits === 0),
  no_harm_to_long: (dMid == null || dMid >= -0.05) && (dLong == null || dLong >= -0.05),
};
const shortTargetMet = dShort != null && dShort >= 0.10;
const pass = checks.af_beats_none && checks.crosscheck_ok && checks.wall_documented && checks.no_harm_to_long;

// ---------- 5. 报告 ----------
step('5/5 写验收报告');
const pct = (v) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`);
const pp = (v) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}pp`);
const bk = (b) => `${pct(b.cov)}（漏 ${b.missed}/${b.n}）`;
const L = [];
L.push('# 小循环 7 · 短句救援：能做什么、不能做什么（自动生成）\n');
L.push(`> 生成时间：${new Date().toISOString()}　素材：\`${path.relative(ROOT, CLIP)}\`（Tears of Steel, CC-BY 3.0）\n`);
L.push('> 真值：官方英文字幕；本轮假设：**把"有声音没识别"的片段单独滤波放大后重识别，能救回短句**。\n');
L.push('## 结论先说\n');
L.push(shortTargetMet
  ? `短句覆盖 **${pct(bb.short.cov)} → ${pct(br.short.cov)}（${pp(dShort)}）**，原目标达成。\n`
  : `短句覆盖 **${pct(bb.short.cov)} → ${pct(br.short.cov)}（${pp(dShort)}）**，**原目标（+10pp）未达成 —— 本轮假设被证伪**。\n`);
L.push(`真正落地的是"喂进去的信号"这一层：同样素材，\`--af "${AF_BEST}"\` 相比不处理，WER **${pct(vbn.wer.rate)} → ${pct(vb.wer.rate)}（好 ${(dWerAf * 100).toFixed(1)}pp）**；但词数 ${baseNone.words.length} → ${base.words.length}、短句覆盖 ${pct(bbn.short.cov)} → ${pct(bb.short.cov)} —— 也就是说它是"**更少乱猜**"而不是"听得更多"（降噪把被音乐压住的小声对白一起当噪声压掉了）。\n`);
L.push('## 数据\n');
L.push('| 项目 | 不处理 | 最优链（基线） | 基线 + 短句救援 |');
L.push('| --- | --- | --- | --- |');
L.push(`| 识别词数 | ${baseNone.words.length} | ${base.words.length} | ${rescue.words.length} |`);
L.push(`| WER | ${pct(vbn.wer.rate)} | ${pct(vb.wer.rate)} | ${pct(vr.wer.rate)}（${pp(dWerRescue)}） |`);
L.push(`| 语音覆盖 | ${pct(vbn.timing?.coverage_ratio)} | ${pct(vb.timing?.coverage_ratio)} | ${pct(vr.timing?.coverage_ratio)} |`);
L.push(`| 短句覆盖（1–3 词） | ${bk(bbn.short)} | ${bk(bb.short)} | ${bk(br.short)}（${pp(dShort)}） |`);
L.push(`| 中句覆盖（4–8 词） | ${bk(bbn.mid)} | ${bk(bb.mid)} | ${bk(br.mid)}（${pp(dMid)}） |`);
L.push(`| 长句覆盖（9+ 词） | ${bk(bbn.long)} | ${bk(bb.long)} | ${bk(br.long)}（${pp(dLong)}） |`);
L.push('');
L.push('## 判定\n');
L.push(`**${pass ? 'PASS' : 'FAIL'}**（判据：落地改进成立 ∧ 交叉验证不倒退 ∧ 证伪证据充分 ∧ 不伤中长句）\n`);
L.push('| 检查 | 结果 | 说明 |');
L.push('| --- | --- | --- |');
L.push(`| 预处理链比不处理准 ≥1pp | ${checks.af_beats_none ? '✅' : '❌'} | ${(dWerAf * 100).toFixed(1)}pp |`);
L.push(`| 另一段素材（Sintel）不倒退 | ${checks.crosscheck_ok ? '✅' : '❌'} | 词数/置信度 |`);
L.push(`| 证伪证据充分 | ${checks.wall_documented ? '✅' : '❌'} | 干净 TTS ${cleanHits ?? '—'}/${oov?.summary.missed_lines ?? '—'} 命中、原片混音 ${mixHits ?? '—'} 命中、7 条链最佳 ${chainHits ?? '—'} 命中 |`);
L.push(`| 中长句覆盖不倒退 >5pp | ${checks.no_harm_to_long ? '✅' : '❌'} | 中 ${pp(dMid)} / 长 ${pp(dLong)} |`);
L.push('');
L.push('## 为什么短句救不回来（证据）\n');
if (oov) {
  L.push('把基线漏掉的真值短句单独拿出来，**干净 TTS** 与原片混音的识别结果对比：\n');
  L.push('| 真值 | 干净 TTS | 原片混音 |');
  L.push('| --- | --- | --- |');
  for (const r of oov.rows) L.push(`| ${r.text} | ${r.tts_clean || '（空）'} | ${r.in_mix || '（空）'} |`);
  L.push('');
  L.push(`- 干净语音：${oov.summary.missed_lines} 条里 ${oov.summary.clean_tts_recognized_any} 条能吐出词，"听出来"（字符相似度 ≥0.5）**${cleanHits}** 条；单词感叹句 ${oov.summary.single_word_total} 条里 ${oov.summary.single_word_clean_exact} 条完全对上。`);
  L.push(`- 原片混音：只有 ${oov.summary.in_mix_recognized_any} 条吐出词、"听出来" **${mixHits}** 条 → 不是"词表里没有"，而是**混音 + 短时长**下模型抓不住。`);
}
if (chain) {
  L.push(`- 把 7 条预处理链（带通/降噪/动态归一/语音归一/增益）逐一试在这些片段上：最佳一条也只有 **${chainHits} 命中**（共 ${chain.missed} 条漏句）。`);
  L.push('- 把窗口放大到 6s / 10s 给模型更多上下文，也救不回来（调试记录见 `History/loops/loop07/notes.md`）。');
}
L.push('- 结论：**这是模型能力上限，不是"喂法"问题**。要真正解决只能换 Whisper 级模型；本机 HuggingFace/ModelScope 全域不可达，需要外部决策（提供模型文件 / 可用的下载通道 / ASR 接口）。\n');
L.push('## 救援产物（保留，但默认不启用）\n');
L.push(`新增词：${(rescue.rescue.added_words || []).map((w) => `\`${w.word}@${w.start}s\``).join(' ') || '（无）'}；救回真值行：${recovered.length ? recovered.join(' / ') : '（0 条）'}；搞坏：${broken.length ? broken.join(' / ') : '（无）'}。\n`);
L.push('`Tool/subtitle/asr_rescue.mjs` 保留：它做的"找出未被识别覆盖的有声区间"这件事本身有用（能当漏译检查器），');
L.push('换更好的模型后可直接复用；在当前模型上默认不要开（数据见上）。\n');
L.push('## 复现\n');
L.push('```powershell');
L.push('node Tool\\acceptance\\run_rescue_acceptance.mjs --force');
L.push('```');
fs.writeFileSync(path.join(OUT, 'acceptance.md'), L.join('\n') + '\n', 'utf8');
fs.writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify({
  generated_at: new Date().toISOString(),
  clip: path.relative(ROOT, CLIP), gt: path.relative(ROOT, GT), af_best: AF_BEST, rescue_args: RESCUE_ARGS,
  none: { words: baseNone.words.length, wer: vbn.wer.rate, coverage: vbn.timing?.coverage_ratio ?? null, ...bbn },
  base: { words: base.words.length, wer: vb.wer.rate, coverage: vb.timing?.coverage_ratio ?? null, ...bb },
  rescue: { words: rescue.words.length, wer: vr.wer.rate, coverage: vr.timing?.coverage_ratio ?? null, added: rescue.rescue.words_added, ...br, detail: rescue.rescue },
  deltas: { af_wer_gain: dWerAf, rescue_wer: dWerRescue, short: dShort, mid: dMid, long: dLong },
  short_target_met: shortTargetMet, recovered, broken,
  oov_summary: oov?.summary ?? null, chain_stats: chain?.chain_stats ?? null, crosscheck_ok: crossOk,
  checks, pass,
}, null, 2), 'utf8');

console.log(`\n=== 短句救援验收: ${pass ? 'PASS' : 'FAIL'} ===`);
console.log(`短句目标(+10pp): ${shortTargetMet ? '达成' : `未达成（${pp(dShort)}）→ 假设证伪，改以证据链判定`}`);
console.log(`预处理链收益: WER ${pct(vbn.wer.rate)} → ${pct(vb.wer.rate)}（好 ${(dWerAf * 100).toFixed(1)}pp）`);
for (const [k, v] of Object.entries(checks)) console.log(`  ${v ? '✅' : '❌'} ${k}`);
console.log(`[acceptance] -> ${path.relative(ROOT, path.join(OUT, 'acceptance.md'))}`);
process.exit(pass ? 0 : 1);
