#!/usr/bin/env node
/**
 * make_timeline.mjs — 把 EDL 画成一条时间轴图（source 时间 → 保留/切除），便于人一眼看懂剪辑决策
 *
 * 用法：node Tool/make_timeline.mjs <edits.json> <out.png> [--width 1600] [--label "标题"]
 */
import path from 'node:path';
import fs from 'node:fs';
import { ffmpeg, ROOT } from './lib/ff.mjs';

const args = process.argv.slice(2);
const edlPath = args[0], outPath = args[1];
if (!edlPath || !outPath) { console.error('用法: node Tool/make_timeline.mjs <edits.json> <out.png> [--width 1600]'); process.exit(2); }
const W = Number(args.includes('--width') ? args[args.indexOf('--width') + 1] : 1600);
const label = args.includes('--label') ? args[args.indexOf('--label') + 1] : '剪辑决策时间轴';

const edl = JSON.parse(fs.readFileSync(edlPath, 'utf8'));
const dur = edl.source.duration;
const H = 300;
const barX = 40, barW = W - 80, barY = 90, barH = 84;
const x = (t) => Math.round(barX + (t / dur) * barW);

const parts = [];
const fontArg = `font=SimHei`;

// 底条（整段源）
parts.push(`drawbox=x=${barX}:y=${barY}:w=${barW}:h=${barH}:color=0x3a4450:t=fill`);
// 切除段（红）
for (const c of edl.cut) {
  const w = Math.max(2, x(c.end) - x(c.start));
  parts.push(`drawbox=x=${x(c.start)}:y=${barY}:w=${w}:h=${barH}:color=0xd0442c:t=fill`);
}
// 保留段（绿）
for (const k of edl.kept) {
  const w = Math.max(2, x(k.end) - x(k.start));
  parts.push(`drawbox=x=${x(k.start)}:y=${barY}:w=${w}:h=${barH}:color=0x35c07a:t=fill`);
}
// 边框
parts.push(`drawbox=x=${barX}:y=${barY}:w=${barW}:h=${barH}:color=0xffffff@0.55:t=2`);
// 刻度（每 10%）
for (let i = 0; i <= 10; i++) {
  const t = (dur * i) / 10;
  parts.push(`drawbox=x=${x(t)}:y=${barY + barH}:w=1:h=10:color=0x8899a6:t=fill`);
  parts.push(`drawtext=${fontArg}:text='${t.toFixed(1)}s':fontsize=18:fontcolor=0x9fb0bd:x=${Math.min(W - 60, Math.max(0, x(t) - 14))}:y=${barY + barH + 14}`);
}
// 保留段编号
edl.kept.forEach((k, i) => {
  const cx = Math.round((x(k.start) + x(k.end)) / 2);
  const labelTxt = `${i + 1}`;
  parts.push(`drawtext=${fontArg}:text='${labelTxt}':fontsize=34:fontcolor=0x06210f:x=${cx - 10}:y=${barY + 22}`);
});

const keepDur = edl.kept.reduce((a, k) => a + (k.end - k.start), 0);
const cutDur = dur - keepDur;
const head = label.replace(/[:',%]/g, ' ');
parts.push(`drawtext=${fontArg}:fontsize=30:fontcolor=0xe8eef4:x=40:y=26:text='${head}'`);
parts.push(`drawtext=${fontArg}:fontsize=20:fontcolor=0x9fb0bd:x=40:y=62:text='源 ${dur.toFixed(2)}s   保留 ${keepDur.toFixed(2)}s (${(keepDur / dur * 100).toFixed(1)}%)   切除 ${cutDur.toFixed(2)}s (${(cutDur / dur * 100).toFixed(1)}%)'`);
parts.push(`drawtext=${fontArg}:fontsize=19:fontcolor=0x35c07a:x=40:y=${H - 44}:text='■ 保留'`);
parts.push(`drawtext=${fontArg}:fontsize=19:fontcolor=0xd0442c:x=130:y=${H - 44}:text='■ 切除'`);
parts.push(`drawtext=${fontArg}:fontsize=19:fontcolor=0x9fb0bd:x=230:y=${H - 44}:text='转场 ${edl.output.transition}   输出 ${edl.output.duration.toFixed(2)}s   ${edl.output.width}x${edl.output.height}@${edl.output.fps}'`);

const vf = parts.join(',');
const r = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `color=c=0x11161d:s=${W}x${H}:d=1`, '-vf', vf, '-frames:v', '1', outPath],
  path.join(path.dirname(outPath), '_timeline.log'));
if (r.status !== 0) { console.error(r.text.split('\n').slice(-10).join('\n')); process.exit(1); }
console.log('[timeline] ->', path.relative(ROOT, outPath));
