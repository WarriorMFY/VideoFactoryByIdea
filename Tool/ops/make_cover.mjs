#!/usr/bin/env node
/**
 * make_cover.mjs — 生成市场用封面（标题 + 副标题 + 角标），画面取自成片素材
 *
 * 为什么单独一个脚本：封面是"点击率"的最大变量，必须能批量重做（换标题/换文案），
 * 而且 CJK 文本在 ffmpeg drawtext 里很容易因为字体/转义出错（本仓库踩过：fontfile 静默回落成方块）。
 * 所以统一走 `font=SimHei` + 自建 fonts.conf（见 lib/ff.mjs），并且把文案当作参数传，不拼进命令行字符串。
 *
 * 用法：node Tool/ops/make_cover.mjs --video src.mp4 --out cover.jpg
 *        [--title "5 个剪辑提速技巧"] [--sub "英文原声 · 中英双语字幕 · 逐词高亮"] [--tag "工厂样片"]
 *        [--at 2.0] [--w 1280] [--h 720]
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
if (!getOpt('--video', '')) { console.error('必须给 --video'); process.exit(2); }
if (!fs.existsSync(VIDEO)) { console.error('视频不存在:', VIDEO); process.exit(1); }

// drawtext 的文本里这些字符要转义（否则 filtergraph 解析失败）
const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/:/g, '\\:').replace(/%/g, '\\%');
const filters = [
  `scale=${W}:${H}:force_original_aspect_ratio=increase`,
  `crop=${W}:${H}`,
  // 底部压暗，保证文字可读
  `drawbox=x=0:y=${Math.round(H * 0.62)}:w=${W}:h=${H - Math.round(H * 0.62)}:color=black@0.55:t=fill`,
];
if (TITLE) {
  filters.push(`drawtext=font=SimHei:text='${esc(TITLE)}':fontsize=${Math.round(H * 0.085)}:fontcolor=white:borderw=3:bordercolor=black@0.6:x=(w-text_w)/2:y=${Math.round(H * 0.66)}`);
}
if (SUB) {
  filters.push(`drawtext=font=SimHei:text='${esc(SUB)}':fontsize=${Math.round(H * 0.042)}:fontcolor=#7FE9D5:x=(w-text_w)/2:y=${Math.round(H * 0.80)}`);
}
if (TAG) {
  filters.push(`drawtext=font=SimHei:text='${esc(TAG)}':fontsize=${Math.round(H * 0.036)}:fontcolor=white:box=1:boxcolor=#E64980@0.85:boxborderw=${Math.round(H * 0.014)}:x=${Math.round(W * 0.04)}:y=${Math.round(H * 0.04)}`);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
const logFile = path.join(ROOT, 'History', 'runs', '_logs', 'cover.log');
const r = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(AT), '-i', VIDEO, '-frames:v', '1',
  '-vf', filters.join(','), '-q:v', '2', OUT], logFile);
if (r.status !== 0) { console.error('封面生成失败:', (r.text || '').slice(-400)); process.exit(1); }
console.log(`[cover] ${W}x${H} → ${path.relative(ROOT, OUT)}  (${(fs.statSync(OUT).size / 1024).toFixed(0)}KB)`);
