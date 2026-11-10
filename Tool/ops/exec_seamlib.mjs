// exec_seamlib.mjs —— 选链尾手帧库生成（exec-seam-stitch 技能的执行体）
//
// 用途：给候选单位批量生成「尾帧(tail) + 手帧(open)」取证图与两张总网格，
//       供逐缝目验选序（尾帧↔手帧同色系/同场景 = 缝的候选）。loop43 seam_lib 的工具化。
//
// 用法:
//   node Tool/ops/exec_seamlib.mjs <unitsDir> [--units u03,u38] [--out seam_lib] [--width 480] [--cols 8]
//     unitsDir   含 uNN.mp4 的目录（如 Material/影之刃零/处决镜头）
//     --units    只处理子集（逗号分隔单位号）；缺省全目录
// 产物: seam_lib/uNN_open.png + uNN_tail.png + grid_open.png + grid_tail.png
import { readdirSync, mkdirSync, existsSync, copyFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ffmpeg, durationOf, ROOT } from '../lib/ff.mjs';

const argv = process.argv.slice(2);
const getArg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const srcDir = resolve(argv.find(a => !a.startsWith('--')) || '.');
if (!existsSync(srcDir)) { console.error(`✗ 目录不存在: ${srcDir}`); process.exit(1); }
const OUT = resolve(getArg('out', join(srcDir, 'seam_lib')));
const W = Number(getArg('width', 480));
const COLS = Number(getArg('cols', 8));
const subset = getArg('units', null);

const units = readdirSync(srcDir)
  .filter(f => /^u\d+\.mp4$/i.test(f))
  .map(f => f.replace(/\.mp4$/i, ''))
  .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
const picked = subset ? subset.split(',').map(s => s.trim()).filter(Boolean) : units;
const bad = picked.filter(u => !existsSync(join(srcDir, `${u}.mp4`)));
if (bad.length) { console.error(`✗ 单位不存在: ${bad.join(', ')}`); process.exit(1); }

mkdirSync(OUT, { recursive: true });
const TMP = join(OUT, 'tmp');
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

const ok = [];
for (const u of picked) {
  const src = join(srcDir, `${u}.mp4`);
  const open = join(OUT, `${u}_open.png`);
  const tail = join(OUT, `${u}_tail.png`);
  let fail = false;
  let r = ffmpeg(['-y', '-loglevel', 'error', '-i', src, '-frames:v', '1', '-vf', `scale=${W}:-1`, open], join(TMP, `${u}_open.log`));
  if (r.status !== 0) fail = true;
  r = ffmpeg(['-y', '-loglevel', 'error', '-sseof', '-0.15', '-i', src, '-frames:v', '1', '-vf', `scale=${W}:-1`, tail], join(TMP, `${u}_tail.log`));
  if (r.status !== 0) fail = true;
  if (fail) { console.error(`✗ ${u} 抽帧失败，详见 ${TMP}`); process.exit(1); }
  ok.push(u);
  console.log(`  ✓ ${u}  ${durationOf(src, join(TMP, `${u}_dur.log`)).toFixed(2)}s`);
}

// 网格：不足一行用末帧补齐（tile 不做黑边补位）
const montage = (frames, name) => {
  const rows = Math.ceil(frames.length / COLS);
  const padded = [...frames];
  while (padded.length < rows * COLS) padded.push(frames[frames.length - 1]);
  const seq = padded.map((f, i) => {
    const dst = join(TMP, `${name}_${String(i + 1).padStart(3, '0')}.png`);
    copyFileSync(f, dst);
    return dst;
  });
  const args = ['-y', '-loglevel', 'error'];
  for (const s of seq) args.push('-i', s);
  args.push('-filter_complex', `tile=${COLS}x${rows}`, '-frames:v', '1', join(OUT, name));
  const r = ffmpeg(args, join(TMP, `${name}.log`));
  if (r.status !== 0) { console.error(`✗ 网格 ${name} 失败`); process.exit(1); }
  console.log(`  ✓ ${name}  (${COLS}×${rows})`);
};

montage(ok.map(u => join(OUT, `${u}_open.png`)), 'grid_open.png');
montage(ok.map(u => join(OUT, `${u}_tail.png`)), 'grid_tail.png');
console.log(`\n帧库 → ${OUT}  （${ok.length} 单位；网格列序 = 单位号升序${subset ? '（子集）' : ''}）`);
