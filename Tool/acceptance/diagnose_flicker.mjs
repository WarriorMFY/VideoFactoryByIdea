#!/usr/bin/env node
/**
 * diagnose_flicker.mjs — 全片逐帧诊断字幕"抖动"（闪烁 / 高亮跳 / 位置跳）
 *
 * 抖动三类，观感都像"字幕在抖"，但根因与修法不同：
 *   1) 闪断：整句字幕在词与词之间消失几帧（事件之间有间隙）→ 英文行忽隐忽现；
 *   2) 高亮跳：应亮而未亮（高亮像素为 0），或同帧出现两个高亮词（重影）；
 *   3) 位置跳：字幕块上下移动（垂直边距随句子变化、换行宽度变化）。
 *
 * 判定口径（工程上贴合人眼）：
 *   · 单帧（1/30 s ≈ 33ms）缺失人眼几乎不可察，属抽帧/事件边界的量化误差 → 只报告，不判失败；
 *   · **连续 ≥2 帧**缺失才算"闪断/高亮缺失"；
 *   · 位置跳：相邻可见帧的白字质心 y 位移 > 4px。
 *
 * 用法：
 *   node Tool/acceptance/diagnose_flicker.mjs <final.mp4> <karaoke.ass> [--hl 33E6C8] [--json out.json]
 *   node Tool/acceptance/diagnose_flicker.mjs <mp4> <ass> --window 4.2,8.4      # 只看某段
 *   node Tool/acceptance/diagnose_flicker.mjs <mp4> <ass> --sentence           # 按句输出明细
 */
import fs from 'node:fs';
import path from 'node:path';
import { ffmpeg, ffprobeJson, ROOT } from '../lib/ff.mjs';

const args = process.argv.slice(2);
if (args.length < 2) { console.error('用法: node Tool/acceptance/diagnose_flicker.mjs <final.mp4> <karaoke.ass> [--window A,B] [--json out.json]'); process.exit(2); }
const VIDEO = path.resolve(args[0]);
const ASS = path.resolve(args[1]);
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const JSON_OUT = getOpt('--json', '');
const HL = getOpt('--hl', '33E6C8');
const WIN = getOpt('--window', '');
const SHOW_SENTENCE = args.includes('--sentence');
const WORK = path.join(path.dirname(VIDEO), '.flicker_diag');
fs.mkdirSync(WORK, { recursive: true });

const toSec = (t) => { const m = t.match(/^(\d+):(\d+):(\d+)\.(\d+)$/); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] + Number(`0.${m[4]}`) : null; };
const events = fs.readFileSync(ASS, 'utf8').split(/\r?\n/).filter((l) => l.startsWith('Dialogue:')).map((l) => {
  const p = l.slice(9).split(',');
  return { layer: +p[0], start: toSec(p[1]), end: toSec(p[2]), style: p[3].trim(), text: p.slice(9).join(',') };
});
const EN = events.filter((e) => e.style === 'EN').sort((x, y) => x.start - y.start);
const ZH = events.filter((e) => e.style === 'ZH').sort((x, y) => x.start - y.start);

const pr = ffprobeJson(['-show_format', '-show_streams', VIDEO], path.join(WORK, 'probe.log'));
const v = (pr.streams || []).find((s) => s.codec_type === 'video');
const W = v.width, H = v.height;
const fr2 = String(v.r_frame_rate).split('/').map(Number);
const FPS = fr2[1] ? fr2[0] / fr2[1] : fr2[0];
const DUR = Number(pr.format?.duration || 0);

// 只解码"英文行"所在的带域（抖动判据对缩放不敏感，但 IO 降 90%+）。
// 带域高度要**按 ASS 样式精确算**：EN 的 MarginV + 最大行数×字号；
// 否则默认取底部 28% 会把中文行的下半部分也圈进来，质心随中文行数变化 → 误判"位置跳"（实测 F 用例 19px 误报）。
const styleLine = fs.readFileSync(ASS, 'utf8').split(/\r?\n/).find((l) => /^Style:\s*EN,/i.test(l)) || '';
const sf = styleLine.split(',');
const enFontSize = Number(sf[2] || 36);
const enMarginV = Number(sf[21] || 26);
const maxEnLines = Math.max(1, ...EN.map((e) => (e.text.match(/\\N/g) || []).length + 1));
const bandH = Math.min(H, Math.ceil(enMarginV + maxEnLines * enFontSize * 1.35 + 10));
const bandY = H - bandH;
const SW = 640, SH = Math.max(2, Math.round(bandH * (SW / W)));
const raw = path.join(WORK, 'band.rgb');
let A = 0, B = DUR;
if (WIN) { const [x, y] = WIN.split(',').map(Number); A = x; B = y; }
const SEG = Math.max(0.2, B - A);

// 关键：诊断"字幕层"抖动必须与画面解耦。
// 直接在成片上扫像素会被画面亮部干扰（实测 BBB 草地/白云被当成白字，白字中位数被抬到 2312px，
// 阈值变成 809px，短字幕行被误判成"闪断"）。默认把同一 ASS 烧到纯黑底上再测；--use-video 可保留成片。
const USE_VIDEO = args.includes('--use-video');
let PROBE = VIDEO;
if (!USE_VIDEO) {
  PROBE = path.join(WORK, 'subonly.mp4');
  const esc = ASS.replace(/\\/g, '/').replace(/:/g, '\\:');
  const g = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `color=c=black:s=${W}x${H}:r=${FPS}`,
    '-t', String(DUR), '-vf', `subtitles='${esc}'`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', PROBE], path.join(WORK, 'subonly.log'));
  if (g.status !== 0) { console.error('字幕层渲染失败:', g.text.split('\n').slice(-6).join('\n')); process.exit(1); }
}
console.log(`[diag] 扫描 ${A.toFixed(2)}–${B.toFixed(2)}s @${FPS}fps（EN 带 ${SW}x${SH}，${USE_VIDEO ? '成片画面' : '隔离字幕层'}）…`);
const rr = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(A), '-t', String(SEG), '-i', PROBE,
  '-vf', `crop=${W}:${bandH}:0:${bandY},scale=${SW}:${SH}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', raw], path.join(WORK, 'decode.log'));
if (rr.status !== 0) { console.error('解码失败:', rr.text.split('\n').slice(-6).join('\n')); process.exit(1); }
const buf = fs.readFileSync(raw);
const frameSize = SW * SH * 3;
const nFrames = Math.floor(buf.length / frameSize);
fs.rmSync(raw, { force: true });

const hlT = [parseInt(HL.slice(0, 2), 16), parseInt(HL.slice(2, 4), 16), parseInt(HL.slice(4, 6), 16)];
const frames = [];
for (let f = 0; f < nFrames; f++) {
  const off = f * frameSize, t = A + f / FPS;
  let white = 0, hl = 0, sumY = 0, sumX = 0, minY = SH, maxY = -1;
  for (let y = 0; y < SH; y++) {
    const row = off + y * SW * 3;
    for (let x = 0; x < SW; x++) {
      const i = row + x * 3, R = buf[i], G = buf[i + 1], Bb = buf[i + 2];
      const mx = Math.max(R, G, Bb), mn = Math.min(R, G, Bb);
      const isWhite = mx > 205 && mx - mn < 42;
      const isHl = Math.abs(R - hlT[0]) <= 28 && Math.abs(G - hlT[1]) <= 28 && Math.abs(Bb - hlT[2]) <= 28;
      if (isWhite) { white++; sumY += y; }
      if (isHl) { hl++; sumX += x; }
      // 文字块边界按"白 + 高亮"一起算：高亮词由白变青会让纯白像素减少，
      // 若只用白字算边界，最后一行刚好被上色时 botY 会假性上移（实测误报 14–18px 位置跳）。
      if (isWhite || isHl) { if (y < minY) minY = y; if (y > maxY) maxY = y; }
    }
  }
  // whiteY = 白字质心（信息用）；topY/botY = 文字块上下边界（判位置用——质心会随"哪个词被上色"漂移，边界不会）
  frames.push({ t, white, hl, whiteY: white ? sumY / white : null, topY: maxY >= 0 ? minY : null, botY: maxY >= 0 ? maxY : null, hlX: hl ? sumX / hl : null });
}

// "应显示"的判据用**中文整句区间**（ZH 事件）而不是英文事件的并集：
// 若用英文事件并集，词与词之间的空档会被排除在统计之外，正好把"英文行在空档里消失"这个抖源漏掉（旧版就是这么漏的）。
const cover = frames.map((f) => ZH.length
  ? ZH.some((z) => f.t >= z.start && f.t < z.end)
  : EN.some((e) => f.t >= e.start && f.t < e.end));
const whites = frames.filter((f, i) => cover[i]).map((f) => f.white).sort((x, y) => x - y);
const medWhite = whites.length ? whites[Math.floor(whites.length / 2)] : 0;
// 隔离字幕层是纯黑底，任何一行字幕都有几百个白像素 → 绝对阈值最稳。
// 按中位数比例会在"短句 vs 长句"之间失衡（实测 F 用例短句 i'm searching for 被误判闪断 20 帧）。
const hideThr = USE_VIDEO ? Math.max(40, medWhite * 0.35) : 25;

function analyzeRange(t0, t1) {
  const inRange = [];
  frames.forEach((f, i) => { if (f.t >= t0 && f.t < t1 && cover[i]) inRange.push(f); });
  const hiddenRuns = [], hlRuns = [];
  let curH = 0, curX = 0, yJumps = 0, maxY = 0, prev = null; const jumpLog = [];
  for (const f of inRange) {
    const hidden = f.white <= hideThr;
    const noHl = f.hl < 8;
    if (hidden) curH++; else { if (curH) hiddenRuns.push(curH); curH = 0; }
    if (noHl) curX++; else { if (curX) hlRuns.push(curX); curX = 0; }
    // 位置跳用"文字块上下边界"的位移；白字质心会随上色词变化漂移（那不是视觉抖动）
    if (prev && !hidden && prev.topY !== null && f.topY !== null) {
      const d = Math.max(Math.abs(f.topY - prev.topY), Math.abs(f.botY - prev.botY));
      if (d > 4) { yJumps++; if (yJumps <= 8) jumpLog.push({ t: +f.t.toFixed(2), from: prev.topY, to: f.topY, d: +d.toFixed(1) }); }
      maxY = Math.max(maxY, d);
    }
    prev = hidden ? null : f;
  }
  if (curH) hiddenRuns.push(curH);
  if (curX) hlRuns.push(curX);
  return {
    frames: inRange.length,
    hidden_frames: hiddenRuns.reduce((p, q) => p + q, 0), hidden_runs: hiddenRuns, hidden_multi: hiddenRuns.filter((n) => n >= 2).length,
    hl_zero_frames: hlRuns.reduce((p, q) => p + q, 0), hl_zero_runs: hlRuns, hl_multi: hlRuns.filter((n) => n >= 2).length,
    y_jumps: yJumps, max_y_jump: Number(maxY.toFixed(1)), jump_log: jumpLog,
  };
}

const global = analyzeRange(A, B);
// 逐句统计始终计算："句内"没有位置跳/高亮缺失才算不抖；跨句换行行数变化属正常排版，不计入。
const perSentence = ZH.map((z, i) => ({ idx: i, start: Number(z.start.toFixed(2)), end: Number(z.end.toFixed(2)), ...analyzeRange(Math.max(A, z.start), Math.min(B, z.end)) }));
const sumBy = (k) => perSentence.reduce((p, s) => p + (s[k] || 0), 0);
const pass = {
  no_blink: global.hidden_multi === 0,
  no_hl_missing: sumBy('hl_multi') === 0,
  no_position_jump: sumBy('y_jumps') === 0,
};
const result = {
  checked_at: new Date().toISOString(), video: VIDEO, ass: ASS, hl: HL,
  mode: USE_VIDEO ? 'on-video' : 'subtitle-only',
  window: { start: Number(A.toFixed(2)), end: Number(B.toFixed(2)), frames: nFrames, fps: FPS },
  criteria: { hide_threshold_px: hideThr, median_white_px: medWhite, min_consecutive_frames: 2, y_jump_px: 4 },
  metrics: global, pass, per_sentence: perSentence,
};
result.verdict = Object.values(pass).every(Boolean) ? 'PASS' : 'FAIL';
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(result, null, 2));

console.log(`\n=== 抖动诊断: ${result.verdict} ===`);
console.log(`覆盖帧 ${global.frames}　闪断：${global.hidden_frames} 帧 / 连续组 ${global.hidden_multi}（明细 ${JSON.stringify(global.hidden_runs)}）`);
console.log(`高亮缺失：${global.hl_zero_frames} 帧 / 连续组 ${global.hl_multi}（明细 ${JSON.stringify(global.hl_zero_runs)}）`);
console.log(`位置跳：${global.y_jumps} 次，最大 ${global.max_y_jump}px`);
console.log(`判据：白字中位数 ${medWhite}px，隐藏阈值 ${hideThr.toFixed(0)}；单帧缺失只报告不判失败`);
for (const s of perSentence) console.log(`  句 ${s.start}–${s.end}s：闪断组 ${s.hidden_multi}、高亮缺失组 ${s.hl_multi}、位置跳 ${s.y_jumps}`);
process.exit(result.verdict === 'PASS' ? 0 : 1);
