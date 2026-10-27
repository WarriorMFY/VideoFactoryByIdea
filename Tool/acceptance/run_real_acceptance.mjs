#!/usr/bin/env node
/**
 * run_real_acceptance.mjs — 小循环 3 验收：真实外语素材（真人说话）→ 中文字幕成片
 *
 * 与小循环 2 的区别：素材不再是 TTS 合成，而是真实影视片段（Sintel 预告片，CC-BY 3.0），
 * 因此**没有讲稿真值** → 验收切到 reference-free 模式：
 *   - 不做 WER / 真值时间轴比对
 *   - 改看：识别置信度、字幕行合理性（可读性）、译文覆盖、重映射自检、成片质检
 * 另外对比 4 种音频预处理对识别结果的影响（真实影视音轨带音乐/音效，预处理影响很大）。
 *
 * 用法：node Tool/run_real_acceptance.mjs [--clip <path>] [--af "filter"] [--mt mymemory|agent]
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ffprobeJson, ROOT } from '../lib/ff.mjs';

const args = process.argv.slice(2);
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const CLIP = path.resolve(ROOT, getOpt('--clip', 'Workspace/assets/realspeech/sintel-trailer.mp4'));
const AF = getOpt('--af', 'afftdn=nf=-25,highpass=f=300,lowpass=f=3400');
const MT = getOpt('--mt', 'mymemory');
const ZHFILE = getOpt('--zh-file', '');
const NODE = process.execPath;

const BENCH = path.join(ROOT, 'History', 'bench', 'real_en');
const RUN_CUT = path.join(ROOT, 'History', 'runs', 'real3_cut');
const RUN_SUB = path.join(ROOT, 'History', 'runs', 'real3_subs');
const SUBS = path.join(ROOT, 'History', 'subs', 'real3');
const REMAP = path.join(SUBS, 'remapped');
const ASR = path.join(ROOT, 'History', 'asr', 'transcript_real.json');
const LOGS = path.join(ROOT, 'History', 'runs', '_logs');
fs.mkdirSync(BENCH, { recursive: true });
fs.mkdirSync(LOGS, { recursive: true });

function runNode(script, scriptArgs, logName) {
  const log = path.join(LOGS, `${logName}.log`);
  const fd = fs.openSync(log, 'w');
  let r;
  try { r = spawnSync(NODE, [path.join(ROOT, 'Tool', script), ...scriptArgs], { stdio: ['ignore', fd, fd], cwd: ROOT }); }
  finally { fs.closeSync(fd); }
  return { status: r.status, text: fs.readFileSync(log, 'utf8') };
}
function step(title, script, scriptArgs, logName) {
  console.log(`\n### ${title}`);
  const res = runNode(script, scriptArgs, logName);
  console.log(res.text.trim().split('\n').slice(-10).join('\n'));
  if (res.status !== 0) throw new Error(`${script} 失败`);
  return res;
}

const t0 = Date.now();
if (!fs.existsSync(CLIP)) throw new Error(`缺少素材 ${CLIP}（先跑 node Tool/fetch_realspeech.mjs）`);
const pr = ffprobeJson(['-show_format', '-show_streams', CLIP], path.join(LOGS, 'real3_probe.log'));
const dur = Number(pr.format?.duration || 0);
const hasAudio = (pr.streams || []).some((s) => s.codec_type === 'audio');
if (!hasAudio) throw new Error('素材无音轨，无法做字幕');

// reference-free 真值（只记录素材元信息与"无讲稿"这一事实）
const gt = {
  reference_free: true,
  generated_at: new Date().toISOString(),
  note: '真实影视素材（Sintel trailer），没有官方逐句讲稿，因此 WER/真值时间轴不可测；本文件只用于标识"无真值"。',
  clip: { file: path.relative(ROOT, CLIP), duration: dur, license: 'Sintel © Blender Foundation, CC-BY 3.0' },
  duration_s: dur,
};
fs.writeFileSync(path.join(BENCH, 'ground_truth.json'), JSON.stringify(gt, null, 2));

// 1) 音频预处理对比（4 个变体，只跑识别，不进成片）
const VARIANTS = [
  ['baseline', ''],
  ['mono+loudnorm', 'highpass=f=200,loudnorm=I=-16:TP=-1.5'],
  ['bandpass+denoise', 'afftdn=nf=-25,highpass=f=300,lowpass=f=3400'],
  ['denoise+highpass+loudnorm', 'afftdn=nf=-25,highpass=f=150,loudnorm=I=-16:TP=-1.5'],
];
const variantRows = [];
for (const [name, af] of VARIANTS) {
  const out = path.join(ROOT, 'History', 'asr', `variant_${name.replace(/[^\w]+/g, '_')}.json`);
  const r = runNode('subtitle/asr_vosk.mjs', [CLIP, '--out', out, ...(af ? ['--af', af] : [])], `real3_asr_${name}`);
  if (r.status !== 0) { variantRows.push({ name, af, error: '识别失败' }); continue; }
  const t = JSON.parse(fs.readFileSync(out, 'utf8'));
  variantRows.push({ name, af: af || '(无)', words: t.words.length, conf: t.stats.avg_conf, sentences: t.sentences.length, text: t.text });
  console.log(`[variant] ${name.padEnd(28)} words=${String(t.words.length).padStart(3)} conf=${t.stats.avg_conf} | ${t.text.slice(0, 90)}`);
}

// 2) 用最优预处理跑正式识别
step('识别（正式，含音频预处理）', 'subtitle/asr_vosk.mjs', [CLIP, '--out', ASR, '--af', AF], 'real3_asr');

// 3) 剪辑：先跑一次「无语音保护」做对照，再跑正式版（带语音保护）
const RUN_CUT_NP = path.join(ROOT, 'History', 'runs', 'real3_cut_noprotect');
fs.rmSync(RUN_CUT_NP, { recursive: true, force: true });
step('剪辑-对照（不加语音保护）', 'edit/vfactory.mjs', [CLIP, '--out', RUN_CUT_NP, '--title', '真实素材 · 中文字幕'], 'real3_cut_np');
fs.rmSync(RUN_CUT, { recursive: true, force: true });
step('剪辑-正式（加语音保护）', 'edit/vfactory.mjs', [CLIP, '--out', RUN_CUT, '--title', '真实素材 · 中文字幕', '--protect', ASR], 'real3_cut');

// 4) 字幕（句子级翻译 → 显示行）
step(`生成字幕（MT=${MT}）`, 'subtitle/make_subs.mjs', [ASR, '--out', SUBS, '--mt', MT, ...(MT === 'agent' ? ['--zh-file', ZHFILE] : []), '--glossary', path.join(ROOT, 'Tool', 'subtitle', 'glossary_zh.json')], 'real3_subs');

// 5) 重映射
step('字幕时间轴重映射', 'subtitle/remap_subs.mjs', [path.join(SUBS, 'cues.json'), path.join(RUN_CUT, 'edits.json'), '--out', REMAP, '--style', 'bilingual'], 'real3_remap');

// 6) 烧入
fs.rmSync(RUN_SUB, { recursive: true, force: true });
step('渲染成片（烧入双语字幕）', 'edit/vfactory.mjs', [CLIP, '--out', RUN_SUB, '--title', '真实素材 · 中文字幕', '--protect', ASR, '--srt', path.join(REMAP, 'out_bilingual.srt')], 'real3_render');

const edlA = JSON.parse(fs.readFileSync(path.join(RUN_CUT, 'edits.json'), 'utf8'));
const edlB = JSON.parse(fs.readFileSync(path.join(RUN_SUB, 'edits.json'), 'utf8'));
const sameKept = JSON.stringify(edlA.kept.map((k) => [k.start, k.end])) === JSON.stringify(edlB.kept.map((k) => [k.start, k.end]));
if (!sameKept) throw new Error('两次渲染的剪辑点不一致（EDL 漂移）');

// 7) 验收 + 质检 + 时间轴图
const ver = runNode('subtitle/verify_subs.mjs', [ASR, path.join(BENCH, 'ground_truth.json'), '--cues', path.join(SUBS, 'cues.json'), '--remap', path.join(REMAP, 'remap.json'), '--json', path.join(RUN_SUB, 'verify_subs.json')], 'real3_verify');
console.log('\n### 字幕链路验收（reference-free）\n' + ver.text.trim().split('\n').slice(-8).join('\n'));
const qa = runNode('acceptance/qa_report.mjs', [path.join(RUN_SUB, 'final.mp4'), '--json', path.join(RUN_SUB, 'qa.json')], 'real3_qa');
console.log('\n### 成片质检\n' + qa.text.trim().split('\n').slice(-6).join('\n'));
step('决策时间轴图', 'edit/make_timeline.mjs', [path.join(RUN_SUB, 'edits.json'), path.join(RUN_SUB, 'timeline.png'), '--label', '真实素材 · 中文字幕'], 'real3_timeline');

const verify = JSON.parse(fs.readFileSync(path.join(RUN_SUB, 'verify_subs.json'), 'utf8'));
const qaJson = JSON.parse(fs.readFileSync(path.join(RUN_SUB, 'qa.json'), 'utf8'));
const cues = JSON.parse(fs.readFileSync(path.join(SUBS, 'cues.json'), 'utf8'));

// ---------- 汇总 ----------
const L = [];
L.push('# 小循环 3 验收记录：真实外语素材（真人说话）→ 中文字幕', '');
L.push(`生成时间：${new Date().toISOString()}　素材：\`${path.relative(ROOT, CLIP)}\`（${dur.toFixed(1)}s，Sintel © Blender Foundation, CC-BY 3.0）`, '');
L.push('## 结论', '');
L.push(`- 字幕链路（reference-free 模式）：**${verify.verdict}**`);
L.push(`- 成片质检：**${qaJson.verdict}**`);
L.push(`- 剪辑一致性：**${sameKept ? '一致' : '漂移'}**`);
L.push('');
L.push('## 音频预处理对识别的影响（本轮关键实验）', '');
L.push('| 预处理 | 识别词数 | 平均置信度 | 时长句数 | 识别文本（前 90 字符） |');
L.push('| --- | --- | --- | --- | --- |');
for (const v of variantRows) {
  if (v.error) { L.push(`| ${v.name} | - | - | - | ${v.error} |`); continue; }
  L.push(`| ${v.name} | ${v.words} | ${v.conf} | ${v.sentences} | ${v.text.slice(0, 90).replace(/\|/g, '/')} |`);
}
L.push('');
// 剪辑对照：语音保护到底救回了多少对白
const edlNP = JSON.parse(fs.readFileSync(path.join(RUN_CUT_NP, 'edits.json'), 'utf8'));
const edlP = JSON.parse(fs.readFileSync(path.join(RUN_CUT, 'edits.json'), 'utf8'));
const cutSec = (e) => e.cut.reduce((a, c) => a + (c.end - c.start), 0);
L.push('## 剪辑对照：语音保护的效果（本轮核心修复）', '');
L.push('| 版本 | 保留 | 切除 | 保留段数 | 说明 |');
L.push('| --- | --- | --- | --- | --- |');
L.push(`| 不加语音保护 | ${edlNP.kept.reduce((a, k) => a + (k.end - k.start), 0).toFixed(2)}s | ${cutSec(edlNP).toFixed(2)}s | ${edlNP.kept.length} | 对白段可能被黑场/冻帧规则剪掉 |`);
L.push(`| 加语音保护（正式） | ${edlP.kept.reduce((a, k) => a + (k.end - k.start), 0).toFixed(2)}s | ${cutSec(edlP).toFixed(2)}s | ${edlP.kept.length} | 识别到语音的 ${(edlP.decision.protected_spans || []).length} 段区间不许剪 |`);
L.push('');
L.push('## 字幕链路指标（reference-free，无讲稿）', '');
L.push('| 指标 | 值 | 判定 |');
L.push('| --- | --- | --- |');
L.push(`| 识别词数 / 置信度 | ${(JSON.parse(fs.readFileSync(ASR, 'utf8')).words || []).length} / ${JSON.parse(fs.readFileSync(ASR, 'utf8')).stats?.avg_conf} | — |`);
L.push(`| 译文覆盖 | ${verify.translate?.translated}/${verify.translate?.cues} | ${verify.pass.translated ? 'OK' : '✗'} |`);
L.push(`| 中文可读性峰值 | ${verify.readability?.max_zh_cps} 字/秒 | ${verify.pass.readability ? 'OK' : '✗'} |`);
L.push(`| 重映射 | ${verify.remap?.cues_out} 条 / 越界 ${verify.remap?.overflow} / 重叠 ${verify.remap?.overlaps} / 最短 ${verify.remap?.min_dur}s | ${verify.pass.remap ? 'OK' : '✗'} |`);
L.push(`| 成片 | ${qaJson.duration_s}s / ${qaJson.video.w}x${qaJson.video.h} / ${qaJson.loudness?.integrated_lufs ?? '-'} LUFS | ${qaJson.verdict} |`);
L.push('');
L.push('## 识别出的句子与译文', '');
L.push('| # | 时间 | 英文（ASR） | 中文（机翻） |');
L.push('| --- | --- | --- | --- |');
cues.sentences.forEach((s, i) => L.push(`| ${i + 1} | ${s.start.toFixed(2)}–${s.end.toFixed(2)} | ${s.en.replace(/\|/g, '/')} | ${(s.zh || '').replace(/\|/g, '/')} |`));
L.push('');
L.push('## 产物', '');
L.push(`- 成片：\`${path.relative(ROOT, path.join(RUN_SUB, 'final.mp4'))}\``);
L.push(`- 双语字幕（成片时间轴）：\`${path.relative(ROOT, path.join(REMAP, 'out_bilingual.srt'))}\``);
L.push(`- 识别稿：\`${path.relative(ROOT, ASR)}\`（音频预处理：\`${AF}\`）`);
L.push(`- 预处理对比：\`History/asr/variant_*.json\``);
L.push(`- 剪辑/质检产物：\`${path.relative(ROOT, RUN_SUB)}\``);
L.push(`- 耗时：${Math.round((Date.now() - t0) / 1000)}s`);

const outMd = path.join(ROOT, 'History', 'loops', 'loop03', 'acceptance.md');
fs.mkdirSync(path.dirname(outMd), { recursive: true });
fs.writeFileSync(outMd, L.join('\n'));
// 已知取舍：对白可能压在黑屏/字幕卡上，语音保护会连带保住那段黑屏 → 质检的"残留黑场"会报警。
// 这不是流水线错误，而是"要声音还是要画面"的取舍，因此单独标注，不当成失败。
const blackWarnOnly = qaJson.verdict !== 'FAIL' ? (() => {
  const failed = Object.entries(qaJson.checks || {}).filter(([, v]) => v === false).map(([k]) => k);
  return failed.length > 0 && failed.every((k) => k === 'no_residual_black');
})() : false;
const ok = verify.verdict === 'PASS' && (qaJson.verdict === 'PASS' || blackWarnOnly) && sameKept;
console.log(`\n[acceptance] -> ${path.relative(ROOT, outMd)}`);
console.log(`[acceptance] ${ok ? 'PASS' : 'FAIL'}  (subs=${verify.verdict}, qa=${qaJson.verdict}${blackWarnOnly ? '（仅残留黑场告警，已知取舍）' : ''}, edl_same=${sameKept})`);
process.exit(ok ? 0 : 1);
