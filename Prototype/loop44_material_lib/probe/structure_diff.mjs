#!/usr/bin/env node
/**
 * structure_diff.mjs — 目录结构一致性比对（loop44 一次性取证）
 *
 * 用法：node structure_diff.mjs <参考目录> <目标目录>
 * 输出：① 文件名集合差集 ② 扩展名计数 ③ 每个 uNN.mp4 的时长/分辨率/帧率对照
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const [refDir, tgtDir] = process.argv.slice(2);
if (!refDir || !tgtDir) { console.error('用法: structure_diff.mjs <参考> <目标>'); process.exit(2); }

const FP = path.join(process.cwd(), 'Workspace/deps/ffmpeg/ffprobe.exe');
const ls = (d) => fs.readdirSync(d).filter((f) => !f.startsWith('.')).sort();
const ext = (f) => path.extname(f).toLowerCase();

const probe = (f) => {
  try {
    const out = execFileSync(FP, ['-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,r_frame_rate,nb_frames',
      '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim().split('\n');
    const s = out[0].split(',');           // w,h,fps,nb
    const dur = Number(out[1] || out[0].split(',').pop());
    return { w: +s[0], h: +s[1], fps: s[2], frames: +s[3], dur };
  } catch { return null; }
};

const A = ls(refDir), B = ls(tgtDir);
const setA = new Set(A), setB = new Set(B);
const onlyA = A.filter((f) => !setB.has(f));
const onlyB = B.filter((f) => !setA.has(f));

const extCount = (arr) => arr.reduce((m, f) => (m[ext(f)] = (m[ext(f)] || 0) + 1, m), {});

console.log(`参考 ${refDir}\n  ${A.length} 个文件 ${JSON.stringify(extCount(A))}`);
console.log(`目标 ${tgtDir}\n  ${B.length} 个文件 ${JSON.stringify(extCount(B))}`);
console.log(`\n结构一致: ${onlyA.length === 0 && onlyB.length === 0 ? '是（文件名集合完全相同）' : '否'}`);
if (onlyA.length) console.log(`  仅在参考: ${onlyA.join(', ')}`);
if (onlyB.length) console.log(`  仅在目标: ${onlyB.join(', ')}`);

// 逐片段比对（只看两边都有的 uNN.mp4）
const clips = A.filter((f) => /^u\d+\.mp4$/.test(f) && setB.has(f));
let maxD = 0, maxDId = '', bad = [];
for (const f of clips) {
  const a = probe(path.join(refDir, f)), b = probe(path.join(tgtDir, f));
  if (!a || !b) { bad.push(`${f} 探测失败`); continue; }
  const d = Math.abs(a.dur - b.dur);
  if (d > maxD) { maxD = d; maxDId = f; }
  if (a.w !== b.w || a.h !== b.h || a.fps !== b.fps) bad.push(`${f} 规格不符 ref=${a.w}x${a.h}@${a.fps} tgt=${b.w}x${b.h}@${b.fps}`);
}
console.log(`\n片段比对 ${clips.length} 条：规格异常 ${bad.length} 条；时长最大差 ${maxD.toFixed(3)}s（${maxDId || '-'}）`);
bad.forEach((x) => console.log('  ' + x));
process.exit(onlyA.length || onlyB.length || bad.length ? 1 : 0);
