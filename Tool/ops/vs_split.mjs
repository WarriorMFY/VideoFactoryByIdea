#!/usr/bin/env node
// vs_split.mjs —— 双源「对比剪辑流」生成器（loop35 提炼）
// 左右 / 上下分屏，A/B 两侧逐组对位硬切；片头双标题卡、片尾对位、可选 BGM
// 用法: node Tool/ops/vs_split.mjs <config.json> [out.mp4]
// 设计约束（沿 loop33/34/35 铁律）：逐段独立渲染 crf16 中间件 → concat demuxer 拼接；
// 中文一律用每段独立 ASS（cwd=BUILD 相对路径）；ASS 颜色为 &HBBGGRR&；无限 lavfi 源必加 -t。
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const FF = process.env.FFMPEG || join(ROOT, 'Workspace/deps/ffmpeg/ffmpeg.exe');
const FP = process.env.FFPROBE || FF.replace(/ffmpeg(\.exe)?$/i, 'ffprobe$1');
const j = s => (s.includes(' ') ? JSON.stringify(s) : s);

const cfgPath = process.argv[2];
if (!cfgPath) { console.error('用法: node vs_split.mjs <config.json> [out.mp4]'); process.exit(1); }
const CFG = JSON.parse(readFileSync(resolve(cfgPath), 'utf8'));
const DIR = dirname(resolve(cfgPath));
const BUILD = join(DIR, CFG.buildDir || 'vs_build');
const OUT = resolve(process.argv[3] || join(DIR, CFG.out || 'vs_out.mp4'));
mkdirSync(BUILD, { recursive: true });

const run = (cmd, cwd = BUILD) => {
  console.error('[cmd]', cmd.length > 150 ? cmd.slice(0, 150) + '…' : cmd);
  execSync(cmd, { stdio: ['ignore', 'ignore', 'inherit'], cwd });
};
const probe = f => {
  const o = execSync(`${j(FP)} -v quiet -show_entries stream=width,height -select_streams v:0 -of csv=p=0 ${j(f)}`).toString().trim();
  const [w, h] = o.split(',').map(Number);
  return { w, h };
};
const resolveSrc = p => {
  const cands = [resolve(DIR, p), resolve(p)];
  for (const c of cands) if (existsSync(c)) return c;
  console.error('源文件不存在: ' + p); process.exit(1);
};

// ---------- 版式 ----------
const FPS = CFG.fps || 30;
const CRF = CFG.crf ?? 18;
const MID = CFG.mid ?? 16;
const DIV = CFG.divider ?? 6;
const LAYOUT = (CFG.layout || 'lr').toLowerCase();
const W = 1920, H = 1080;
const L = LAYOUT === 'tb'
  ? { halfW: W, halfH: Math.round(H / 2), stack: 'vstack', vert: false }
  : { halfW: Math.round(W / 2), halfH: H, stack: 'hstack', vert: true };
const ASPECT = L.halfW / L.halfH;

// ---------- 侧 ----------
const SIDES = CFG.sides || {};
const sideA = { name: 'A', ...(SIDES.a || SIDES.left || SIDES.top || {}) };
const sideB = { name: 'B', ...(SIDES.b || SIDES.right || SIDES.bottom || {}) };
sideA.src = resolveSrc(sideA.src);
sideB.src = resolveSrc(sideB.src);
const DIMS = { a: probe(sideA.src), b: probe(sideB.src) };

// crop 规划：显式 [x,y,w,h] 优先；否则按目标半幅比例取最大内接（居中、顶部对齐）
const planCrop = (sideKey, spec) => {
  const { w: sw, h: sh } = DIMS[sideKey];
  if (Array.isArray(spec.crop) && spec.crop.length === 4) {
    const [x, y, cw, ch] = spec.crop;
    return { x, y, cw, ch };
  }
  let ch = sh, cw = Math.round(sh * ASPECT / 2) * 2;
  if (cw > sw) { cw = Math.round(sw / 2) * 2; ch = Math.round(sw / ASPECT / 2) * 2; }
  const cx = spec.cropX != null ? Math.max(0, Math.min(sw - cw, spec.cropX)) : Math.round((sw - cw) / 2);
  const cy = spec.cropY != null ? Math.max(0, Math.min(sh - ch, spec.cropY)) : 0;
  return { x: cx, y: cy, cw, ch };
};

// ---------- ASS ----------
// 颜色：支持 'FFC850'（RGB 十六进制，自动转 BGR）或 { bgr: '50C8FF' }
const bgr = c => {
  if (!c) return 'FFFFFF';
  const s = String(c).replace('#', '').toUpperCase();
  if (s.length !== 6) return s;
  return s.slice(4, 6) + s.slice(2, 4) + s.slice(0, 2);
};
const C_A = bgr(sideA.color || 'FFC850');
const C_B = bgr(sideB.color || 'FF6B5A');
const C_G = bgr(CFG.gray || 'C8B890');

const ts = s => `0:${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(2).padStart(5, '0')}`;
const dlg = (t0, t1, txt, o) => {
  const { size = 40, color = 'FFFFFF', x = 40, y = 60, an = 7 } = o;
  return `Dialogue: 0,${ts(t0)},${ts(t1)},N,,0,0,0,,{\\an${an}\\pos(${x},${y})\\fs${size}\\1c&H${color}&\\bord1.6\\3c&H000000&\\3a&H50&}${txt}`;
};
const ASS_HEAD = sz => `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: N,${CFG.font || 'Microsoft YaHei'},${sz},&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,1.6,0,7,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

// 对位段标签坐标（按版式自动换算）
const labelSlot = which => LAYOUT === 'tb'
  ? { x: 40, y: which === 'a' ? 56 : 56 + L.halfH }
  : { x: which === 'a' ? 40 : L.halfW + 44, y: 60 };
const packSlot = which => LAYOUT === 'tb'
  ? { x: 44, y: (which === 'a' ? 56 : 56 + L.halfH) + 52 }
  : { x: (which === 'a' ? 40 : L.halfW + 44) + 4, y: 112 };

// ---------- 渲染：对位段 ----------
const segs = [];
const report = [];
const ENC = `-c:v libx264 -preset fast -crf ${MID} -an -pix_fmt yuv420p`;

const renderPair = (p, i) => {
  const dur = p.dur ?? CFG.pairDur ?? 3.2;
  const tag = p.tag || {};
  const id = String(i + 1).padStart(2, '0');
  if (tag.a || tag.b) {
    const lines = [dlg(0.05, dur, tag.a || '', { size: p.tagSize || 42, color: C_A, ...labelSlot('a') }),
      dlg(0.05, dur, sideA.pack || sideA.name, { size: 24, color: C_G, ...packSlot('a') }),
      dlg(0.05, dur, tag.b || '', { size: p.tagSize || 42, color: C_B, ...labelSlot('b') }),
      dlg(0.05, dur, sideB.pack || sideB.name, { size: 24, color: C_G, ...packSlot('b') })];
    writeFileSync(join(BUILD, `ass_${id}.ass`), ASS_HEAD(p.tagSize || 42) + '\n' + lines.join('\n'), 'utf8');
  }
  const ca = planCrop('a', p.a || {}), cb = planCrop('b', p.b || {});
  const chain = (idx, c) => `[${idx}:v]trim=duration=${dur},setpts=PTS-STARTPTS,crop=${c.cw}:${c.ch}:${c.x}:${c.y},scale=${L.halfW}:${L.halfH}:flags=lanczos,setsar=1`;
  const div = LAYOUT === 'tb'
    ? `drawbox=x=0:y=${L.halfH - Math.floor(DIV / 2)}:w=${W}:h=${DIV}:color=black:t=fill`
    : `drawbox=x=${L.halfW - Math.floor(DIV / 2)}:y=0:w=${DIV}:h=${H}:color=black:t=fill`;
  const ass = (tag.a || tag.b) ? `,ass=ass_${id}.ass` : '';
  run([
    j(FF), '-y',
    '-ss', String(p.a?.t ?? 0), '-i', j(sideA.src),
    '-ss', String(p.b?.t ?? 0), '-i', j(sideB.src),
    '-filter_complex', `${chain(0, ca)}[x];${chain(1, cb)}[y];[x][y]${L.stack},${div}${ass},format=yuv420p[v]`,
    '-map', '[v]', ENC, j(join(BUILD, `seg_${id}.mp4`)),
  ].join(' '));
  segs.push(`seg_${id}.mp4`);
  const fmtT = s => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
  report.push(`  组${i + 1} ${fmtT(i * dur)} → ${tag.a || '-'} / ${tag.b || '-'}  [${cr(p.a)} | ${cr(p.b)}]`);
};
const cr = s => s?.cropX != null ? `x=${s.cropX}` : (Array.isArray(s?.crop) ? `crop=${s.crop.slice(2).join('x')}` : 'center');

// ---------- 片头卡 ----------
const HEAD = CFG.head;
let headDur = 0;
if (HEAD) {
  headDur = HEAD.dur ?? 2;
  const y0 = LAYOUT === 'tb' ? Math.round(H * 0.42) : 460;
  const cxA = LAYOUT === 'tb' ? W / 2 : L.halfW / 2;
  const cxB = LAYOUT === 'tb' ? W / 2 : L.halfW + L.halfW / 2;
  const yB = LAYOUT === 'tb' ? y0 + Math.round(L.halfH * 0.55) : y0;
  const lines = [
    dlg(0.1, headDur, HEAD.aTitle || '', { size: HEAD.titleSize || 60, color: C_A, x: cxA, y: LAYOUT === 'tb' ? y0 : y0, an: 5 }),
    HEAD.aSub ? dlg(0.1, headDur, HEAD.aSub, { size: 26, color: C_G, x: cxA, y: (LAYOUT === 'tb' ? y0 : y0) + 90, an: 5 }) : '',
    dlg(0.1, headDur, HEAD.bTitle || '', { size: HEAD.titleSize || 60, color: C_B, x: cxB, y: yB, an: 5 }),
    HEAD.bSub ? dlg(0.1, headDur, HEAD.bSub, { size: 26, color: C_G, x: cxB, y: yB + 90, an: 5 }) : '',
    HEAD.foot ? dlg(0.1, headDur, HEAD.foot, { size: 24, color: C_G, x: W / 2, y: H - 130, an: 5 }) : '',
  ].filter(Boolean);
  writeFileSync(join(BUILD, 'ass_head.ass'), ASS_HEAD(HEAD.titleSize || 60) + '\n' + lines.join('\n'), 'utf8');
  run(`${j(FF)} -y -f lavfi -i color=black:s=${W}x${H}:d=${headDur}:r=${FPS} -vf ass=ass_head.ass,format=yuv420p ${ENC} ${j(join(BUILD, 'seg_00.mp4'))}`);
  segs.push('seg_00.mp4');
}

// ---------- 对位段 ----------
(CFG.pairs || []).forEach(renderPair);

// ---------- 片尾对位 ----------
const TAIL = CFG.tail;
let tailDur = 0;
if (TAIL) {
  tailDur = TAIL.dur ?? 2.2;
  const ca = planCrop('a', TAIL.a || {});
  const tag = TAIL.tag || {};
  let lines = '';
  if (tag.a || tag.b) {
    lines = '\n' + [
      dlg(0.05, tailDur, tag.a || '', { size: TAIL.tagSize || 42, color: C_A, ...labelSlot('a') }),
      dlg(0.05, tailDur, tag.b || '', { size: TAIL.tagSize || 42, color: C_B, ...labelSlot('b') }),
    ].join('\n');
    writeFileSync(join(BUILD, 'ass_tail.ass'), ASS_HEAD(TAIL.tagSize || 42) + lines, 'utf8');
  }
  const aChain = `[0:v]trim=duration=${tailDur},setpts=PTS-STARTPTS,crop=${ca.cw}:${ca.ch}:${ca.x}:${ca.y},scale=${L.halfW}:${L.halfH}:flags=lanczos,setsar=1[a]`;
  const assF = (tag.a || tag.b) ? ',ass=ass_tail.ass' : '';
  if (TAIL.b?.src || TAIL.b?.t != null) {
    const cb = planCrop('b', TAIL.b);
    const bSrc = TAIL.b.src ? resolveSrc(TAIL.b.src) : sideB.src;
    run([
      j(FF), '-y', '-ss', String(TAIL.a?.t ?? 0), '-i', j(sideA.src), '-ss', String(TAIL.b?.t ?? 0), '-i', j(bSrc),
      '-filter_complex', `${aChain};[1:v]trim=duration=${tailDur},setpts=PTS-STARTPTS,crop=${cb.cw}:${cb.ch}:${cb.x}:${cb.y},scale=${L.halfW}:${L.halfH}:flags=lanczos,setsar=1[b];[a][b]${L.stack},format=yuv420p[v]`,
      '-map', '[v]', '-t', String(tailDur), ENC, j(join(BUILD, 'seg_tail.mp4')),
    ].join(' '));
  } else {
    // B 侧纯黑（-t 硬限制：无限 lavfi 源 + -shortest 会挂起，坑35）
    run([
      j(FF), '-y', '-ss', String(TAIL.a?.t ?? 0), '-i', j(sideA.src),
      '-f', 'lavfi', '-i', `color=black:s=${L.halfW}x${L.halfH}:r=${FPS}`,
      '-filter_complex', `${aChain};[a][1:v]${L.stack},format=yuv420p[v]`,
      '-map', '[v]', '-t', String(tailDur), ENC, j(join(BUILD, 'seg_tail.mp4')),
    ].join(' '));
  }
  segs.push('seg_tail.mp4');
}

// ---------- 拼接 ----------
const total = headDur + (CFG.pairs || []).reduce((s, p) => s + (p.dur ?? CFG.pairDur ?? 3.2), 0) + tailDur;
writeFileSync(join(BUILD, 'concat.txt'), segs.map(s => `file '${join(BUILD, s).replace(/\\/g, '/')}'`).join('\n'), 'utf8');
const silent = join(BUILD, 'vs_silent.mp4');
run(`${j(FF)} -y -f concat -safe 0 -i ${j(join(BUILD, 'concat.txt'))} -c copy ${j(silent)}`);

// ---------- BGM ----------
const BGM = CFG.bgm;
if (BGM) {
  const bgmSrc = resolveSrc(BGM.src);
  const fade = BGM.fadeOut ?? 1.5;
  run([
    j(FF), '-y',
    '-i', j(silent),
    '-ss', String(BGM.start ?? 0), '-t', String(total + 0.5), '-i', j(bgmSrc),
    '-map', '0:v', '-map', '1:a',
    '-af', `afade=t=out:st=${(total - fade).toFixed(2)}:d=${fade}`,
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest',
    '-movflags', '+faststart', j(OUT),
  ].join(' '));
} else {
  run(`${j(FF)} -y -i ${j(silent)} -c:v copy -an -movflags +faststart ${j(OUT)}`);
}

console.log('版式: ' + LAYOUT + '  ' + W + 'x' + H + '（每侧 ' + L.halfW + 'x' + L.halfH + '）');
if (report.length) console.log('对位表:\n' + report.join('\n'));
console.log(`总时长 ${total.toFixed(2)}s → ${OUT}`);
console.log('完成');
