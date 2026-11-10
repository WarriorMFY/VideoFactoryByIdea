// bgm_mix.mjs —— BGM 混流执行体（bgm_fit 选型后的落库动作）
//
// 用途：把选定的 BGM 按 offset 对齐混进无声成片（视频流 copy 不重编码）。
//       loop43/loop47 手工混流命令的工具化。
//
// 用法:
//   node Tool/audio/bgm_mix.mjs <video.mp4> <audio.(mp3|m4a|wav)> <out.mp4> [--offset S] [--fade-out S] [--gain dB]
//     --offset    音频相对视频的偏移（秒）。正=音频后移（adelay）；负=音频提前（从 -offset 处起播）
//     --fade-out  结尾淡出时长（秒），缺省 1.0；0 关闭
//     --gain      音频增益 dB（如 -3）
import { existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { ffmpeg, durationOf } from '../lib/ff.mjs';

const argv = process.argv.slice(2);
const getArg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
// 位置参数 = 所有非 flag 且不被当作 flag 值的参数
const plain = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) { i++; continue; }
  plain.push(argv[i]);
}
const [video, audio, out] = plain.map(p => resolve(p));
if (!video || !audio || !out) {
  console.error('用法: node Tool/audio/bgm_mix.mjs <video> <audio> <out> [--offset S] [--fade-out S] [--gain dB]');
  process.exit(1);
}
if (!existsSync(video)) { console.error(`✗ 视频不存在: ${video}`); process.exit(1); }
if (!existsSync(audio)) { console.error(`✗ 音频不存在: ${audio}`); process.exit(1); }

const vDur = durationOf(video, join(dirname(out), '_probe.log'));
const offset = Number(getArg('offset', 0));
const fade = Number(getArg('fade-out', 1.0));
const gain = getArg('gain', null);

const args = ['-y', '-loglevel', 'error', '-i', video];
if (offset < 0) args.push('-ss', String(Math.abs(offset)));
args.push('-i', audio);

const chain = [];
if (offset > 0) chain.push(`adelay=${Math.round(offset * 1000)}:all=1`);
if (gain) chain.push(`volume=${gain}dB`);
const aStart = offset < 0 ? Math.abs(offset) : 0;
if (fade > 0) chain.push(`afade=t=in:st=0:d=0.15,afade=t=out:st=${Math.max(0, vDur - aStart - fade).toFixed(3)}:d=${fade}`);
chain.push('atrim=0:' + (vDur + Math.max(0, offset)).toFixed(3), 'asetpts=PTS-STARTPTS');
args.push('-filter_complex', `[1:a]${chain.join(',')}[a]`);
args.push('-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', out);

const r = ffmpeg(args, out.replace(/\.(mp4|mov|mkv)$/i, '') + '_mix.log');
if (r.status !== 0) { console.error(`✗ 混流失败: ${r.text.slice(-600)}`); process.exit(1); }

const oDur = durationOf(out, join(dirname(out), '_probe.log'));
console.log(`成片: ${out}`);
console.log(`  视频 ${vDur.toFixed(3)}s → 混后 ${oDur.toFixed(3)}s ｜ offset ${offset > 0 ? '+' : ''}${offset}s ｜ fade-out ${fade}s${gain ? ` ｜ gain ${gain}dB` : ''}`);
if (Math.abs(oDur - vDur) > 0.1) console.error('⚠ 混后时长与视频差 >0.1s，检查 -shortest 与 atrim');
