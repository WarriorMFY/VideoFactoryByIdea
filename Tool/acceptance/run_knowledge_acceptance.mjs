#!/usr/bin/env node
/**
 * run_knowledge_acceptance.mjs — 小循环 11 验收：知识型内容的"能发布"链路
 *
 * 四件事，每件都有可复现的判据：
 *   A 分诊：同一条流水线要能自己看出"这条是知识型还是剧情型"（l2=knowledge、TOS=narrative）
 *   B 单位规范化：`minus sixty sixteen l u fs` → `−16 LUFS`、`fifteen megabits per second` → `15 Mbps`，
 *     并且**幂等**（再跑一遍不再变），且**只在单位语境**动数字（`two hours` 不许变 `2 hours`）
 *   C 端到端收益：规范化后再翻译，中文里出现 `−16 LUFS` / `15 Mbps`（不规范化则不会）
 *   D 术语候选：能从长片转录里自动挑出该进术语表的词（否则 273 行手工找术语不现实）
 *
 * 用法：node Tool/acceptance/run_knowledge_acceptance.mjs [--force]
 * 输出：History/loops/loop11/{acceptance.md,metrics.json,classify_*.json,norm_report.json,signals.json}
 */
import fs from 'node:fs';
import path from 'node:path';
import { run, ROOT } from '../lib/ff.mjs';

const FORCE = process.argv.includes('--force');
const OUTDIR = path.join(ROOT, 'History', 'loops', 'loop11');
const RUN = path.join(ROOT, 'History', 'runs', 'l11_knowledge');
const LOGS = path.join(ROOT, 'History', 'runs', '_logs');
for (const d of [OUTDIR, RUN, LOGS]) fs.mkdirSync(d, { recursive: true });

const L2_CLIP = path.join(ROOT, 'History', 'bench', 'l2_en', 'source.mp4');
const L2_TR = path.join(ROOT, 'History', 'asr', 'transcript_punct.json');
const TOS_CLIP = path.join(ROOT, 'Workspace', 'assets', 'tos_excerpts', 'tos_90s.mp4');
const TOS_TR = path.join(ROOT, 'History', 'loops', 'loop07', 'base.json');
const LONG_TR = path.join(ROOT, 'History', 'asr', 'long', 'transcript_long.json');
const GLOSSARY = 'Tool/subtitle/glossary_zh.json';
for (const f of [L2_CLIP, L2_TR]) if (!fs.existsSync(f)) { console.error(`缺少 ${path.relative(ROOT, f)}（先跑 loop2/loop6 的 reproduce）`); process.exit(1); }

const step = (m) => console.log(`\n### ${m}`);
const J = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const node = (script, argv, tag, { allowFail = false } = {}) => {
  const r = run(process.execPath, [path.join(ROOT, script.startsWith('Tool/') ? script : `Tool/${script}`), ...argv], path.join(LOGS, `l11_${tag}.log`));
  if (r.status !== 0 && !allowFail) throw new Error(`${script} 失败(${r.status}): ${(r.text || '').split('\n').filter((l) => !/^LOG\s*\(VoskAPI/.test(l)).slice(-4).join(' | ')}`);
  return r;
};

// ---------- A. 分诊 ----------
step('A 内容分诊（knowledge vs narrative）');
const CL_L2 = path.join(RUN, 'classify_l2.json');
const CL_TOS = path.join(RUN, 'classify_tos.json');
node('subtitle/classify_content.mjs', [L2_CLIP, '--transcript', L2_TR, '--json', path.relative(ROOT, CL_L2)], 'classify_l2');
node('subtitle/classify_content.mjs', [TOS_CLIP, '--transcript', TOS_TR, '--json', path.relative(ROOT, CL_TOS)], 'classify_tos');
const clL2 = J(CL_L2), clTos = J(CL_TOS);
console.log(`  l2: ${clL2.class} (${clL2.knowledge_score}) / TOS: ${clTos.class} (${clTos.knowledge_score})`);

// ---------- B. 单位规范化 ----------
step('B 数值/单位规范化（含幂等与"不误伤"检查）');
const NORM = path.join(RUN, 'transcript_norm.json');
const NORM2 = path.join(RUN, 'transcript_norm2.json');
node('subtitle/normalize_units.mjs', [L2_TR, '--out', path.relative(ROOT, NORM), '--glossary', GLOSSARY, '--json', path.relative(ROOT, path.join(RUN, 'norm_report.json'))], 'normalize');
node('subtitle/normalize_units.mjs', [NORM, '--out', path.relative(ROOT, NORM2), '--glossary', GLOSSARY], 'normalize2');
const norm = J(NORM);
const norm2 = J(NORM2);
const normText = (norm.sentences || []).map((s) => s.text).join(' ');
const idempotent = JSON.stringify((norm.sentences || []).map((s) => s.text)) === JSON.stringify((norm2.sentences || []).map((s) => s.text));
const hasLufs = /−16 LUFS/.test(normText);
const hasMbps = /15 Mbps/.test(normText);
const noFalseDigits = !/\b2 hours\b/.test(normText) && /\btwo hours\b/i.test(normText);
console.log(`  规范化：${norm.normalization.changed} 句 / ${norm.normalization.substitutions} 处｜−16 LUFS=${hasLufs} 15 Mbps=${hasMbps} 幂等=${idempotent} 不误伤=${noFalseDigits}`);

// ---------- C. 端到端：规范化前后，中文里的单位写法 ----------
step('C 端到端（规范化 vs 不规范化 → 中文单位写法）');
const SUBS_NORM = path.join(RUN, 'subs_norm');
const SUBS_RAW = path.join(RUN, 'subs_raw');
node('subtitle/make_subs.mjs', [NORM, '--out', path.relative(ROOT, SUBS_NORM), '--punct', '--mt', 'mymemory', '--glossary', GLOSSARY, '--cps', '20'], 'subs_norm');
// 对照组：--no-unit-norm（只做术语表纠错，不做数值/单位规范化）—— 用来证明"规范化确实带来了差别"
node('subtitle/make_subs.mjs', [L2_TR, '--out', path.relative(ROOT, SUBS_RAW), '--punct', '--mt', 'mymemory', '--glossary', GLOSSARY, '--cps', '20', '--no-unit-norm'], 'subs_raw');
const zhOf = (dir) => J(path.join(dir, 'cues.json')).cues.map((c) => c.zh || '').join(' ');
const zhNorm = zhOf(SUBS_NORM);
const zhRaw = zhOf(SUBS_RAW);
const check = (txt) => ({
  lufs: /−16 LUFS/.test(txt),
  mbps: /15 Mbps/.test(txt),
  badZhUnits: /(卢夫斯|卢恩斯|负十六|零下|六十个十六)/.test(txt),
});
const cNorm = check(zhNorm), cRaw = check(zhRaw);
const unitFixes = J(path.join(SUBS_NORM, 'cues.json')).unit_fixes || [];
console.log(`  规范化后：${JSON.stringify(cNorm)}（单位改写 ${unitFixes.length} 条）`);
console.log(`  不规范化：${JSON.stringify(cRaw)}`);

// ---------- D. 术语候选 ----------
step('D 术语候选（长片转录）');
const CAND = path.join(RUN, 'term_candidates.json');
if (fs.existsSync(LONG_TR)) {
  node('subtitle/term_candidates.mjs', [LONG_TR, '--out', path.relative(ROOT, CAND), '--min-count', '2', '--glossary', GLOSSARY], 'terms');
} else {
  node('subtitle/term_candidates.mjs', [TOS_TR, '--out', path.relative(ROOT, CAND), '--min-count', '1', '--glossary', GLOSSARY], 'terms_fallback');
}
const cand = J(CAND);
const candL2 = path.join(RUN, 'term_candidates_l2.json');
node('subtitle/term_candidates.mjs', [NORM, '--out', path.relative(ROOT, candL2), '--min-count', '1', '--glossary', GLOSSARY], 'terms_l2');
const candL2Data = J(candL2);
const knownTerm = candL2Data.candidates.some((c) => /LUFS|Mbps|fps|dB|4K/i.test(c.term));
const density = cand.candidates.filter((c) => c.kind === 'phrase' || c.kind === 'frequent_word').length;
console.log(`  长片候选 ${cand.candidates.length} 个（短语/高频词 ${density}）；l2 候选 ${candL2Data.candidates.length} 个，含单位术语=${knownTerm}`);

// ---------- 判定 ----------
const checks = {
  classify_separates: clL2.class === 'knowledge' && clTos.class === 'narrative',
  music_ratio_ordering: (clTos.signals.music_ratio ?? 0) > (clL2.signals.music_ratio ?? 1),
  units_in_source: hasLufs && hasMbps,
  units_idempotent: idempotent,
  no_false_digitization: noFalseDigits,
  units_reach_zh: cNorm.lufs && cNorm.mbps && !cNorm.badZhUnits,
  raw_zh_lacks_units: !(cRaw.lufs && cRaw.mbps),
  term_candidates_work: cand.candidates.length > 0 && knownTerm,
};
const pass = Object.values(checks).every(Boolean);

const pct = (v) => (v == null ? '—' : `${(v * 100).toFixed(0)}%`);
const L = [];
L.push('# 小循环 11 · 知识型内容的"能发布"链路验收（自动生成）\n');
L.push(`> 生成时间：${new Date().toISOString()}\n`);
L.push('> 这一轮不是给工厂划边界，而是把"这一类内容现在能自动到什么程度"变成可判定、可复现的东西。\n');
L.push('## 判定\n');
L.push(`**${pass ? 'PASS' : 'FAIL'}**\n`);
L.push('| 检查 | 结果 | 数据 |');
L.push('| --- | --- | --- |');
L.push(`| 分诊能分开两类 | ${checks.classify_separates ? '✅' : '❌'} | l2=${clL2.class}(${clL2.knowledge_score}) / TOS=${clTos.class}(${clTos.knowledge_score}) |`);
L.push(`| 配乐占比方向正确 | ${checks.music_ratio_ordering ? '✅' : '❌'} | l2 ${pct(clL2.signals.music_ratio)} / TOS ${pct(clTos.signals.music_ratio)} |`);
L.push(`| 源句出现 \`−16 LUFS\` 与 \`15 Mbps\` | ${checks.units_in_source ? '✅' : '❌'} | ${norm.normalization.substitutions} 处替换 / ${norm.normalization.changed} 句 |`);
L.push(`| 规范化幂等（跑第二遍不再变） | ${checks.units_idempotent ? '✅' : '❌'} | 二次替换 ${norm2.normalization.substitutions} 处 |`);
L.push(`| 不误伤普通数字（\`two hours\` 不变 \`2 hours\`） | ${checks.no_false_digitization ? '✅' : '❌'} | |`);
L.push(`| 中文侧单位正确且无"负十六/卢夫斯" | ${checks.units_reach_zh ? '✅' : '❌'} | 单位改写 ${unitFixes.length} 条 |`);
L.push(`| 不规范化则拿不到正确单位（对照） | ${checks.raw_zh_lacks_units ? '✅' : '❌'} | 对照输出：${cRaw.lufs ? '有 LUFS' : '无 LUFS'} / ${cRaw.mbps ? '有 Mbps' : '无 Mbps'} |`);
L.push(`| 术语候选可用 | ${checks.term_candidates_work ? '✅' : '❌'} | ${cand.candidates.length} 个候选（未入表 ${cand.candidates.filter((c) => !c.in_glossary).length}） |`);
L.push('');
L.push('## 分诊信号（当前版本）\n');
L.push('> 分诊用的是**未规范化**的原始转录（不做"用后处理结果反推内容类型"这种事），所以术语密度在这里会偏低——\n');
L.push('> 这一步只是"视频到手的原始信号"，规范化发生在分诊之后。\n');
L.push('| 信号 | l2（教学） | TOS 90s（电影） | 含义 |');
L.push('| --- | --- | --- | --- |');
const sig = (k, label, fmt) => L.push(`| ${label} | ${fmt(clL2.signals[k])} | ${fmt(clTos.signals[k])} |`);
sig('speech_ratio', '语音覆盖（词占时长）', pct);
sig('asr_conf', '识别平均置信', (v) => (v == null ? '—' : v.toFixed(3)));
sig('music_ratio', '有声但无词（配乐/音效）', pct);
sig('short_ratio', '短句占比', pct);
sig('words_per_sent', '句均词数', (v) => (v == null ? '—' : String(v)));
sig('term_per_100w', '术语/单位密度', (v) => (v == null ? '—' : `${v}/100 词`));
L.push('');
L.push('## 中文输出对照（同一条流水线）\n');
L.push('| | 规范化前 | 规范化后 |');
L.push('| --- | --- | --- |');
L.push(`| 响度 | ${cRaw.lufs ? '有' : '无'} \`−16 LUFS\` | ${cNorm.lufs ? '有' : '无'} \`−16 LUFS\` |`);
L.push(`| 码率 | ${cRaw.mbps ? '有' : '无'} \`15 Mbps\` | ${cNorm.mbps ? '有' : '无'} \`15 Mbps\` |`);
L.push(`| 错误写法（负十六/卢夫斯） | ${cRaw.badZhUnits ? '有' : '无'} | ${cNorm.badZhUnits ? '有' : '无'} |`);
L.push('');
L.push('## 术语候选（该进术语表的词）\n');
for (const c of cand.candidates.slice(0, 12)) L.push(`- \`${c.term}\` ×${c.count}（${c.kind}）${c.in_glossary ? '已在表' : '**未入表**'}`);
L.push('');
L.push('## 当前策略建议（会随版本迭代）\n');
L.push(`- l2 分诊结果 → \`${clL2.strategy.mt}\`，CPS ${clL2.strategy.cps}，校对 ${clL2.strategy.review}`);
L.push(`- TOS 分诊结果 → \`${clTos.strategy.mt}\`，CPS ${clTos.strategy.cps}，校对 ${clTos.strategy.review}`);
L.push('');
L.push('## 复现\n');
L.push('```powershell');
L.push('node Tool\\acceptance\\run_knowledge_acceptance.mjs --force');
L.push('```');
fs.writeFileSync(path.join(OUTDIR, 'acceptance.md'), L.join('\n') + '\n', 'utf8');
fs.writeFileSync(path.join(OUTDIR, 'metrics.json'), JSON.stringify({
  generated_at: new Date().toISOString(),
  classify: {
    l2: { class: clL2.class, score: clL2.knowledge_score, signals: clL2.signals, strategy: clL2.strategy },
    tos: { class: clTos.class, score: clTos.knowledge_score, signals: clTos.signals, strategy: clTos.strategy },
  },
  normalization: { changed: norm.normalization.changed, substitutions: norm.normalization.substitutions, idempotent, changes: norm.normalization.changes },
  zh_units: { normalized: cNorm, raw: cRaw, unit_fixes: unitFixes.length },
  term_candidates: { total: cand.candidates.length, not_in_glossary: cand.candidates.filter((c) => !c.in_glossary).length, top: cand.candidates.slice(0, 15) },
  checks, pass,
}, null, 2), 'utf8');

console.log(`\n=== 知识型内容验收: ${pass ? 'PASS' : 'FAIL'} ===`);
for (const [k, v] of Object.entries(checks)) console.log(`  ${v ? '✅' : '❌'} ${k}`);
console.log(`[acceptance] -> ${path.relative(ROOT, path.join(OUTDIR, 'acceptance.md'))}`);
process.exit(pass ? 0 : 1);
