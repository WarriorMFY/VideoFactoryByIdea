#!/usr/bin/env node
/**
 * watch_feedback.mjs — 一条命令跑完「感知 → 诊断 → 排下一轮」
 *
 * 三个环节各有一个脚本（各自可单独跑、可测），这里只负责按顺序串起来：
 *   ① collect_feedback.mjs  采 B 站公开数据（播放/互动/评论原文/弹幕原文）→ feedback.csv + latest.json
 *   ② track_feedback.mjs    算比率、环比、规则化 P0/P1 动作 → feedback_report.md/.json
 *   ③ plan_next_loop.mjs    信号 → 下一轮任务书 → History/loops/next/plan.md
 *
 * 之所以要一个入口：定时任务里挂三条命令，中间断一条就悄悄不跑了；
 * 这里任何一步失败都会明确打印是哪一步、以及前面几步的产物还在不在。
 *
 * 用法：
 *   node Tool/ops/watch_feedback.mjs                 # 全流程
 *   node Tool/ops/watch_feedback.mjs --brief         # 只打一行摘要（给定时任务/日志用）
 *   node Tool/ops/watch_feedback.mjs --avg-watch 12  # 顺带补录平均播放时长
 */
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { ROOT } from '../lib/ff.mjs';

const args = process.argv.slice(2);
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const BRIEF = args.includes('--brief');

// 2026-11-01 起 loop13：跟踪重投稿 BV1VRx16WEyn（旧稿 BV1AaxC6hExH 已下架）
const CASE = path.join('Prototype', 'loop13_feedback_clock');
const CSV = getOpt('--csv', path.join(CASE, 'feedback.csv'));

function step(label, script, argv) {
  if (!BRIEF) console.log(`\n=== ${label} ===`);
  const r = spawnSync(process.execPath, [script, ...argv], {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
    stdio: BRIEF ? 'pipe' : 'inherit',
  });
  if (BRIEF && r.stdout) process.stdout.write(r.stdout.split('\n').filter((l) => /^\[/.test(l)).join('\n') + '\n');
  if (r.status !== 0) {
    console.error(`[watch] ${label} 失败（exit ${r.status}）：${(r.stderr || '').trim().slice(0, 400)}`);
    return false;
  }
  return true;
}

// ① 采集
const collectArgs = ['--csv', CSV];
const aw = getOpt('--avg-watch', '');
if (aw) collectArgs.push('--avg-watch', aw);
if (!step('1/3 采集 B 站数据', 'Tool/ops/collect_feedback.mjs', collectArgs)) {
  console.error('[watch] 采集中断：拿不到线上数据，后续诊断与规划没有输入，本次不推进。');
  process.exit(1);
}

// ② 诊断
if (!step('2/3 诊断（完播/互动/环比 → P0/P1）', 'Tool/ops/track_feedback.mjs',
  ['--csv', CSV, '--out', path.join(CASE, 'feedback_report.md')])) {
  console.error('[watch] 诊断失败。采集结果已落盘，可单独重跑 track_feedback.mjs。');
  process.exit(1);
}

// ③ 规划
if (!step('3/3 规划下一轮', 'Tool/ops/plan_next_loop.mjs',
  ['--snap', 'History/runs/feedback/latest.json',
   '--report', path.join(CASE, 'feedback_report.json'),
   '--out-dir', 'History/loops/next'])) {
  console.error('[watch] 规划失败。快照与诊断都在，可单独重跑 plan_next_loop.mjs。');
  process.exit(1);
}

// 摘要
const planFile = path.join(ROOT, 'History', 'loops', 'next', 'plan.json');
let summ = '规划文件缺失';
if (fs.existsSync(planFile)) {
  const p = JSON.parse(fs.readFileSync(planFile, 'utf8'));
  const c = p.context;
  const top = p.proposals[0];
  summ = `播放 ${c.views}｜评论 ${c.commentCount}｜弹幕 ${c.danmakuCount}｜提案首位 ${top.pri} ${top.id} ${top.title}`;
}
console.log(`\n[watch] 完成：${summ}`);
console.log('[watch] 详情：History/loops/next/plan.md');
