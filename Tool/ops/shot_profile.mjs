#!/usr/bin/env node
// shot_profile.mjs — 剪辑节奏画像：把一条片子拆成「镜头序列 + 运动能量」，输出可比的数值
//
// 用途：回答「这条片子是怎么剪的」——平均镜头多长、每分钟切几次、切点分布、画面动多少。
// 同一套指标跑 TED 原片 / 我们的长片 / 我们的摘要片，就能看出剪辑语言的差异。
//
// 用法:
//   node Tool/ops/shot_profile.mjs --video <mp4> [--th 0.25] [--fps 10] [--json out.json] [--label 名称]
//
// 指标口径（重要，别混用）:
//   - 硬切阈值 th：ffmpeg scene 分数 > th 记为一次切点。0.25 对演讲类（多机位切换）灵敏，
//     画面几乎不变的静帧动效片（Ken Burns）切点会少，这是真实的剪辑差异，不是漏检。
//   - 运动能量：相邻帧绝对差（YAVG），fps=5 采样，剔除切点后 ±3 帧，避免切点本身污染。
//   - ASL（平均镜头长度）= 总时长 / 镜头数。

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const FF = path.join(ROOT, 'Workspace', 'deps', 'ffmpeg', 'ffmpeg.exe');
const FFMPEG = fs.existsSync(FF) ? FF : 'ffmpeg';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const VIDEO = opt('video');
const TH = Number(opt('th', '0.25'));
const FPS = Number(opt('fps', '10'));
const LABEL = opt('label', path.basename(VIDEO || 'video'));
const JSON_OUT = opt('json', null);
const SKIP_MOTION = argv.includes('--no-motion');

if (!VIDEO || !fs.existsSync(VIDEO)) { console.error('用法: node Tool/ops/shot_profile.mjs --video <mp4> [--th 0.25] [--label 名] [--json out.json]'); process.exit(2); }

function run(args) {
  const r = spawnSync(FFMPEG, args, { encoding: 'utf8', maxBuffer: 1 << 28 });
  return (r.stderr || '') + (r.stdout || '');
}

// ---------- 1) 取时长 ----------
const probe = run(['-hide_banner', '-i', VIDEO]);
const dm = probe.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
if (!dm) { console.error('读不到时长'); process.exit(2); }
const DUR = (+dm[1]) * 3600 + (+dm[2]) * 60 + (+dm[3]);

// ---------- 2) 硬切检测 ----------
const t0 = Date.now();
const cutOut = run(['-hide_banner', '-loglevel', 'info', '-i', VIDEO, '-an',
  '-vf', `scale=320:-2,fps=${FPS},select='gt(scene,${TH})',showinfo`,
  '-f', 'null', '-']);
const cuts = [];
for (const line of cutOut.split('\n')) {
  const m = line.match(/pts_time:([0-9.]+)/);
  if (m && /Parsed_showinfo/.test(line)) cuts.push(Number(m[1]));
}
// 去重（相邻 <0.15s 视为同一次）
const uniq = [];
for (const c of cuts.sort((a, b) => a - b)) if (!uniq.length || c - uniq[uniq.length - 1] > 0.15) uniq.push(c);

// ---------- 3) 镜头长度分布 ----------
const bounds = [0, ...uniq.filter(c => c > 0.3 && c < DUR - 0.3), DUR];
const shots = [];
for (let i = 1; i < bounds.length; i++) shots.push(+(bounds[i] - bounds[i - 1]).toFixed(3));
const sorted = [...shots].sort((a, b) => a - b);
const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
const ASL = DUR / shots.length;

// ---------- 4) 运动能量（剔除切点附近）----------
let motion = null;
if (!SKIP_MOTION) {
  const mo = run(['-hide_banner', '-loglevel', 'error', '-i', VIDEO, '-an',
    '-vf', `scale=320:-2,fps=5,tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-`,
    '-f', 'null', '-']);
  const vals = [];
  for (const line of mo.split('\n')) {
    const m = line.match(/YAVG=([0-9.]+)/);
    if (m) vals.push(Number(m[1]));
  }
  const fpsM = 5;
  const keep = vals.filter((v, i) => {
    const t = i / fpsM;
    return v > 0 && !uniq.some(c => Math.abs(c - t) < 0.6);
  });
  const s = [...keep].sort((a, b) => a - b);
  const mean = keep.reduce((a, b) => a + b, 0) / (keep.length || 1);
  motion = {
    mean: +mean.toFixed(3),
    median: +s[Math.floor(s.length / 2)]?.toFixed(3),
    p95: +s[Math.floor(s.length * 0.95)]?.toFixed(3),
    zero_ratio: +(keep.filter(v => v < 0.05).length / (keep.length || 1)).toFixed(3),
  };
}

const res = {
  label: LABEL,
  video: VIDEO,
  duration_s: +DUR.toFixed(1),
  params: { th: TH, fps: FPS },
  cuts: { count: uniq.length, per_min: +(uniq.length / (DUR / 60)).toFixed(2), times: uniq.map(c => +c.toFixed(2)) },
  shots: {
    count: shots.length,
    asl_s: +ASL.toFixed(2),
    median_s: +pct(0.5).toFixed(2),
    p10_s: +pct(0.1).toFixed(2),
    p90_s: +pct(0.9).toFixed(2),
    max_s: +Math.max(...shots).toFixed(2),
    min_s: +Math.min(...shots).toFixed(2),
    // 短镜头占比：<3s 的镜头比例，衡量"节奏密度"
    under3_ratio: +(shots.filter(s => s < 3).length / shots.length).toFixed(3),
  },
  motion,
  elapsed_s: +((Date.now() - t0) / 1000).toFixed(1),
};

console.log(`\n[${LABEL}]  ${res.duration_s}s`);
console.log(`  镜头 ${shots.length} 个 | ASL ${res.shots.asl_s}s | 切点 ${uniq.length} 次（${res.cuts.per_min}/min）`);
console.log(`  镜头长度: min ${res.shots.min_s} / p10 ${res.shots.p10_s} / 中位 ${res.shots.median_s} / p90 ${res.shots.p90_s} / max ${res.shots.max_s}`);
console.log(`  短镜头(<3s)占比 ${(res.shots.under3_ratio * 100).toFixed(1)}%`);
if (motion) console.log(`  运动能量: mean ${motion.mean} / median ${motion.median} / p95 ${motion.p95} / 静止帧占比 ${(motion.zero_ratio * 100).toFixed(1)}%`);
console.log(`  耗时 ${res.elapsed_s}s`);

if (JSON_OUT) {
  fs.mkdirSync(path.dirname(JSON_OUT), { recursive: true });
  fs.writeFileSync(JSON_OUT, JSON.stringify(res, null, 2));
  console.log(`  → ${JSON_OUT}`);
}
