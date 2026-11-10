// exec_stitch.mjs —— 无缝拼接执行体（exec-seam-stitch 技能的执行体）
//
// 用途：按选定的单位链 concat 直拼（硬纪律：不加过渡特效），拼后做时长核算。
//       loop43/loop47 手工 ffmpeg concat 命令的工具化。
//
// 用法:
//   node Tool/ops/exec_stitch.mjs <out.mp4> --units u03,u38,u10 [--dir <unitsDir>] [--check]
//     out.mp4   输出成片
//     --units   逗号分隔的单位号（顺序即链序），在该序的目录里找 uNN.mp4
//     --dir     单位所在目录（缺省当前目录）
//     --check   拼后核对总时长 vs 单位时长之和（±0.1s），不符非零退出
import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ffmpeg, durationOf } from '../lib/ff.mjs';

const argv = process.argv.slice(2);
const getArg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const out = resolve(argv.find(a => !a.startsWith('--')) || '');
if (!out) { console.error('用法: node Tool/ops/exec_stitch.mjs <out.mp4> --units u03,u38 [--dir .] [--check]'); process.exit(1); }
const dir = resolve(getArg('dir', process.cwd()));
const units = (getArg('units', '') || '').split(',').map(s => s.trim()).filter(Boolean);
if (!units.length) { console.error('✗ --units 不能为空'); process.exit(1); }

for (const u of units) {
  if (!existsSync(join(dir, `${u}.mp4`))) { console.error(`✗ 单位不存在: ${dir}/${u}.mp4`); process.exit(1); }
}

const listFile = out.replace(/\.(mp4|mov|mkv)$/i, '') + '_concat.txt';
// concat demuxer 的相对路径是相对清单文件位置解析的 → 写绝对路径（正斜杠 + 单引号转义）
const absPath = u => join(dir, `${u}.mp4`).replaceAll('\\', '/').replaceAll("'", "'\\''");
writeFileSync(listFile, units.map(u => `file '${absPath(u)}'`).join('\n') + '\n');

const r = ffmpeg([
  '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile,
  '-c', 'copy', '-movflags', '+faststart', out,
], out.replace(/\.(mp4|mov|mkv)$/i, '') + '_stitch.log');
if (r.status !== 0) { console.error(`✗ 拼接失败，日志: ${r.text.slice(-600)}`); process.exit(1); }

const durs = units.map(u => durationOf(join(dir, `${u}.mp4`), join(dir, '_probe.log')));
const sum = durs.reduce((a, b) => a + b, 0);
const real = durationOf(out, join(dir, '_probe.log'));

console.log(`链: ${units.join(' → ')}`);
units.forEach((u, i) => console.log(`  ${String(i + 1).padStart(2, '0')}. ${u}  ${durs[i].toFixed(3)}s`));
console.log(`成片: ${out}  ${real.toFixed(3)}s（单位和 ${sum.toFixed(3)}s，差 ${(real - sum).toFixed(3)}s）`);

if (getArg('check', null) !== null && Math.abs(real - sum) > 0.1) {
  console.error('✗ 时长核算超差（>0.1s），接缝可能丢帧');
  process.exit(1);
}
