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

// 自适应字号 + 换行：原来标题字号只按 H 算（H*0.085），竖屏 1080x1920 时会算成 163px、
// 9 个汉字宽约 1467px > 画面宽度 → 文字被裁到只剩中间几个字（小循环 12 实测踩到）。
// 规则：先按 H 比例给字号，超宽就等比缩；缩到下限还超宽就折成两行。
const estWidth = (s, fs) => [...String(s)].reduce((a, ch) => a + (/[\x00-\x7F]/.test(ch) ? 0.56 : 1.02) * fs, 0);
function fitTitle(text, maxW, baseFs, floorFs) {
  let fs = Math.max(floorFs, Math.round(baseFs));
  const lines = [String(text)];
  if (estWidth(text, fs) > maxW) {
    fs = Math.max(floorFs, Math.floor(fs * maxW / estWidth(text, fs)));
    if (estWidth(text, fs) > maxW) {                 // 还超宽 → 折两行
      const ch = [...String(text)];
      const mid = Math.ceil(ch.length / 2);
      lines.length = 0;
      lines.push(ch.slice(0, mid).join(''), ch.slice(mid).join(''));
      const widest = Math.max(...lines.map((l) => estWidth(l, 1)));
      fs = Math.max(floorFs, Math.floor(maxW / widest));
    }
  }
  return { fs, lines };
}

const filters = [
  `scale=${W}:${H}:force_original_aspect_ratio=increase`,
  `crop=${W}:${H}`,
  // 底部压暗，保证文字可读
  `drawbox=x=0:y=${Math.round(H * 0.62)}:w=${W}:h=${H - Math.round(H * 0.62)}:color=black@0.55:t=fill`,
];
let titleFit = null;
if (TITLE) {
  const { fs: tfs, lines } = fitTitle(TITLE, W * 0.92, H * 0.085, Math.max(16, Math.round(W * 0.035)));
  const lh = Math.round(tfs * 1.20);
  const y0 = Math.round(H * 0.655 - (lines.length - 1) * lh / 2);
  lines.forEach((ln, i) => {
    filters.push(`drawtext=font=SimHei:text='${esc(ln)}':fontsize=${tfs}:fontcolor=white:borderw=${Math.max(2, Math.round(tfs * 0.05))}:bordercolor=black@0.6:x=(w-text_w)/2:y=${y0 + i * lh}`);
  });
  titleFit = { fs: tfs, lines, lh, y0 };
}
if (SUB) {
  // 副标题同样不能超宽（竖屏下按 H*0.042 会变成 80px，一行 24 字符约 1900px）
  const sfs = Math.max(12, Math.min(Math.round(H * 0.042), Math.floor(W * 0.92 / Math.max(1, estWidth(SUB, 1)))));
  const ySub = titleFit ? Math.min(H - Math.round(H * 0.08), titleFit.y0 + titleFit.lines.length * titleFit.lh + Math.round(sfs * 0.55)) : Math.round(H * 0.80);
  filters.push(`drawtext=font=SimHei:text='${esc(SUB)}':fontsize=${sfs}:fontcolor=#7FE9D5:x=(w-text_w)/2:y=${ySub}`);
}
if (TAG) {
  filters.push(`drawtext=font=SimHei:text='${esc(TAG)}':fontsize=${Math.round(Math.min(H * 0.036, W * 0.045))}:fontcolor=white:box=1:boxcolor=#E64980@0.85:boxborderw=${Math.round(Math.min(H * 0.014, W * 0.016))}:x=${Math.round(W * 0.04)}:y=${Math.round(H * 0.04)}`);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
const logFile = path.join(ROOT, 'History', 'runs', '_logs', 'cover.log');
const r = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(AT), '-i', VIDEO, '-frames:v', '1',
  '-vf', filters.join(','), '-q:v', '2', OUT], logFile);
if (r.status !== 0) { console.error('封面生成失败:', (r.text || '').slice(-400)); process.exit(1); }
console.log(`[cover] ${W}x${H} → ${path.relative(ROOT, OUT)}  (${(fs.statSync(OUT).size / 1024).toFixed(0)}KB)`);
