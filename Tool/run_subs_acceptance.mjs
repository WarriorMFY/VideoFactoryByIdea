#!/usr/bin/env node
/**
 * run_subs_acceptance.mjs — 小循环 2 一键验收：外语视频 → 中文（双语）字幕成片
 *
 * 全流程（每步产物都落 History/，命令可逐条复跑）：
 *   1. 素材：Tool/make_l2_bench.mjs（Edge 神经 TTS 英文稿 + 真实画面，逐句时间已知=真值）
 *   2. 识别：Tool/asr_vosk.mjs（Vosk 离线 + koffi 直连 libvosk，词级时间戳）
 *   3. 剪辑：Tool/vfactory.mjs（沿用小循环 1 的黑场/冻帧/静音决策）
 *   4. 字幕：Tool/make_subs.mjs（句子级翻译 → 显示行 → SRT，MyMemory 或 agent 精译）
 *   5. 重映射：Tool/remap_subs.mjs（把原片时间轴字幕对齐到剪辑后时间轴）
 *   6. 烧入：Tool/vfactory.mjs --srt（libass + SimHei）
 *   7. 验收：Tool/verify_subs.mjs（WER/覆盖/句界误差/可读性/重映射自检）+ Tool/qa_report.mjs
 *
 * 用法：node Tool/run_subs_acceptance.mjs [--skip-build] [--mt mymemory|agent] [--zh-file f.json]
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from './lib/ff.mjs';

const args = process.argv.slice(2);
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const MT = getOpt('--mt', 'mymemory');
const ZHFILE = getOpt('--zh-file', '');
const SKIP_BUILD = args.includes('--skip-build');
const NODE = process.execPath;
const BENCH = path.join(ROOT, 'History', 'bench', 'l2_en');
const RUNBASE = path.join(ROOT, 'History', 'runs', 'l2_cut');
const RUNSUB = path.join(ROOT, 'History', 'runs', `l2_subs_${MT}`);
const SUBS = path.join(ROOT, 'History', 'subs', 'l2');
const REMAP = path.join(SUBS, 'remapped');
const LOGS = path.join(ROOT, 'History', 'runs', '_logs');

function runNode(script, scriptArgs, logName) {
  const log = path.join(LOGS, `${logName}.log`);
  fs.mkdirSync(LOGS, { recursive: true });
  const fd = fs.openSync(log, 'w');
  let r;
  try { r = spawnSync(NODE, [path.join(ROOT, 'Tool', script), ...scriptArgs], { stdio: ['ignore', fd, fd], cwd: ROOT }); }
  finally { fs.closeSync(fd); }
  return { status: r.status, text: fs.readFileSync(log, 'utf8'), log };
}
function step(title, script, scriptArgs, logName, { allowFail = false } = {}) {
  process.stdout.write(`\n### ${title}\n`);
  const res = runNode(script, scriptArgs, logName);
  console.log(res.text.trim().split('\n').slice(-12).join('\n'));
  if (res.status !== 0 && !allowFail) throw new Error(`${script} 失败（日志 ${path.relative(ROOT, res.log)}）`);
  return res;
}

const t0 = Date.now();
const marks = [];
const mark = (label) => { marks.push({ label, at: new Date().toISOString(), sec: Math.round((Date.now() - t0) / 1000) }); };

// 1) 素材
if (!SKIP_BUILD || !fs.existsSync(path.join(BENCH, 'source.mp4'))) {
  step('1/7 造素材（Edge TTS 英文语音 + 真实画面）', 'make_l2_bench.mjs', [], 'l2_make');
} else console.log('[skip] 素材已存在');
mark('material');

// 2) 识别
const trFile = path.join(ROOT, 'History', 'asr', 'transcript.json');
step('2/7 离线语音识别（Vosk）', 'asr_vosk.mjs', [path.join(BENCH, 'source.mp4'), '--out', trFile], 'l2_asr');
mark('asr');

// 3) 剪辑（先出 EDL，用于字幕重映射）
fs.rmSync(RUNBASE, { recursive: true, force: true });
step('3/7 剪辑（出 EDL）', 'vfactory.mjs', [path.join(BENCH, 'source.mp4'), '--out', RUNBASE, '--title', '外语视频 · 中文字幕'], 'l2_cut');
mark('cut');

// 4) 字幕（句子级翻译 → 显示行）
step(`4/7 生成字幕（MT=${MT}）`, 'make_subs.mjs', [trFile, '--out', SUBS, '--mt', MT, ...(MT === 'agent' ? ['--zh-file', ZHFILE] : []), '--glossary', path.join(ROOT, 'Tool', 'glossary_zh.json')], 'l2_subs');
mark('subs');

// 5) 重映射到剪辑后时间轴
step('5/7 字幕时间轴重映射', 'remap_subs.mjs', [path.join(SUBS, 'cues.json'), path.join(RUNBASE, 'edits.json'), '--out', REMAP, '--style', 'bilingual'], 'l2_remap');
mark('remap');

// 6) 烧入字幕出成片
fs.rmSync(RUNSUB, { recursive: true, force: true });
step('6/7 渲染成片（烧入双语字幕）', 'vfactory.mjs', [path.join(BENCH, 'source.mp4'), '--out', RUNSUB, '--title', '外语视频 · 中文字幕', '--srt', path.join(REMAP, 'out_bilingual.srt')], 'l2_render');
mark('render');

// 剪辑一致性断言：两次渲染的 EDL 必须一致，否则字幕与画面会错位
const edlA = JSON.parse(fs.readFileSync(path.join(RUNBASE, 'edits.json'), 'utf8'));
const edlB = JSON.parse(fs.readFileSync(path.join(RUNSUB, 'edits.json'), 'utf8'));
const sameKept = JSON.stringify(edlA.kept.map((k) => [k.start, k.end])) === JSON.stringify(edlB.kept.map((k) => [k.start, k.end]));
if (!sameKept) throw new Error('两次渲染的剪辑点不一致（EDL 漂移），字幕会错位');

// 7) 验收 + 质检 + 时间轴图
const ver = step('7/7 字幕链路验收', 'verify_subs.mjs', [trFile, path.join(BENCH, 'ground_truth.json'), '--cues', path.join(SUBS, 'cues.json'), '--remap', path.join(REMAP, 'remap.json'), '--ref', path.join(BENCH, 'reference_zh.json'), '--json', path.join(RUNSUB, 'verify_subs.json')], 'l2_verify', { allowFail: true });
const qa = step('成片质检', 'qa_report.mjs', [path.join(RUNSUB, 'final.mp4'), '--json', path.join(RUNSUB, 'qa.json')], 'l2_qa', { allowFail: true });
step('决策时间轴图', 'make_timeline.mjs', [path.join(RUNSUB, 'edits.json'), path.join(RUNSUB, 'timeline.png'), '--label', '外语视频 · 中文字幕'], 'l2_timeline');
mark('verify');

const verify = JSON.parse(fs.readFileSync(path.join(RUNSUB, 'verify_subs.json'), 'utf8'));
const qaJson = JSON.parse(fs.readFileSync(path.join(RUNSUB, 'qa.json'), 'utf8'));
const cues = JSON.parse(fs.readFileSync(path.join(SUBS, 'cues.json'), 'utf8'));
const remap = JSON.parse(fs.readFileSync(path.join(REMAP, 'remap.json'), 'utf8'));

const L = [];
L.push('# 小循环 2 验收记录（自动生成）', '');
L.push(`生成时间：${new Date().toISOString()}　用例：\`${path.relative(ROOT, BENCH)}\`　MT 后端：**${MT}**`, '');
L.push('## 结论', '');
L.push(`- 字幕链路：**${verify.verdict}**`);
L.push(`- 成片质检：**${qaJson.verdict}**`);
L.push(`- 剪辑一致性：**${sameKept ? '一致' : '漂移'}**（两次渲染的 EDL 相同，字幕不会错位）`);
L.push('');
L.push('## 关键指标', '');
L.push('| 指标 | 数值 | 判据 | 判定 |');
L.push('| --- | --- | --- | --- |');
L.push(`| 语音识别 WER | ${(verify.wer.rate * 100).toFixed(1)}%（错 ${verify.wer.dist}/${verify.wer.refWords} 词） | ≤ ${(verify.thresholds.wer * 100).toFixed(0)}% | ${verify.pass.wer ? 'OK' : '✗'} |`);
L.push(`| 语音被字幕覆盖 | ${(verify.timing.coverage_ratio * 100).toFixed(1)}% | ≥ 95% | ${verify.pass.coverage ? 'OK' : '✗'} |`);
L.push(`| 句界误差（均/最大） | ${verify.timing.mean_boundary_err_s}s / ${verify.timing.max_boundary_err_s}s | 均 ≤ 0.8s，最大 ≤ 1.5s | ${verify.pass.boundary_mean && verify.pass.boundary_max ? 'OK' : '✗'} |`);
L.push(`| 中文译文覆盖 | ${verify.translate?.translated}/${verify.translate?.cues} 条 | 100% | ${verify.pass.translated ? 'OK' : '✗'} |`);
L.push(`| 中文字幕可读性（峰值） | ${verify.readability?.max_zh_cps} 字/秒（均值 ${verify.readability?.mean_zh_cps}） | ≤ ${verify.thresholds.cps_zh} | ${verify.pass.readability ? 'OK' : '✗'} |`);
L.push(`| 重映射自检 | ${verify.remap?.cues_out} 条 / 越界 ${verify.remap?.overflow} / 重叠 ${verify.remap?.overlaps} / 最短 ${verify.remap?.min_dur}s | 无越界/重叠、≥0.5s | ${verify.pass.remap ? 'OK' : '✗'} |`);
L.push(`| 机翻 vs 人工精译（参考） | ${((verify.quality?.mean_char_sim || 0) * 100).toFixed(1)}% 字符相似度 | 仅报告 | — |`);
L.push(`| 成片 | ${qaJson.duration_s}s / ${qaJson.video.w}x${qaJson.video.h} / ${qaJson.loudness?.integrated_lufs ?? '-'} LUFS | — | ${qaJson.verdict} |`);
L.push('');
L.push('## 识别到的句子与译文', '');
L.push('| # | 时间 | 英文（ASR） | 中文（机翻） |');
L.push('| --- | --- | --- | --- |');
cues.sentences.forEach((s, i) => L.push(`| ${i + 1} | ${s.start.toFixed(2)}–${s.end.toFixed(2)} | ${s.en.replace(/\|/g, '/')} | ${(s.zh || '').replace(/\|/g, '/')} |`));
L.push('');
L.push('## 真值对照（逐句）', '');
L.push('| # | 真值时间 | 真值英文 | 人工精译 |');
L.push('| --- | --- | --- | --- |');
const gt = JSON.parse(fs.readFileSync(path.join(BENCH, 'ground_truth.json'), 'utf8'));
gt.sentences.forEach((s) => L.push(`| ${s.idx + 1} | ${s.start.toFixed(2)}–${s.end.toFixed(2)} | ${s.text.replace(/\|/g, '/')} | ${(s.ref_zh || '').replace(/\|/g, '/')} |`));
L.push('');
L.push('## 耗时', '');
for (const m of marks) L.push(`- ${m.label}: ${m.sec}s`);
L.push(`- 合计: ${Math.round((Date.now() - t0) / 1000)}s`);
L.push('');
L.push('## 产物', '');
L.push(`- 成片：\`${path.relative(ROOT, path.join(RUNSUB, 'final.mp4'))}\``);
L.push(`- 字幕：\`${path.relative(ROOT, path.join(REMAP, 'out_bilingual.srt'))}\`（重映射后）/ \`${path.relative(ROOT, path.join(SUBS, 'zh.srt'))}\`（原时间轴）`);
L.push(`- 识别稿：\`${path.relative(ROOT, trFile)}\``);
L.push(`- EDL / 报告 / 时间轴图 / 质检：\`${path.relative(ROOT, RUNSUB)}\``);

const outMd = path.join(ROOT, 'History', 'loops', 'loop02', MT === 'mymemory' ? 'acceptance.md' : `acceptance_${MT}.md`);
fs.mkdirSync(path.dirname(outMd), { recursive: true });
fs.writeFileSync(outMd, L.join('\n'));
const ok = verify.verdict === 'PASS' && qaJson.verdict === 'PASS' && sameKept;
console.log(`\n[acceptance] -> ${path.relative(ROOT, outMd)}`);
console.log(`[acceptance] ${ok ? 'PASS' : 'FAIL'}  (subs=${verify.verdict}, qa=${qaJson.verdict}, edl_same=${sameKept}, MT=${MT})`);
process.exit(ok ? 0 : 1);
