#!/usr/bin/env node
/**
 * run_acceptance.mjs — 一键端到端验收（可重复执行的判定入口）
 *
 * 做四件事：
 *   1. 准备两个带真值的测试素材（合成 / 真实素材+已知废镜头）
 *   2. 用 vfactory 跑完整剪辑流水线
 *   3. 用 verify_edl 对比真值（决策对不对）+ qa_report 检查成片规格（成片合不合格）
 *   4. 汇总成 History/loops/loop01/acceptance.md 并给出 PASS/FAIL（失败则退出码 1）
 *
 * 用法：node Tool/run_acceptance.mjs [--out-root History/runs] [--skip-build]
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from './lib/ff.mjs';

const args = process.argv.slice(2);
const getArg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const RUNROOT = path.resolve(ROOT, getArg('--out-root', 'History/runs'));
const NODE = process.execPath;

// 沙箱禁止管道 stdio：把子进程输出重定向到文件，再读回打印/汇总
function runNode(script, scriptArgs, logName) {
  const log = path.join(RUNROOT, '_logs', logName + '.log');
  fs.mkdirSync(path.dirname(log), { recursive: true });
  const fd = fs.openSync(log, 'w');
  let r;
  try { r = spawnSync(NODE, [path.join(ROOT, 'Tool', script), ...scriptArgs], { stdio: ['ignore', fd, fd], cwd: ROOT }); }
  finally { fs.closeSync(fd); }
  const text = fs.readFileSync(log, 'utf8');
  return { status: r.status, text, log };
}

function step(title, script, scriptArgs, logName) {
  process.stdout.write(`\n### ${title}\n`);
  const res = runNode(script, scriptArgs, logName);
  const tail = res.text.trim().split('\n').slice(-14).join('\n');
  console.log(tail);
  return res;
}

const CASES = [
  {
    id: 'synth',
    title: '用例 A：合成素材（7 段，含黑场/冻帧/静音/仅静音/仅冻帧，带真值）',
    benchDir: path.join(ROOT, 'History', 'bench', 'synth'),
    makeScript: 'make_bench_source.mjs',
    makeArgs: [path.join(ROOT, 'History', 'bench', 'synth')],
    runDir: path.join(RUNROOT, 'bench01'),
    titleText: '剪辑工厂 DEMO',
  },
  {
    id: 'real',
    title: '用例 B：真实素材 Big Buck Bunny（CC-BY 3.0）+ 已知头/中/尾废镜头（带真值）',
    benchDir: path.join(ROOT, 'History', 'bench', 'real'),
    makeScript: 'make_real_bench.mjs',
    makeArgs: [],
    runDir: path.join(RUNROOT, 'real01'),
    titleText: '真实素材测试',
  },
];

const results = [];
for (const c of CASES) {
  const src = path.join(c.benchDir, 'source.mp4');
  const gtFile = path.join(c.benchDir, 'ground_truth.json');
  const assetOk = c.id === 'real' ? fs.existsSync(path.join(ROOT, 'Workspace', 'assets', 'Big_Buck_Bunny_1080_10s_5MB.mp4')) : true;
  if (!args.includes('--skip-build') || !fs.existsSync(src) || !fs.existsSync(gtFile)) {
    if (!assetOk) { results.push({ ...c, ok: false, note: '缺少真实素材（先跑 Tool/fetch_real_footage.mjs）' }); continue; }
    const mk = step(`准备素材 ${c.id}`, c.makeScript, c.makeArgs, `make_${c.id}`);
    if (mk.status !== 0) { results.push({ ...c, ok: false, note: '素材生成失败' }); continue; }
  }
  fs.rmSync(c.runDir, { recursive: true, force: true });
  const run = step(`剪辑 ${c.id}`, 'vfactory.mjs', [src, '--out', c.runDir, '--title', c.titleText], `vfactory_${c.id}`);
  if (run.status !== 0) { results.push({ ...c, ok: false, note: '流水线执行失败', log: run.log }); continue; }
  step(`决策时间轴图 ${c.id}`, 'make_timeline.mjs', [path.join(c.runDir, 'edits.json'), path.join(c.runDir, 'timeline.png'), '--label', c.titleText + ' 剪辑决策'], `timeline_${c.id}`);
  const ver = step(`真值验收 ${c.id}`, 'verify_edl.mjs', [path.join(c.runDir, 'edits.json'), gtFile, '--json', path.join(c.runDir, 'verify.json')], `verify_${c.id}`);
  const qa = step(`成片质检 ${c.id}`, 'qa_report.mjs', [path.join(c.runDir, 'final.mp4'), '--json', path.join(c.runDir, 'qa.json')], `qa_${c.id}`);
  const verify = JSON.parse(fs.readFileSync(path.join(c.runDir, 'verify.json'), 'utf8'));
  const qaJson = JSON.parse(fs.readFileSync(path.join(c.runDir, 'qa.json'), 'utf8'));
  const edl = JSON.parse(fs.readFileSync(path.join(c.runDir, 'edits.json'), 'utf8'));
  results.push({ ...c, ok: verify.verdict === 'PASS' && qaJson.verdict === 'PASS', verify, qa: qaJson, edl, src, gtFile, verifyStatus: ver.status });
}

// ---------- 汇总 ----------
const L = [];
L.push('# 验收记录（自动生成）', '');
L.push(`生成时间：${new Date().toISOString()}  `);
L.push(`命令：\`node Tool/run_acceptance.mjs\``, '');
L.push('## 结论', '');
for (const r of results) L.push(`- **${r.id}**：${r.ok ? 'PASS' : 'FAIL'}${r.note ? `（${r.note}）` : ''}`);
L.push('');
L.push('## 明细', '');
L.push('| 用例 | 真值应切 | 实际切 | 过切 | 漏切 | IoU | 最大边界误差 | 成片时长 | 成片规格 | 响度 |');
L.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const r of results) {
  if (!r.verify) continue;
  const m = r.verify.measured, q = r.qa;
  L.push(`| ${r.id} | ${m.gt_dropped_s}s | ${m.actual_dropped_s}s | ${m.overcut_s}s | ${m.undercut_s}s | ${m.iou} | ${m.max_boundary_err_s}s | ${q.duration_s}s | ${q.video.w}x${q.video.h} ${q.video.codec}/${q.video.profile} ${q.video.fps} | ${q.loudness?.integrated_lufs ?? '-'} LUFS |`);
}
L.push('');
L.push('### 分段存活率（keep 应≈100%，drop 应≈0%）', '');
for (const r of results) {
  if (!r.verify) continue;
  L.push(`**${r.id}**`, '', '| 段 | 时间 | 期望 | 存活 | 判定 |', '| --- | --- | --- | --- | --- |');
  for (const s of r.verify.sections) L.push(`| ${s.id} | ${s.start}-${s.end} | ${s.expect} | ${(s.survive * 100).toFixed(1)}% | ${s.ok ? 'OK' : '✗'} |`);
  L.push('');
}
L.push('### 成片质检检查项', '');
for (const r of results) {
  if (!r.qa) continue;
  const c = r.qa.checks;
  L.push(`- **${r.id}**：${Object.entries(c).map(([k, v]) => `${k}=${v === null ? 'n/a' : v ? 'ok' : '✗'}`).join('，')}`);
  if (r.qa.silent_input_note) L.push(`  - 注：${r.qa.silent_input_note}`);
  L.push(`  - 残留信号：黑场 ${r.qa.residual_defects.black_segments}、冻帧 ${r.qa.residual_defects.freeze_segments}、静音 ${r.qa.residual_defects.silence_segments}（冻帧/静音残留可能是设计内保留）`);
}
L.push('', '## 产物位置', '');
for (const r of results) L.push(`- ${r.id}: \`${path.relative(ROOT, r.runDir)}\`（final.mp4 / edits.json / timeline.png / verify.json / qa.json / report.md / contact_sheet.jpg / runlog.jsonl）`);

const loopsDir = path.join(ROOT, 'History', 'loops', 'loop01');
fs.mkdirSync(loopsDir, { recursive: true });
const outMd = path.join(loopsDir, 'acceptance.md');
fs.writeFileSync(outMd, L.join('\n'));
console.log(`\n[acceptance] -> ${path.relative(ROOT, outMd)}`);
const allOk = results.every((r) => r.ok);
console.log(`[acceptance] ${allOk ? 'PASS' : 'FAIL'}  (${results.map((r) => `${r.id}=${r.ok ? 'PASS' : 'FAIL'}`).join(', ')})`);
process.exit(allOk ? 0 : 1);
