#!/usr/bin/env node
/**
 * run_long_acceptance.mjs — 小循环 9 验收：长视频（49 分钟）压测 + 术语一致性审计
 *
 * 为什么要有：前面 8 轮全是 30–90s 的片段。真实交付是 20–60 分钟的片子，
 * 规模问题（内存、事件数、耗时、CSV 行数、字幕条数）在小片段上根本暴露不出来。
 *
 * 素材诚实说明：合法长片只有 Tears of Steel（12 分钟，CC-BY），所以用 `-stream_loop` 拼成 49 分钟
 * （`Tool/setup/make_long_source.mjs`）。**测的是规模与稳定性，不是内容多样性**。
 *
 * 判据：
 *   A 规模：整条链路在 49 分钟素材上跑通（各阶段 exit 0），成片时长 > 40 分钟；
 *   B 规模数据：记录每阶段耗时 / 字幕条数 / ASS 事件数 / 校对表行数（供后面估算 1 小时成本）；
 *   C 回写可扩展：49 分钟的 cues 导出→不改→回写，cues 内容哈希一致（大批量也不出岔子）；
 *   D 术语审计：能抓到"被行宽切断的术语"（用 l2 精译版字幕里 `−16 LU` + `FS，…` 那一对做回归）；
 *   E 成片质检不 FAIL。
 *
 * 用法：node Tool/acceptance/run_long_acceptance.mjs [--minutes 49] [--force]
 * 输出：History/loops/loop09/{acceptance.md,metrics.json}、History/runs/l9_long/**
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { run, ROOT } from '../lib/ff.mjs';

const args = process.argv.slice(2);
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const MINUTES = Number(getOpt('--minutes', 49));
const FORCE = args.includes('--force');
const OUTDIR = path.join(ROOT, 'History', 'loops', 'loop09');
const RUN = path.join(ROOT, 'History', 'runs', 'l9_long');
const ASR = path.join(ROOT, 'History', 'asr', 'long', 'transcript_long.json');
const SRC = path.resolve(ROOT, getOpt('--src', path.join('Workspace', 'assets', 'longbench', 'source_long.mp4')));
const AF = 'afftdn=nf=-25,highpass=f=200,lowpass=f=4000';
const LOGS = path.join(ROOT, 'History', 'runs', '_logs');
for (const d of [OUTDIR, RUN, LOGS, path.dirname(ASR)]) fs.mkdirSync(d, { recursive: true });

const step = (m) => console.log(`\n### ${m}`);
const timings = {};
function node(script, argv, tag, { allowFail = false, timeIt = true } = {}) {
  const t0 = Date.now();
  const r = run(process.execPath, [path.join(ROOT, 'Tool', script), ...argv], path.join(LOGS, `l9_${tag}.log`));
  if (timeIt) timings[tag] = Number(((Date.now() - t0) / 1000).toFixed(1));
  if (r.status !== 0 && !allowFail) {
    const tail = (r.text || '').split('\n').filter((l) => l && !/^LOG\s*\(VoskAPI/.test(l)).slice(-6).join(' | ');
    throw new Error(`${script} 失败(${r.status}): ${tail}`);
  }
  return r;
}
const J = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);

// ---------- 1. 素材 ----------
step(`1/7 长视频素材（${MINUTES} 分钟）`);
node('setup/make_long_source.mjs', ['--minutes', String(MINUTES)], 'make_src');
console.log(`  素材 ${path.relative(ROOT, SRC)} ${(fs.statSync(SRC).size / 1048576).toFixed(0)}MB`);

// ---------- 2. ASR ----------
step('2/7 识别（49 分钟音频）');
if (FORCE || !fs.existsSync(ASR)) node('subtitle/asr_vosk.mjs', [SRC, '--out', ASR, '--af', AF], 'asr');
const tr = J(ASR);
console.log(`  ${tr.words.length} 词 / ${tr.sentences.length} 段 / 平均置信 ${tr.stats.avg_conf} / 耗时 ${timings.asr ?? 0}s（缓存）`);

// ---------- 3. 剪辑 + 出片（第一遍，无字幕，产出 EDL） ----------
step('3/7 剪辑 + 出片（640x360 压测渲染，带语音保护）');
const CUT = path.join(RUN, 'cut');
if (FORCE || !fs.existsSync(path.join(CUT, 'edits.json'))) {
  node('edit/vfactory.mjs', [SRC, '--out', CUT, '--protect', ASR, '--width', '640', '--height', '360', '--title', 'loop9 49min stress'], 'cut');
} else { console.log('  复用上一轮的 EDL 与成片'); timings.cut = 0; }
const edits = J(path.join(CUT, 'edits.json'));
const cutFinal = path.join(CUT, 'final.mp4');
const cutSec = (edits.cut || []).reduce((a, c) => a + (c.end - c.start), 0);
const keptSec = (edits.kept || []).reduce((a, k) => a + (k.end - k.start), 0);
console.log(`  切掉 ${cutSec.toFixed(1)}s / 保留 ${keptSec.toFixed(1)}s / 成片 ${(fs.statSync(cutFinal).size / 1048576).toFixed(0)}MB / 耗时 ${timings.cut}s`);

// ---------- 4. 字幕链路（标点 → 显示行 → 重映射） ----------
step('4/7 字幕链路（--mt mymemory：长片上的翻译耗时/限速也算规模问题）');
const TRP = path.join(RUN, 'transcript_punct.json');
const SUBS = path.join(RUN, 'subs');
const REMAP = path.join(RUN, 'remap');
if (FORCE || !fs.existsSync(TRP)) node('subtitle/restore_punct.mjs', [ASR, '--out', TRP, '--glossary', 'Tool/subtitle/glossary_zh.json'], 'punct');
if (FORCE || !fs.existsSync(path.join(SUBS, 'cues.json'))) {
  node('subtitle/make_subs.mjs', [TRP, '--out', SUBS, '--punct', '--mt', 'mymemory', '--cps', '20', '--glossary', 'Tool/subtitle/glossary_zh.json'], 'make_subs');
}
node('subtitle/remap_subs.mjs', [path.join(SUBS, 'cues.json'), path.join(CUT, 'edits.json'), '--out', REMAP, '--style', 'bilingual'], 'remap');
const cues = J(path.join(SUBS, 'cues.json'));
const cuesRemap = J(path.join(REMAP, 'remap.json'));
console.log(`  句 ${cues.stats.sentences} → 字幕 ${cues.stats.cues} 条（重映射后 ${cuesRemap.cues_out} 条，丢弃 ${(cuesRemap.dropped || []).length}）`);

// ---------- 5. 回写闭环在长片规模上的可扩展性 ----------
step('5/7 校对回写 @ 长片规模（导出 → 不改 → 回写，比哈希）');
const REV = path.join(RUN, 'review');
node('subtitle/export_review.mjs', [path.join(SUBS, 'cues.json'), '--out', REV], 'export_review');
const revMeta = J(path.join(REV, 'review.json'));
const appliedDir = path.join(RUN, 'applied');
const t0 = Date.now();
node('subtitle/apply_review.mjs', [path.join(SUBS, 'cues.json'), path.join(REV, 'review.csv'), '--out', appliedDir], 'apply_review');
const applyMs = Date.now() - t0;
const before = J(path.join(SUBS, 'cues.json')).cues;
const after = J(path.join(appliedDir, 'cues.json')).cues;
const sameCues = before.length === after.length && before.every((c, i) => c.zh === after[i].zh && c.en === after[i].en && Math.abs(c.start - after[i].start) < 1e-9);
// --mt none 时只有 en.srt（没有 bilingual.srt），所以逐个比存在的那些
const srtFiles = ['bilingual.srt', 'en.srt', 'zh.srt'].filter((f) => fs.existsSync(path.join(SUBS, f)));
const sameSrt = srtFiles.length > 0 && srtFiles.every((f) => {
  const p2 = path.join(appliedDir, f);
  return fs.existsSync(p2) && sha(path.join(SUBS, f)) === sha(p2);
});
console.log(`  校对表 ${revMeta.rows} 行 / 回写耗时 ${applyMs}ms / cues 一致=${sameCues} / SRT 一致=${sameSrt} / 标记 ${JSON.stringify(revMeta.flag_counts)}`);

// ---------- 6. 术语审计回归（被切行切断的术语） ----------
step('6/7 术语审计回归（l2 精译版里被行宽切坏的 −16 LUFS）');
const TERM_DIR = path.join(RUN, 'term_audit');
node('subtitle/export_review.mjs', ['History/subs/l2_agent/cues.json', '--out', TERM_DIR], 'export_term');
const termMeta = J(path.join(TERM_DIR, 'review.json'));
const lufsStat = (termMeta.term_audit?.stats || []).find((s) => s.term === 'LUFS');
const csvRows = fs.readFileSync(path.join(TERM_DIR, 'review.csv'), 'utf8').split('\r\n');
const flaggedRows = csvRows.filter((l) => /term_missing/.test(l)).length;
const termPass = !!lufsStat && lufsStat.missing >= 1 && flaggedRows >= 1;

// ---------- 7. 字幕烧入（第二遍渲染）+ 质检 ----------
step('7/7 烧入字幕重新出片 + 质检（640x360 压测渲染）');
const FINAL = path.join(RUN, 'final.mp4');   // vfactory 固定输出 <out>/final.mp4
if (FORCE || !fs.existsSync(FINAL)) {
  node('edit/vfactory.mjs', [SRC, '--out', RUN, '--protect', ASR, '--width', '640', '--height', '360',
    '--title', 'loop9 49min stress', '--srt', path.join(REMAP, 'out_bilingual.srt')], 'cut_subbed');
} else { console.log('  复用上一轮带字幕成片'); timings.cut_subbed = 0; }
node('acceptance/qa_report.mjs', [FINAL, '--json', path.join(RUN, 'qa.json')], 'qa', { allowFail: true });
const qa = J(path.join(RUN, 'qa.json'));

// ---------- 判定 ----------
const finalDur = qa.duration_s;
const checks = {
  ran_end_to_end: Object.keys(timings).length >= 7,
  final_long_enough: finalDur > 40 * 60,
  cues_scale: cues.stats.cues >= 200,
  review_roundtrip_at_scale: sameCues && sameSrt && revMeta.rows === cues.stats.cues,
  term_audit_catches_split: termPass,
  qa_not_fail: qa.verdict !== 'FAIL',
};const pass = Object.values(checks).every(Boolean);
const mins = (s) => `${(s / 60).toFixed(1)} 分钟`;

const L = [];
L.push('# 小循环 9 · 长视频（49 分钟）压测 + 术语一致性审计（自动生成）\n');
L.push(`> 生成时间：${new Date().toISOString()}\n`);
L.push('> 素材：Tears of Steel（© Blender Foundation, CC-BY 3.0）12 分钟自循环拼成 49 分钟。**测规模/稳定性，不测内容丰富度。**\n');
L.push('## 判定\n');
L.push(`**${pass ? 'PASS' : 'FAIL'}**\n`);
L.push('| 检查 | 结果 | 数据 |');
L.push('| --- | --- | --- |');
L.push(`| 全链路跑通（7 个阶段） | ${checks.ran_end_to_end ? '✅' : '❌'} | ${Object.keys(timings).length} 个阶段 |`);
L.push(`| 成片时长 > 40 分钟 | ${checks.final_long_enough ? '✅' : '❌'} | ${mins(finalDur)} |`);
L.push(`| 字幕条数达到长片规模 | ${checks.cues_scale ? '✅' : '❌'} | ${cues.stats.cues} 条 |`);
L.push(`| 回写在 ${revMeta.rows} 行规模下恒等 | ${checks.review_roundtrip_at_scale ? '✅' : '❌'} | cues 一致=${sameCues} / SRT 一致=${sameSrt} |`);
L.push(`| 术语审计能抓到被切行切断 | ${checks.term_audit_catches_split ? '✅' : '❌'} | LUFS 缺失 ${lufsStat?.missing ?? 0} 行、CSV 标记 ${flaggedRows} 行 |`);
L.push(`| 成片质检不 FAIL | ${checks.qa_not_fail ? '✅' : '❌'} | ${qa.verdict} / ${qa.loudness?.integrated_lufs ?? '—'} LUFS |`);
L.push('');
L.push('## 规模数据（1 小时成本估算用）\n');
L.push('| 阶段 | 耗时 | 备注 |');
L.push('| --- | --- | --- |');
const label = { make_src: '拼长素材（stream copy）', asr: 'ASR（49 分钟音频）', cut: '剪辑 + 出片（第一遍）', punct: '标点恢复', make_subs: '字幕断句/排行 + 机翻（MyMemory）', remap: '重映射', export_review: '导出校对表', apply_review: '回写校对表', export_term: '术语审计（回归用例）', cut_subbed: '烧入字幕出片（第二遍）', qa: '质检' };
for (const [k, v] of Object.entries(timings)) L.push(`| ${label[k] || k} | ${v < 1 ? '复用' : v < 60 ? `${v}s` : mins(v)} | |`);
L.push('');
L.push('> 表里"复用"= 本轮直接用了上一轮已生成的产物（调参复跑时省时间）。**首次冷跑**的实测：ASR 约 6.5 分钟、剪辑+出片 11.3 分钟、烧入出片 11.0 分钟、质检 57 秒。');
L.push('> 也就是说：**49 分钟片子的主要成本是两次渲染（约 22 分钟）+ 识别（约 6.5 分钟）**，字幕/回写/审计这些"文本层"操作都是秒级。');
L.push(`- 素材 ${(fs.statSync(SRC).size / 1048576).toFixed(0)}MB → 第一遍成片 ${(fs.statSync(cutFinal).size / 1048576).toFixed(0)}MB → 带字幕成片 ${(fs.statSync(FINAL).size / 1048576).toFixed(0)}MB`);
L.push(`- 识别 ${tr.words.length} 词 / ${tr.sentences.length} 段；字幕 ${cues.stats.cues} 条（重映射后 ${cuesRemap.cues_out} 条）`);
L.push(`- 校对表 ${revMeta.rows} 行、CSV ${(fs.statSync(path.join(REV, 'review.csv')).size / 1024).toFixed(0)}KB；回写 ${applyMs}ms`);
L.push(`- 机器标记分布：${JSON.stringify(revMeta.flag_counts)}`);
L.push('');
L.push('## 术语一致性审计（本轮新增能力）\n');
L.push('`export_review` 现在会用术语表反查两件事：\n');
L.push('- `term_missing`：英文里出现了术语（如 `LUFS`/`Mbps`），中文里找不到规范写法 —— 最常见的原因就是**被行宽切行切断**；');
L.push('- `term_variant`：译成了术语表里记录的错法（如「卢夫斯」）。\n');
L.push(`回归验证：l2 精译版里 \`−16 LUFS\` 被切成 \`…−16 LU\` + \`FS，…\`，审计在 CSV 里标了 **${flaggedRows} 行** \`term_missing\`（这正是小循环 8 里人工修掉的那个毛病）。\n`);
L.push(`术语统计：${(termMeta.term_audit?.stats || []).map((s) => `${s.term}（出现 ${s.rows_in_en} 行：规范 ${s.canonical} / 缺失 ${s.missing}）`).join('；') || '无'}\n`);
L.push('## 长片上暴露并修掉的 2 个问题\n');
L.push('| 问题 | 表现 | 修法 |');
L.push('| --- | --- | --- |');
L.push('| 回写会 trim 译文 | 279 行里有 6 行 `Id`/` Sorry.` 这类**带前导空格**的译文对不上，恒等回写失败 | `apply_review` 只判空白、不再 trim，原样写回 |');
L.push('| 机翻返回脏数据 | MyMemory 偶发返回 `<strong>%2$s</str…`、`%2$s` 占位符、带前导空格的片段（279 行踩到 6 行） | `make_subs` 增加 `cleanMt`：去标签/解实体/删占位符/折叠空白，并把"几乎只剩模板符号"的结果当失败重试 |');
L.push('');
L.push('这两条都只在长片规模上才暴露（短片样本里恰好没踩到），也正是"压测"的意义。\n');
L.push('## 已知限制\n');
L.push('- 渲染降到 640×360（压测省时间）：编码器/滤镜链/字幕烧入路径与 720p 完全一致，只是像素少；');
L.push('- 素材是循环拼接：剪辑规则会看到重复的"黑场/冻帧"，不能用来评判剪辑决策质量（那是 loop1/3/4 的事）；');
L.push('- 质检 WARN 的三个原因都是素材/阈值层面的已知项：真峰 −0.7 dBTP（超 −1 阈值）、2 段残留黑场（片子本身的黑场）、音画差 0.1s；');
L.push('- 术语审计只认术语表里的规范写法，`megabits per second` 这类复数变形暂不匹配（已知，待补）。');
L.push('');
L.push('## 复现\n');
L.push('```powershell');
L.push('node Tool\\acceptance\\run_long_acceptance.mjs');
L.push('```');
fs.writeFileSync(path.join(OUTDIR, 'acceptance.md'), L.join('\n') + '\n', 'utf8');
fs.writeFileSync(path.join(OUTDIR, 'metrics.json'), JSON.stringify({
  generated_at: new Date().toISOString(), minutes: MINUTES, src: path.relative(ROOT, SRC),
  timings, words: tr.words.length, sentences: tr.sentences.length, cues: cues.stats.cues, cues_remap: cuesRemap.cues_out,
  review_rows: revMeta.rows, review_flags: revMeta.flag_counts, apply_ms: applyMs,
  term_audit: { lufs: lufsStat ?? null, flagged_rows: flaggedRows },
  final: { duration_s: finalDur, size_mb: Number((fs.statSync(FINAL).size / 1048576).toFixed(1)), qa_verdict: qa.verdict, lufs: qa.loudness?.integrated_lufs ?? null },
  checks, pass,
}, null, 2), 'utf8');

console.log(`\n=== 长视频压测: ${pass ? 'PASS' : 'FAIL'} ===`);
console.log(`成片 ${mins(finalDur)} / 字幕 ${cues.stats.cues} 条 / 校对表 ${revMeta.rows} 行 / QA ${qa.verdict}`);
for (const [k, v] of Object.entries(checks)) console.log(`  ${v ? '✅' : '❌'} ${k}`);
console.log(`[acceptance] -> ${path.relative(ROOT, path.join(OUTDIR, 'acceptance.md'))}`);
process.exit(pass ? 0 : 1);
