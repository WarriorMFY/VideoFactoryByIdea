// rebuild_audio.mjs —— 给已有 recam 成片回填原声（loop42 补音频通道）
//
// 背景：recam.mjs 全链 -an，视频侧变速由 setpts 完成，音频侧从未处理，
// 导致所有成片是纯画面。本脚本读同一份配方，按每镜 speed 用 atempo 逐段变速，
// concat 后 mux 回成片，视频流直接 copy 不重编。
//
// 用法: node rebuild_audio.mjs <源片> <配方.json> <成片.mp4> <输出.mp4> [--gain=dB]
//
// 关键约束（实测）：
// - ffmpeg 6.1 的 atempo 单级范围 [0.5, 100]，0.3x 必须级联（0.5 × 0.6）
// - atempo 保音高（WSOLA），慢放段不会变调；要降调需另加 asetrate，本脚本不做
// - 每段 apad + atrim 强制精确到 outDur，否则 concat 累积漂移
// - 视频流 -c:v copy，只重编音频
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const FF = join(ROOT, 'Workspace/deps/ffmpeg/ffmpeg.exe');
const FFPROBE = join(ROOT, 'Workspace/deps/ffmpeg/ffprobe.exe');
const j = s => (s.includes(' ') ? JSON.stringify(s) : s);
const run = (cmd, cwd) => execSync(cmd, { stdio: ['ignore', 'inherit', 'inherit'], cwd });

const args = process.argv.slice(2);
const gainArg = args.find(a => a.startsWith('--gain='));
const GAIN = gainArg ? Number(gainArg.split('=')[1]) : 0;
const pos = args.filter(a => !a.startsWith('--'));
const [srcArg, cfgArg, vidArg, outArg] = pos;
if (!srcArg || !cfgArg || !vidArg || !outArg) {
  console.error('用法: node rebuild_audio.mjs <源片> <配方.json> <成片.mp4> <输出.mp4> [--gain=dB]');
  process.exit(1);
}

const CFG_PATH = resolve(cfgArg);
const CFG = JSON.parse(readFileSync(CFG_PATH, 'utf8'));
const CFG_DIR = dirname(CFG_PATH);
const B = join(CFG_DIR, 'audio_build');
mkdirSync(B, { recursive: true });

const SRC = [resolve(srcArg), resolve(CFG_DIR, srcArg)].find(p => existsSync(p));
const VID = [resolve(vidArg), resolve(CFG_DIR, vidArg)].find(p => existsSync(p));
if (!SRC || !VID) { console.error('源片或成片找不到'); process.exit(1); }

// atempo 链：把任意倍率拆成若干 [0.5,100] 因子的连乘
function atempoChain(sp) {
  const c = [];
  let r = sp;
  while (r < 0.5) { c.push('atempo=0.5'); r /= 0.5; }
  while (r > 100) { c.push('atempo=100'); r /= 100; }
  if (Math.abs(r - 1) > 1e-6) c.push(`atempo=${r.toFixed(6)}`);
  return c.join(',');
}

const src = CFG.source || {};
const SRC_IN = src.in ?? 0, SRC_DUR = src.dur ?? null;
const vDur = Number(execSync(`${j(FFPROBE)} -v error -show_entries format=duration -of csv=p=0 ${j(VID)}`, { encoding: 'utf8' }).trim());

// 逐镜切段 + 变速：每段强制到 outDur，末尾整体对齐成片时长
const shots = CFG.shots;
const parts = [];
let acc = 0;
// 同一输入流被 N 路消费必须先 asplit，否则各路互相吃样本（实测只出末段时长）
parts.push(`[0:a]asplit=${shots.length}${shots.map((_, i) => `[s${i}]`).join('')}`);
shots.forEach((s, i) => {
  const [t0, t1] = s.t;
  const sp = s.speed ?? 1;
  const outDur = (t1 - t0) / sp;
  const chain = [`atrim=start=${t0}:end=${t1}`, 'asetpts=N/SR/TB'];
  const at = atempoChain(sp);
  if (at) chain.push(at);
  chain.push('apad');
  chain.push(`atrim=0:${outDur.toFixed(6)}`);
  chain.push('asetpts=N/SR/TB');
  chain.push('aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo');
  parts.push(`[s${i}]${chain.join(',')}[a${i}]`);
  acc += outDur;
});
const concatIn = shots.map((_, i) => `[a${i}]`).join('');
const filter = [...parts, `${concatIn}concat=n=${shots.length}:v=0:a=1[cat]`,
  `[cat]apad,atrim=0:${vDur.toFixed(6)},asetpts=N/SR/TB[out]`].join(';');
const FSCRIPT = join(B, 'afilter.txt');
writeFileSync(FSCRIPT, filter, 'utf8');

const WAV = join(B, 'rebuilt.wav');
const aArgs = [j(FF), '-y', '-loglevel', 'error'];
// 音频 seek 精确到样本，无需 recam 那套双 seek（那是为视频 GOP 对齐）；
// 双 seek 的 output -ss 会让音频流时间戳错位，实测只出 0.58s
if (SRC_IN > 0) aArgs.push('-ss', SRC_IN.toFixed(4));
// -t 必须放在 -i 之前（输入侧限长）；放输出侧会把变速拉长后的音频再截回源长，
// 实测 u02 慢放段被吃掉 0.15s。输出长度由 filter 内 atrim 精确控制。
if (SRC_DUR) aArgs.push('-t', String(SRC_DUR));
aArgs.push('-i', j(SRC));
aArgs.push('-filter_complex_script', j(FSCRIPT), '-map', '[out]', '-c:a', 'pcm_s16le', j(WAV));
run(aArgs.map(j).join(' '));

// mux：视频 copy，音频 aac；可选整体增益
const OUT = resolve(outArg);
mkdirSync(dirname(OUT), { recursive: true });
const mArgs = [j(FF), '-y', '-loglevel', 'error', '-i', j(VID), '-i', j(WAV), '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy'];
if (GAIN !== 0) mArgs.push('-af', `volume=${GAIN}dB`);
mArgs.push('-c:a', 'aac', '-b:a', '192k', '-shortest', j(OUT));
run(mArgs.map(j).join(' '));

console.log(`音频重建: 配方 ${shots.length} 镜，累计 ${acc.toFixed(3)}s / 成片 ${vDur.toFixed(3)}s`);
for (const s of shots) {
  const [t0, t1] = s.t, sp = s.speed ?? 1;
  console.log(`  t[${t0}, ${t1}] ${sp}x → ${((t1 - t0) / sp).toFixed(3)}s  ${atempoChain(sp) || '原速'}`);
}
console.log('完成:', OUT);
