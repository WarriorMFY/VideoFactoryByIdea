#!/usr/bin/env node
/**
 * make_cover.mjs v2 — 生成封面（v2 扩展：大字号/纯色底/嵌入帧/双格拆分/多行标题）
 *
 * 量化规范见 History/bench/cover_spec.md（S1–S6）。为什么自建脚本：
 * CJK 文本在 ffmpeg drawtext 里易因字体/转义出错（本仓库踩过 fontfile 静默回落成方块），
 * 统一走 font=SimHei + 自建 fonts.conf（见 lib/ff.mjs），文案当参数传，不拼进命令行字符串。
 *
 * 用法：node Tool/ops/make_cover.mjs --video src.mp4 --out cover.jpg
 *
 * 画面：
 *   --at 2.0            取帧时间（秒），默认 2
 *   --w 1280 --h 720    输出尺寸（4:3 用 --w 960 --h 720）
 *   --dim 0.35          全帧压暗透明度（0=不压，默认 0）
 *   --bg black          纯色底模式：用纯色替代视频帧作背景（A 版黑底黄字用）
 *   --inset 0.58        配合 --bg：视频帧缩放到 0.58*W 宽、白边、嵌入上部（B 版用）
 *   --split "8,26"      双格模式：两帧左右各半拼合（C 版对比用），值为两个取帧秒数
 * 文字（S1/S2/S5/S6）：
 *   --title "剪辑提速|5 招"   主标题，| 分行（S6：每行 ≤6 字、最多 2 行；S1：总数 ≤10 字）
 *   --fs 0.20           主标题字号 = 0.20*H（S1 要求 ≥0.18）
 *   --tcolor yellow     主标题颜色（S1：白/黄）
 *   --stroke 0.014      黑描边宽 = 0.014*H（720p 下 ≥10px，满足 S1 ≥8px）
 *   --titlebox 0.55     主标题+副标区域底部压暗条透明度（0=不用）
 *   --sub "每条都能立刻用"    副标一行 ≤14 字（S2）
 *   --tag "新手友好"    角标 ≤6 字，左上（S5：禁止自贬词）
 *   --tagcolor #E64980  角标底色
 *
 * 示例（loop13 WP3 三版，参数即规范）：
 *   A 大字冲击：--bg black --title "剪辑提速|5 招" --fs 0.20 --tcolor yellow --tag "新手友好"
 *   B 纯色底+嵌入帧：--bg "#0E2A3A" --inset 0.58 --title "少剪一半时间" --fs 0.19 --tcolor white --stroke 0.014 --tag "剪辑必看"
 *   C 双格+数字：--split "8,26" --title "5 招 · 38 秒讲完" --fs 0.18 --tcolor yellow --titlebox 0.55 --tag "照做就省时"
 */
import fs from 'node:fs';
import path from 'node:path';
import { ffmpeg, ROOT } from '../lib/ff.mjs';

const args = process.argv.slice(2);
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const VIDEO = path.resolve(ROOT, getOpt('--video', ''));
const OUT = path.resolve(ROOT, getOpt('--out', 'cover.jpg'));
const TITLE = getOpt('--title', '');
const SUB = getOpt('--sub', '');
const TAG = getOpt('--tag', '');
const AT = Number(getOpt('--at', 2));
const W = Number(getOpt('--w', 1280));
const H = Number(getOpt('--h', 720));
const FS = Number(getOpt('--fs', 0.085));
const TCOLOR = getOpt('--tcolor', 'white');
const STROKE = Number(getOpt('--stroke', 0.006));
const DIM = Number(getOpt('--dim', 0));
const BG = getOpt('--bg', '');
const INSET = Number(getOpt('--inset', 0));
const SPLIT = getOpt('--split', '');
const BOX = Number(getOpt('--titlebox', 0));
const TAGCOLOR = getOpt('--tagcolor', '#E64980');
if (!getOpt('--video', '')) { console.error('必须给 --video'); process.exit(2); }
if (!fs.existsSync(VIDEO)) { console.error('视频不存在:', VIDEO); process.exit(1); }

// drawtext 文本转义（filtergraph 解析）
const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/:/g, '\\:').replace(/%/g, '\\%');

// ---- 输入与基础链 ----
const inputs = [];
let chain = '';
if (SPLIT) {
  const [t1, t2] = SPLIT.split(',').map(Number);
  inputs.push('-ss', String(t1), '-i', VIDEO, '-ss', String(t2), '-i', VIDEO);
  const pw = Math.round(W / 2);
  chain += `[0:v]scale=${pw}:${H}:force_original_aspect_ratio=increase,crop=${pw}:${H}[pl];` +
           `[1:v]scale=${pw}:${H}:force_original_aspect_ratio=increase,crop=${pw}:${H}[pr];` +
           `[pl][pr]hstack=inputs=2[base];`;
} else if (BG) {
  inputs.push('-f', 'lavfi', '-i', `color=c=${BG}:s=${W}x${H}`);
  if (INSET > 0) {
    // 坑：lavfi color 主输入与「-ss 前置 seek 的视频流」在 -frames:v 1 下 pts 配不上，
    // overlay 首帧直接过、嵌入帧整块丢失（背景纯色、无报错）。
    // 修法：先把目标帧抽成单帧 jpg（pts 恒为 0），再作为独立输入叠加——必配对。
    const tmpFrame = OUT + '.ins_tmp.jpg';
    const rf = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(AT), '-i', VIDEO,
      '-frames:v', '1', '-update', '1', '-q:v', '2', tmpFrame],
      path.join(ROOT, 'History', 'runs', '_logs', 'cover_inset.log'));
    if (rf.status !== 0 || !fs.existsSync(tmpFrame)) { console.error('嵌入帧抽取失败 @' + AT); process.exit(1); }
    inputs.push('-i', tmpFrame);
    const iw = Math.round(W * INSET);
    // 16:9 源帧 → 等比缩放，白边描边，嵌入上部居中
    chain += `[1:v]scale=${iw}:-2,drawbox=x=0:y=0:w=iw:h=ih:color=white@0.9:t=6[ins];` +
             `[0:v][ins]overlay=x=(W-w)/2:y=${Math.round(H * 0.06)}[base];`;
  } else {
    chain += `[0:v]null[base];`;
  }
} else {
  inputs.push('-ss', String(AT), '-i', VIDEO);
  chain += `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}[base];`;
}

// ---- 压暗与标题底 ----
const texts = [];
if (DIM > 0) chain += `[base]drawbox=x=0:y=0:w=${W}:h=${H}:color=black@${DIM}:t=fill[base];`;
if (BOX > 0) chain += `[base]drawbox=x=0:y=${Math.round(H * 0.60)}:w=${W}:h=${H - Math.round(H * 0.60)}:color=black@${BOX}:t=fill[base];`;

// ---- 主标题（S6：| 分行，自下而上排）----
const lines = TITLE ? TITLE.split('|') : [];
if (lines.length > 2) { console.error('主标题最多 2 行（S6）'); process.exit(2); }
const F = Math.round(H * FS);
const strokeW = Math.max(3, Math.round(H * STROKE));
const LH = Math.round(F * 1.18);
if (lines.length) {
  const total = lines.length * LH;
  lines.forEach((ln, i) => {
    const y = Math.round(H * 0.88) - total + i * LH;
    texts.push(`drawtext=font=SimHei:text='${esc(ln)}':fontsize=${F}:fontcolor=${TCOLOR}:borderw=${strokeW}:bordercolor=black@0.85:x=(w-text_w)/2:y=${y}`);
  });
}
if (SUB) {
  texts.push(`drawtext=font=SimHei:text='${esc(SUB)}':fontsize=${Math.round(H * 0.042)}:fontcolor=#7FE9D5:borderw=2:bordercolor=black@0.7:x=(w-text_w)/2:y=${Math.round(H * 0.93)}`);
}
if (TAG) {
  texts.push(`drawtext=font=SimHei:text='${esc(TAG)}':fontsize=${Math.round(H * 0.04)}:fontcolor=white:box=1:boxcolor=${TAGCOLOR}@0.9:boxborderw=${Math.round(H * 0.016)}:x=${Math.round(W * 0.04)}:y=${Math.round(H * 0.045)}`);
}

const filter = chain + (texts.length ? `[base]` + texts.join(',') + `[vout]` : `[base]null[vout]`);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const logFile = path.join(ROOT, 'History', 'runs', '_logs', 'cover.log');
const r = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', ...inputs, '-filter_complex', filter,
  '-map', '[vout]', '-frames:v', '1', '-q:v', '2', OUT], logFile);
if (r.status !== 0) { console.error('封面生成失败:', (r.text || '').slice(-500)); process.exit(1); }
console.log(`[cover] ${W}x${H} → ${path.relative(ROOT, OUT)}  (${(fs.statSync(OUT).size / 1024).toFixed(0)}KB)`);
