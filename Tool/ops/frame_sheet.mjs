#!/usr/bin/env node
/**
 * frame_sheet.mjs — 选帧复核拼图（loop14 WP4.8 新增）
 *
 * 为什么自建：摘要片的 src 帧位写死在 spec 里，选错了整段画面就废（EP-A 靠人工一格格看）。
 * 本工具把「主播某个时间点」批量抽出来拼成一张带时间戳/序号的图，一次 ViewImage 复核。
 *
 * 用法：
 *   # ① 普查：每 N 秒一帧
 *   node Tool/ops/frame_sheet.mjs --video x.mp4 --out sheet.jpg --every 40 --cols 6
 *   # ② 精选复核：按 spec 里的时间点抽，序号=segments 顺序
 *   node Tool/ops/frame_sheet.mjs --video x.mp4 --out pick.jpg --times "15,52,25,72" --cols 6
 *
 * 每格左上角标 `#序号 时间`（普查模式只有时间），白字黑描边。
 */
import fs from 'node:fs';
import path from 'node:path';
import { ffmpeg, ROOT } from '../lib/ff.mjs';

const args = process.argv.slice(2);
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const VIDEO = path.resolve(ROOT, getOpt('--video', ''));
const OUT = path.resolve(ROOT, getOpt('--out', 'sheet.jpg'));
const EVERY = Number(getOpt('--every', 0));
const TIMES = getOpt('--times', '').split(',').map((s) => s.trim()).filter(Boolean).map(Number);
const COLS = Number(getOpt('--cols', 6));
const TW = Number(getOpt('--tw', 320));
const TH = Math.round((TW * 9) / 16);
if (!VIDEO || !fs.existsSync(VIDEO)) { console.error('缺 --video 或文件不存在'); process.exit(2); }
if (!EVERY && !TIMES.length) { console.error('需要 --every 或 --times'); process.exit(2); }

const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const tmp = path.join(path.dirname(OUT), '.sheet_tmp');
const LOG = path.join(ROOT, 'History', 'runs', '_logs', 'frame_sheet.log');
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });

const files = [];
const label = (i, t) => (TIMES.length ? `${i + 1} ${fmt(t)}` : fmt(t));
const items = TIMES.length ? TIMES.map((t) => ({ t })) : null;

if (items) {
  items.forEach((it, i) => {
    const f = path.join(tmp, `p${String(i).padStart(3, '0')}.jpg`);
    const txt = `${i + 1}# ${fmt(it.t)}`;
    const vf = `scale=${TW}:${TH}:force_original_aspect_ratio=increase,crop=${TW}:${TH},`
      + `drawtext=font=SimHei:text='${txt}':x=6:y=6:fontsize=${Math.round(TH * 0.09)}:fontcolor=white:borderw=2:bordercolor=black`;
    const r = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(it.t), '-i', VIDEO,
      '-frames:v', '1', '-vf', vf, '-q:v', '3', f], LOG);
    if (r.status !== 0 || !fs.existsSync(f)) console.error(`抽帧失败 @${it.t}s`);
    else files.push(f);
  });
} else {
  const f = path.join(tmp, 'all.jpg');
  const vf = `fps=1/${EVERY},scale=${TW}:${TH},`
    + `drawtext=font=SimHei:text='%{pts\\:hms}':x=6:y=6:fontsize=${Math.round(TH * 0.09)}:fontcolor=white:borderw=2:bordercolor=black,`
    + `tile=${COLS}x${Math.ceil(1 / 1)}`;
  // 普查模式：先出单帧序列再 tile（tile 需要固定行数，用 -frames:v 1 交给 tile 自动排）
  const seq = path.join(tmp, 's%04d.jpg');
  const r1 = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-i', VIDEO,
    '-vf', `fps=1/${EVERY},scale=${TW}:${TH},drawtext=font=SimHei:text='%{pts\\:hms}':x=6:y=6:fontsize=${Math.round(TH * 0.09)}:fontcolor=white:borderw=2:bordercolor=black`,
    '-q:v', '3', seq], LOG);
  if (r1.status !== 0) { console.error('抽帧失败:', (r1.text || '').slice(-300)); process.exit(1); }
  for (const n of fs.readdirSync(tmp).filter((x) => x.startsWith('s')).sort()) files.push(path.join(tmp, n));
}

const rows = Math.ceil(files.length / COLS);
const outDir = path.dirname(OUT);
const listTxt = path.join(tmp, 'list.txt');
fs.writeFileSync(listTxt, files.map((f) => `file '${f.replace(/\\/g, '/')}'`).join('\n'));
const r = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', listTxt,
  '-vf', `scale=${TW}:${TH},tile=${COLS}x${rows}:padding=4:color=black`, '-frames:v', '1', '-q:v', '3', OUT], LOG);
if (r.status !== 0) { console.error('拼图失败:', (r.text || '').slice(-300)); process.exit(1); }
console.log(`${OUT}  ${files.length} 格 ${COLS}x${rows}  单帧 ${TW}x${TH}`);
