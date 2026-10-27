#!/usr/bin/env node
/**
 * snapshot_loop4.mjs — 把「小循环 4」的产物整理成可交付快照（Prototype/loop4_multi_samples/）
 *
 * 读 History/loops/loop04/metrics.json，逐样本复制：
 *   成片 final.mp4、双语字幕 out_bilingual.srt、验收数据 verify_subs.json、一帧截图
 * 再把 report.md / metrics.json 一起放进快照，生成 cases/ 索引。
 *
 * 用法：node Tool\acceptance\snapshot_loop4.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ffmpeg, ROOT } from '../lib/ff.mjs';

const L4 = path.join(ROOT, 'History', 'loops', 'loop04');
const PROTO = path.join(ROOT, 'Prototype', 'loop4_multi_samples');
const CASES = path.join(PROTO, 'cases');
const METRICS = path.join(L4, 'metrics.json');

if (!fs.existsSync(METRICS)) { console.error('缺少 metrics.json：先跑 node Tool\\acceptance\\run_multi_speech_acceptance.mjs'); process.exit(1); }
const data = JSON.parse(fs.readFileSync(METRICS, 'utf8'));
fs.mkdirSync(CASES, { recursive: true });

const copied = [];
for (const r of data.rows || []) {
  const runDir = path.join(ROOT, 'History', 'runs', 'multi', r.id);
  const subsDir = path.join(ROOT, 'History', 'subs', 'multi', r.id, 'remapped');
  const caseDir = path.join(CASES, r.id);
  fs.mkdirSync(caseDir, { recursive: true });
  const take = (from, to) => {
    if (!fs.existsSync(from)) return false;
    fs.copyFileSync(from, path.join(caseDir, to));
    return true;
  };
  const gotVideo = take(path.join(runDir, 'final.mp4'), 'final.mp4');
  take(path.join(subsDir, 'out_bilingual.srt'), 'out_bilingual.srt');
  take(path.join(runDir, 'verify_subs.json'), 'verify_subs.json');
  take(path.join(runDir, 'qa.json'), 'qa.json');
  take(path.join(runDir, 'edits.json'), 'edits.json');
  // 截一帧（优先取第 2 条字幕的中点，大概率能看到双语字幕）
  if (gotVideo) {
    const cuesFile = path.join(ROOT, 'History', 'subs', 'multi', r.id, 'cues.json');
    let t = 1.0;
    try {
      const cues = JSON.parse(fs.readFileSync(cuesFile, 'utf8')).cues || [];
      const c = cues[Math.min(1, cues.length - 1)];
      if (c) t = Math.max(0.5, (c.start + c.end) / 2);
    } catch { /* 没 cues 就用 1s */ }
    ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(t.toFixed(2)),
      '-i', path.join(caseDir, 'final.mp4'), '-frames:v', '1', path.join(caseDir, 'frame.jpg')],
    path.join(caseDir, '_frame.log'));
  }
  copied.push({ id: r.id, video: gotVideo });
}

// 报告与机器可读指标一起进快照
fs.copyFileSync(path.join(L4, 'report.md'), path.join(PROTO, 'acceptance.md'));
fs.copyFileSync(METRICS, path.join(PROTO, 'metrics.json'));
if (fs.existsSync(path.join(L4, 'excerpts.json'))) fs.copyFileSync(path.join(L4, 'excerpts.json'), path.join(PROTO, 'excerpts.json'));

console.log(`[snapshot] ${copied.filter((c) => c.video).length}/${copied.length} 个样本带成片 → ${path.relative(ROOT, PROTO)}`);
for (const c of copied) console.log(`  ${c.video ? '🎬' : '  '} cases/${c.id}`);
