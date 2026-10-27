#!/usr/bin/env node
/**
 * make_bench_source.mjs — 生成"带已知真值"的合成测试素材（用于客观验收剪辑决策）
 *
 * 为什么需要合成素材：真实素材没有逐帧人工标注的真值，无法量化判断
 * "该切的段落有没有切掉 / 不该切的有没有误切"。合成素材的时间轴由脚本定义，
 * 因此真值（ground truth）= 本文件里 sections 的设计意图，可机读。
 *
 * 时间轴（42s，1280x720@30，H.264 + AAC）：
 *   A  0- 8s  画面运动 + 音调 440Hz        -> 应保留
 *   B  8-14s  画面运动 + 音调 660Hz        -> 应保留
 *   C 14-20s  纯黑 + 静音                  -> 应切除（black）
 *   D 20-24s  静止画面(冻帧) + 静音        -> 应切除（freeze ∧ silence）
 *   E 24-30s  画面运动 + 音调 440Hz        -> 应保留
 *   F 30-36s  静止画面(冻帧) + 音调 880Hz  -> 应保留（有人声/音轨，等价"静态镜头但有声音"，典型口播画面）
 *   G 36-42s  画面运动 + 静音              -> 应保留（有画面信息，等价无对白的动作镜头）
 *
 * 真值 kept = [0,14] ∪ [24,42]（32s），dropped = [14,24]（10s）。
 * 输出：<out>/source.mp4 与 <out>/ground_truth.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { ffmpeg, durationOf, hasFilter, ROOT } from '../lib/ff.mjs';

const outDir = process.argv[2] || path.join(ROOT, 'History', 'bench', 'synth');
fs.mkdirSync(outDir, { recursive: true });

const W = 1280, H = 720, R = 30, SR = 48000;

// hasDrawtext：有字体文件 + ffmpeg 编入了 drawtext 才叠时间标签，否则仅靠图案/色调区分
const hasDrawtext = fs.existsSync('C:/Windows/Fonts/arialbd.ttf') && hasFilter('drawtext', path.join(outDir, 'filters.log'));
const font = 'C\\:/Windows/Fonts/arialbd.ttf';

/** 运动画面：图案 + 色调偏移 + 可选标签 */
function motion(name, dur, hue, tag) {
  let v = `testsrc2=s=${W}x${H}:r=${R}:d=${dur}`;
  if (name === 'b') v = `testsrc=s=${W}x${H}:r=${R}:d=${dur}`;
  v += `,hue=h=${hue}`;
  if (hasDrawtext) {
    v += `,drawtext=fontfile=${font}:text='${tag}':fontsize=110:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=18:x=40:y=40`;
    v += `,drawtext=fontfile=${font}:text='%{pts\\:hms}':fontsize=56:fontcolor=yellow:x=40:y=${H - 110}:box=1:boxcolor=black@0.55:boxborderw=12`;
  }
  return v;
}
/** 静止画面（冻帧） */
function still(color, dur, tag) {
  let v = `color=c=${color}:s=${W}x${H}:r=${R}:d=${dur}`;
  if (hasDrawtext) {
    v += `,drawtext=fontfile=${font}:text='${tag}':fontsize=110:fontcolor=white:box=1:boxcolor=black@0.35:boxborderw=18:x=40:y=40`;
    v += `,drawtext=fontfile=${font}:text='%{pts\\:hms}':fontsize=56:fontcolor=yellow:x=40:y=${H - 110}`;
  }
  return v;
}
function tone(freq, dur) {
  return `sine=frequency=${freq}:sample_rate=${SR}:duration=${dur},aformat=sample_rates=${SR}:channel_layouts=stereo`;
}
function silence(dur) {
  return `anullsrc=r=${SR}:cl=stereo:d=${dur},aformat=sample_rates=${SR}:channel_layouts=stereo`;
}

const sections = [
  { id: 'A', start: 0, end: 8, v: motion('a', 8, 0, 'A motion 440Hz'), a: tone(440, 8), expect: 'keep', why: '画面运动+音轨' },
  { id: 'B', start: 8, end: 14, v: motion('b', 6, 90, 'B motion 660Hz'), a: tone(660, 6), expect: 'keep', why: '画面运动+音轨' },
  { id: 'C', start: 14, end: 20, v: still('black', 6, 'C BLACK silent'), a: silence(6), expect: 'drop', why: '纯黑+静音' },
  { id: 'D', start: 20, end: 24, v: still('0x233043', 4, 'D FROZEN silent'), a: silence(4), expect: 'drop', why: '冻帧+静音（两路都无信息）' },
  { id: 'E', start: 24, end: 30, v: motion('a', 6, 180, 'E motion 440Hz'), a: tone(440, 6), expect: 'keep', why: '画面运动+音轨' },
  { id: 'F', start: 30, end: 36, v: still('0x304030', 6, 'F FROZEN 880Hz'), a: tone(880, 6), expect: 'keep', why: '冻帧但有音轨（口播类镜头），不得误切' },
  { id: 'G', start: 36, end: 42, v: motion('b', 6, 270, 'G motion silent'), a: silence(6), expect: 'keep', why: '静音但有画面信息（动作镜头），不得误切' },
];

const parts = [];
sections.forEach((s, i) => {
  parts.push(`${s.v}[v${i}]`);
  parts.push(`${s.a}[a${i}]`);
});
const pairs = sections.map((_, i) => `[v${i}][a${i}]`).join('');
const fc = [
  ...parts,
  `${pairs}concat=n=${sections.length}:v=1:a=1[vout][aout]`,
  `[vout]format=yuv420p[vf]`,
  `[aout]aformat=sample_rates=${SR}:channel_layouts=stereo[af]`,
].join(';');

const outFile = path.join(outDir, 'source.mp4');
const args = [
  '-y', '-hide_banner', '-loglevel', 'error',
  '-filter_complex', fc,
  '-map', '[vf]', '-map', '[af]',
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '192k', '-ar', String(SR), '-ac', '2',
  '-movflags', '+faststart',
  outFile,
];
console.log('[bench] drawtext =', hasDrawtext);
console.log('[bench] ffmpeg ->', outFile);
const t0 = Date.now();
const r = ffmpeg(args, path.join(outDir, 'make.log'));
if (r.status !== 0) {
  console.error(String(r.text).split('\n').slice(-25).join('\n'));
  process.exit(1);
}
const dur = durationOf(outFile, path.join(outDir, 'probe.log'));
console.log(`[bench] ok ${(Date.now() - t0)}ms duration=${dur.toFixed(2)}s size=${(fs.statSync(outFile).size / 1048576).toFixed(2)}MB`);

const gt = {
  generated_at: new Date().toISOString(),
  source: 'Tool/make_bench_source.mjs',
  duration_s: dur,
  spec_note: '真值 = 本合成素材的设计意图（可接受剪辑行为规格），不是人工剪辑师标注。',
  sections: sections.map((s) => ({ id: s.id, start: s.start, end: s.end, expect: s.expect, why: s.why })),
  kept: sections.filter((s) => s.expect === 'keep').map((s) => [s.start, s.end]),
  dropped: sections.filter((s) => s.expect === 'drop').map((s) => [s.start, s.end]),
};
fs.writeFileSync(path.join(outDir, 'ground_truth.json'), JSON.stringify(gt, null, 2));
console.log('[bench] ground_truth.json ->', path.join(outDir, 'ground_truth.json'));
