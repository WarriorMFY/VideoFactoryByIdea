#!/usr/bin/env node
/**
 * make_vertical.mjs — 把 16:9 正片做成 9:16 竖屏版（B 站竖屏 / 抖音 / 视频号通用）
 *
 * 为什么这样做，而不是"直接裁成竖屏"：
 *   · 课程类口播的内容都在画面中部，硬裁会切掉主体；裁切还会把横向的字幕挤出画面；
 *   · 主流做法是「模糊铺底 + 居中正片 + 竖屏字幕」，观众在竖屏信息流里能看到完整画面；
 *   · 字幕必须重排（字号更大、行宽更窄、位置更高），所以 ASS 要按 1080x1920 重新生成，
 *     不能直接复用 16:9 的 ASS（那套 PlayResY=720，搬过来会字小且贴底）。
 *
 * 实现：一次 ffmpeg 滤镜图完成，不产生中间文件
 *   [bg] 原片放大铺满 → 裁到 1080x1920 → gblur  → 压暗（避免抢主体）
 *   [fg] 原片等比缩到宽 1080（高度自适应）
 *   overlay 居中 → subtitles(纵向 ASS) → 音量归一 + 淡入淡出
 *
 * 用法：
 *   node Tool/ops/make_vertical.mjs --video <clean16x9.mp4> --ass <vertical.ass> --out <dir>
 *        [--w 1080] [--h 1920] [--blur 28] [--dim 0.12] [--crf 20] [--lufs -16]
 * 输出：<out>/final_9x16.mp4（H.264 / yuv420p / CFR 30 / AAC 48k / 目标响度）
 */
import fs from 'node:fs';
import path from 'node:path';
import { ffmpeg, durationOf, ffprobeJson, ROOT } from '../lib/ff.mjs';

const args = process.argv.slice(2);
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
if (!getOpt('--video', '')) { console.error('必须给 --video <clean16x9.mp4>'); process.exit(2); }
const VIDEO = path.resolve(ROOT, getOpt('--video', ''));
const OUTDIR = path.resolve(ROOT, getOpt('--out', 'Workspace/deliverables/vertical'));
const ASS = getOpt('--ass', '') ? path.resolve(ROOT, getOpt('--ass', '')) : '';
const W = Number(getOpt('--w', 1080));
const H = Number(getOpt('--h', 1920));
const BLUR = Number(getOpt('--blur', 28));
const DIM = Number(getOpt('--dim', 0.12));           // 背景压暗幅度（0–0.3）
const CRF = Number(getOpt('--crf', 20));
const LUFS = getOpt('--lufs', '-16');
const TITLE = getOpt('--title', '');            // 顶部标题（竖屏上方留白正好用）
const TITLE_SIZE = Number(getOpt('--title-size', 0)); // 0 = 按 H 比例自动（H*0.042）
if (!fs.existsSync(VIDEO)) { console.error('视频不存在:', VIDEO); process.exit(1); }
if (ASS && !fs.existsSync(ASS)) { console.error('ASS 不存在:', ASS); process.exit(1); }
fs.mkdirSync(OUTDIR, { recursive: true });

const probe = ffprobeJson(['-show_format', '-show_streams', VIDEO], path.join(OUTDIR, '_probe.log'));
const dur = Number(probe.format?.duration || 0);
const hasAudio = (probe.streams || []).some((s) => s.codec_type === 'audio');
if (!dur) { console.error('拿不到时长'); process.exit(1); }

// 滤镜图：背景（铺满+模糊+压暗） + 前景（等比缩放到 W 宽） + 可选字幕
const parts = [
  `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},gblur=sigma=${BLUR},eq=brightness=-${DIM}[bg]`,
  `[0:v]scale=${W}:-2:flags=lanczos[fg]`,
  `[bg][fg]overlay=(W-w)/2:(H-h)/2:format=auto[base]`,
];
if (ASS) {
  // ASS 路径要被 ffmpeg 的滤镜语法转义：反斜杠→/、冒号→\:
  const p = ASS.replace(/\\/g, '/').replace(/:/g, '\\:');
  parts.push(`[base]ass='${p}'[vsub]`);
} else {
  parts.push('[base]null[vsub]');
}
// 顶部标题（可选）：竖屏上方留白正好放标题，避免"上面一大块模糊背景"看着空
if (TITLE) {
  const esc = String(TITLE)
    .replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'")
    .replace(/,/g, '\\,').replace(/%/g, '\\%');
  const fs2 = TITLE_SIZE > 0 ? TITLE_SIZE : Math.round(H * 0.042);
  parts.push(`[vsub]drawtext=font=SimHei:text='${esc}':fontsize=${fs2}:fontcolor=white:borderw=3:bordercolor=black@0.55:x=(w-text_w)/2:y=${Math.round(H * 0.055)}[v]`);
} else {
  parts.push('[vsub]null[v]');
}
const fade = Math.min(0.6, dur / 8);
const af = hasAudio
  ? [`loudnorm=I=${LUFS}:TP=-1.5:LRA=11`, `afade=t=in:st=0:d=${fade.toFixed(2)}`, `afade=t=out:st=${(dur - 0.8).toFixed(2)}:d=0.8`]
  : [];

const outFile = path.join(OUTDIR, 'final_9x16.mp4');
const ffArgs = [
  '-hide_banner', '-loglevel', 'error', '-y', '-i', VIDEO,
  '-filter_complex', parts.join(';'),
  '-map', '[v]',
  ...(hasAudio ? ['-map', '0:a', '-af', af.join(',')] : []),
  '-c:v', 'libx264', '-preset', 'medium', '-crf', String(CRF), '-pix_fmt', 'yuv420p', '-r', '30', '-fps_mode', 'cfr',
  ...(hasAudio ? ['-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2'] : []),
  '-movflags', '+faststart', '-t', String(dur), outFile,
];
const t0 = Date.now();
const r = ffmpeg(ffArgs, path.join(OUTDIR, '_render.log'));
if (r.status !== 0) {
  console.error('[vertical] 渲染失败：\n' + r.text.split('\n').slice(-8).join('\n'));
  process.exit(1);
}
const outDur = durationOf(outFile, path.join(OUTDIR, '_dur.log'));
const sizeMb = fs.statSync(outFile).size / 1048576;
console.log(`[vertical] ${path.relative(ROOT, outFile)} ${W}x${H} ${outDur.toFixed(2)}s ${sizeMb.toFixed(1)}MB ${((Date.now() - t0) / 1000).toFixed(1)}s${ASS ? '（已烧竖屏字幕）' : '（无字幕）'}`);
