#!/usr/bin/env node
/**
 * exec_bound.mjs —— 处决单位边界检测器（loop37）
 *
 * 依据：处决动作是「起势 → 承（位移/蓄力）→ 转（命中，可多段）→ 合（收招回待机）」的完整单位，
 * 前后必然被「战斗待机/常规移动」的低运动段包围（依据见 Skills/exec-extract/SKILL.md「处决单位边界规则」节）。
 * 本工具用逐帧帧差（YDIF）包络自动找出「离开待机 → 连续动势 → 回到待机」的三段，给出边界提议。
 *
 * 用法：
 *   node exec_bound.mjs probe <src.mp4> <anchor1,anchor2,...> [outDir] [--pre 6] [--post 5]
 *   node exec_bound.mjs apply <candidates.json> [out.json]
 *
 * probe：对每个 anchor 取窗口，输出边界提议 JSON + 边界取证条带（start-0.4 ~ end+0.4 六帧）
 * apply：把检测结果写回 candidates 配置（每侧 t / dur），供 vs_curate 重新出片
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '../..');
const FF = path.join(ROOT, 'Workspace/deps/ffmpeg/ffmpeg.exe');
const FP = path.join(ROOT, 'Workspace/deps/ffmpeg/ffprobe.exe');
const j = s => (String(s).includes(' ') ? JSON.stringify(s) : String(s));
const run = (cmd, cwd) => execSync(cmd, { stdio: ['ignore', 'ignore', 'inherit'], cwd });
const num = (x, d = 2) => Number(x.toFixed(d));

const probeDur = f => Number(execSync(`${j(FP)} -v quiet -show_entries format=duration -of csv=p=0 ${j(f)}`).toString().trim());

// ---------- 逐帧运动包络 ----------
function motionCurve(src, t0, t1, outDir, tag) {
  src = path.resolve(src);
  const meta = `mb_${tag}.txt`;
  const cmd = `${j(FF)} -y -ss ${num(t0, 3)} -t ${num(t1 - t0, 3)} -i ${j(src)} ` +
    `-vf "scale=480:270,tblend=all_mode=difference,signalstats,metadata=print:file=${meta}" -an -f null -`;
  run(cmd, outDir);
  const txt = fs.readFileSync(path.join(outDir, meta), 'utf8').split('\n');
  const ts = [], vs = [];
  for (const l of txt) {
    const m = l.match(/pts_time:([0-9.]+)/); if (m) ts.push(Number(m[1]));
    const d = l.match(/YDIF=([0-9.]+)/); if (d) vs.push(Number(d[1]));
  }
  const n = Math.min(ts.length, vs.length);
  const curve = [];
  for (let i = 0; i < n; i++) curve.push({ t: t0 + ts[i], v: vs[i] });
  fs.unlinkSync(path.join(outDir, meta));
  return curve;
}

// ---------- 包络分析 ----------
const quantile = (arr, p) => {
  if (!arr.length) return 0;
  const b = [...arr].sort((a, b) => a - b);
  return b[Math.min(b.length - 1, Math.floor(b.length * p))];
};

function runs(curve, pred, minFrames, maxGap = 0) {
  // 满足 pred 的连续段（允许 ≤maxGap 帧的中断合并）
  const out = [];
  let start = -1, gap = 0;
  for (let i = 0; i < curve.length; i++) {
    if (pred(curve[i])) {
      if (start < 0) start = i;
      gap = 0;
    } else if (start >= 0) {
      gap++;
      if (gap > maxGap) {
        const end = i - gap;
        if (end - start + 1 >= minFrames) out.push({ i0: start, i1: end });
        start = -1; gap = 0;
      }
    }
  }
  if (start >= 0) {
    const end = curve.length - 1;
    if (end - start + 1 >= minFrames) out.push({ i0: start, i1: end });
  }
  return out;
}

function analyse(curve, anchor) {
  const vs = curve.map(c => c.v);
  const p50 = quantile(vs, 0.5), p25 = quantile(vs, 0.25), p85 = quantile(vs, 0.85);
  const hi = Math.max(p50 * 1.5, p50 + 3.5);          // 动势阈值
  const lo = Math.max(p25 * 0.85, 1.6);               // 静默阈值
  const fps = curve.length / Math.max(0.001, curve[curve.length - 1].t - curve[0].t + 1 / 30);

  // 动势段（gap≤6 帧合并：命中停顿/慢镜造成的短暂低值不算断开）
  const burst = runs(curve, c => c.v > hi, 4, 6)
    .map(b => ({ ...b, energy: curve.slice(b.i0, b.i1 + 1).reduce((a, c) => a + c.v, 0) }));
  // 静默段（≥0.3s）
  const idle = runs(curve, c => c.v <= lo, Math.round(fps * 0.3), 0);

  // 主簇：包含 anchor 的动势段；若 anchor 落在间隙，取最近的一段
  let main = burst[0];
  if (burst.length) {
    const inside = burst.find(b => curve[b.i0].t <= anchor && curve[b.i1].t >= anchor);
    main = inside || burst.reduce((best, b) => {
      const d = Math.min(Math.abs(curve[b.i0].t - anchor), Math.abs(curve[b.i1].t - anchor));
      return d < best.d ? { ...b, d } : best;
    }, { d: Infinity });
    // 合并与主簇相邻（间隙 ≤0.5s）的动势段：一次处决的多段打击
    let i0 = main.i0, i1 = main.i1;
    let changed = true;
    while (changed) {
      changed = false;
      for (const b of burst) {
        if (b.i1 < i0 && curve[i0].t - curve[b.i1].t <= 0.55) { i0 = b.i0; changed = true; }
        if (b.i0 > i1 && curve[b.i0].t - curve[i1].t <= 0.55) { i1 = b.i1; changed = true; }
      }
    }
    main = { i0, i1 };
  }

  // 起点：主簇之前最近的静默段末尾（离开待机的那一帧）
  const before = idle.filter(r => r.i1 < main.i0).pop();
  // 终点：主簇之后第一个静默段的起点 + 0.35s（收招落地）
  const after = idle.find(r => r.i0 > main.i1);

  let start = before ? curve[before.i1].t : curve[main.i0].t;
  const startIdle = before ? curve[before.i1].t - curve[before.i0].t : 0;
  if (startIdle > 0.5) start -= 0.12;                 // 起势前留一点呼吸，但不吃进上一个动作
  start = Math.max(curve[0].t + 0.02, start);

  let end;
  if (after) {
    const idleDur = curve[after.i1].t - curve[after.i0].t;
    end = curve[after.i0].t + Math.min(0.4, Math.max(0.15, idleDur * 0.7));
  } else {
    end = curve[curve.length - 1].t;
  }

  return {
    start: num(start, 3), end: num(end, 3), dur: num(end - start, 3),
    detail: {
      fps: num(fps, 1), p25: num(p25), p50: num(p50), p85: num(p85),
      hiThr: num(hi), loThr: num(lo),
      bursts: burst.map(b => [num(curve[b.i0].t), num(curve[b.i1].t)]),
      idles: idle.map(r => [num(curve[r.i0].t), num(curve[r.i1].t)]),
      startIdleDur: num(startIdle),
      hasEndIdle: !!after
    }
  };
}

// ---------- 边界取证条带 ----------
function strip(src, times, outPng, outDir, tag) {
  src = path.resolve(src);
  const pngs = [];
  times.forEach((t, i) => {
    const f = `bs_${tag}_${i}.png`;
    run(`${j(FF)} -y -ss ${num(t, 3)} -i ${j(src)} -vf "scale=320:180,setsar=1,drawtext=text='${t.toFixed(2)}s':x=6:y=6:fontsize=20:fontcolor=yellow:box=1:boxcolor=black@0.7" -frames:v 1 ${f}`, outDir);
    pngs.push(f);
  });
  const inputs = pngs.map(f => `-i ${f}`).join(' ');
  run(`${j(FF)} -y ${inputs} -filter_complex "[0:v][1:v][2:v]hstack=3[a];[3:v][4:v][5:v]hstack=3[b];[a][b]vstack=2[v]" -map "[v]" -frames:v 1 ${outPng}`, outDir);
  pngs.forEach(f => fs.unlinkSync(path.join(outDir, f)));
}

// ---------- 主流程 ----------
const [mode, src, anchorsArg, outDirArg] = process.argv.slice(2);
if (!mode || !src) { console.error('用法: node exec_bound.mjs probe <src> <t1,t2,..> [outDir] | apply <candidates.json> [out.json]'); process.exit(1); }

if (mode === 'probe') {
  const outDir = path.resolve(outDirArg || 'Prototype/exec_bound_out');
  fs.mkdirSync(outDir, { recursive: true });
  const anchors = anchorsArg.split(',').map(Number);
  const dur = probeDur(src);
  const results = [];
  anchors.forEach((anchor, k) => {
    const t0 = Math.max(0, anchor - 8), t1 = Math.min(dur, anchor + 6);
    const curve = motionCurve(src, t0, t1, outDir, String(k).padStart(2, '0'));
    const r = analyse(curve, anchor);
    strip(src, [r.start - 0.4, r.start, r.start + 0.4, r.end - 0.4, r.end, r.end + 0.4],
      `bound_${String(k).padStart(2, '0')}_${anchor.toFixed(1)}.png`, outDir, String(k).padStart(2, '0'));
    results.push({ anchor, ...r });
    console.log(`anchor ${anchor}s → [${r.start}, ${r.end}]  ${r.dur}s  (startIdle=${r.detail.startIdleDur}s, endIdle=${r.detail.hasEndIdle})`);
  });
  fs.writeFileSync(path.join(outDir, 'bounds.json'), JSON.stringify(results, null, 2), 'utf8');
  console.log('→', path.join(outDir, 'bounds.json'));
}

if (mode === 'apply') {
  const cfgPath = path.resolve(process.argv[3]);
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const outPath = path.resolve(process.argv[4] || path.join(path.dirname(cfgPath), 'candidates_bounded.json'));
  const cache = {};
  const get = (side, anchor) => {
    const key = side + '@' + anchor;
    if (cache[key]) return cache[key];
    const srcPath = path.resolve(path.dirname(cfgPath), cfg.sides[side].src);
    const d = probeDur(srcPath);
    const curve = motionCurve(srcPath, Math.max(0, anchor - 6), Math.min(d, anchor + 5), path.dirname(cfgPath), `tmp_${side}_${String(anchor).replace('.', '_')}`);
    cache[key] = analyse(curve, anchor);
    return cache[key];
  };
  for (const c of cfg.candidates) {
    for (const side of ['a', 'b']) {
      const r = get(side, c[side].t);
      c[side].t = r.start;
      c[side].dur = r.dur;
      c[side]._raw = { anchor: r.anchor, end: r.end, dur: r.dur };
    }
    // 共享时长 = 两侧较长者（短的一侧轻微变速拉伸，避免剪断动作）
    const da = c.a.dur, db = c.b.dur;
    c.dur = num(Math.max(da, db), 2);
    c.fit = { a: num(c.dur / da, 3), b: num(c.dur / db, 3) };
  }
  fs.writeFileSync(outPath, JSON.stringify(cfg, null, 2), 'utf8');
  console.log('→', outPath);
}
