#!/usr/bin/env node
/**
 * bgm_fit.mjs —— BGM 卡点对齐器（loop43，音频通道执行体）
 *
 * 目的：给定任意候选音乐与成片的命中点时间表，量化回答"这首曲子卡不卡点"：
 *       在允许的相位搜索窗内找最优 offset，报告每个命中点的对齐误差（ms / 帧）。
 *       选型判据从"听着带感"变成可复现的数字；换曲重跑即得对比表。
 *
 * 用法：
 *   node Tool/audio/bgm_fit.mjs --music <audio> --hits 0.95,5.43,10.12 --dur 18.98 \
 *        [--search 2.0] [--tol 0.05] [--fps 60] [--mix <video.mp4> <out.mp4>]
 *
 * 输出：
 *   - 最优 offset（音乐相对成片的相位）与每个 hit 的误差表
 *   - 判定：全部 |err| ≤ tol → PASS；否则列出不合格 hit
 *   - --mix 时直接产出混流后的视频（视频流 copy，音乐按 offset 对齐）
 *
 * 方法：
 *   1) ffmpeg 解码为单声道 8kHz s16le 原始 PCM（经 pipe 读入，无临时文件）
 *   2) 5ms hop 能量包络 → 半波整流差分 = onset 强度
 *   3) 在 [-search, +search] 内以 5ms 步进扫 offset：每个 hit 取 ±0.25s 窗内
 *      onset 峰值，求和得分；得分最高者为最优相位
 *   4) 误差 = 命中的 onset 位置 − 理想 hit 时刻
 *
 * 已知边界（诚实声明）：
 *   - 只做"对齐质量"度量，不做曲风/情绪判断——那是人评
 *   - onset 用能量差分，对纯弦乐/氛围垫这类无瞬态曲会失真（报告里峰差会普遍偏大）
 *   - 不自动检测 BPM；段落结构（前奏长度/鼓组密度）由人在选型时人工判断
 */
import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FF = resolve(HERE, '../../Workspace/deps/ffmpeg/ffmpeg.exe');
if (!existsSync(FF)) { console.error('找不到 ffmpeg: ' + FF); process.exit(1); }

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const MUSIC = arg('music');
const HITS = (arg('hits') || '').split(',').map(Number).filter(n => !Number.isNaN(n));
const DUR = Number(arg('dur', 0));
const SEARCH = Number(arg('search', 2.0));
const TOL = Number(arg('tol', 0.05));
const FPS = Number(arg('fps', 60));
const MIX = argv.includes('--mix') ? { video: argv[argv.indexOf('--mix') + 1], out: argv[argv.indexOf('--mix') + 2] } : null;

if (!MUSIC || !existsSync(MUSIC)) { console.error('--music 必须指向存在的音频文件'); process.exit(1); }
if (HITS.length === 0) { console.error('--hits 必须给至少一个命中点（秒）'); process.exit(1); }
if (MIX && (!MIX.video || !MIX.out)) { console.error('--mix 需要 <video> <out> 两个参数'); process.exit(1); }

// ---------- 1) 解码 PCM ----------
console.error('解码音频: ' + MUSIC);
const pcm = execFileSync(FF, ['-v', 'error', '-i', resolve(MUSIC), '-ac', '1', '-ar', '8000', '-f', 's16le', 'pipe:1'], { maxBuffer: 1 << 30 });
const N = pcm.length >> 1;
const SR = 8000, HOP_MS = 5, HOP = SR * HOP_MS / 1000; // 40 样本
const nh = Math.floor(N / HOP);
const env = new Float64Array(nh);
for (let i = 0; i < nh; i++) {
  let s = 0, base = i * HOP;
  for (let k = 0; k < HOP; k++) { const v = pcm.readInt16LE((base + k) << 1); s += v * v; }
  env[i] = Math.sqrt(s / HOP);
}
// ---------- 2) onset 强度（半波整流差分，sqrt 压缩） ----------
const onset = new Float64Array(nh);
for (let i = 1; i < nh; i++) { const d = env[i] - env[i - 1]; onset[i] = d > 0 ? Math.sqrt(d) : 0; }
const audioDur = N / SR;
console.error(`PCM ${(N / SR).toFixed(2)}s / 包络 ${nh} hop @${HOP_MS}ms`);

// ---------- 3) 扫 offset ----------
const W = 0.25; // 每个 hit 的搜索半窗（秒）
const step = HOP_MS / 1000;
const peakAt = (t) => { // t 秒处 ±W 窗内的最大 onset 及位置；窗内无 onset 返回 null
  const lo = Math.max(0, Math.round((t - W) / step)), hi = Math.min(nh - 1, Math.round((t + W) / step));
  let best = -1, pos = lo;
  for (let i = lo; i <= hi; i++) if (onset[i] > best) { best = onset[i]; pos = i; }
  return best <= 0 ? null : { v: best, t: pos * step };
};
let bestOffset = 0, bestScore = -1, bestDetail = null;
for (let o = -SEARCH; o <= SEARCH + 1e-9; o += step) {
  let score = 0; const det = [];
  let ok = true;
  for (const h of HITS) {
    const t = h + o;
    if (t < 0 || t > audioDur) { ok = false; break; }
    const p = peakAt(t);
    score += p ? p.v : 0; det.push(p ? p.t : null); // 记录实际命中的 onset 绝对时刻；无 onset 记 null
  }
  if (!ok) continue;
  // 同分时选 |offset| 最小者：±W 窗只要罩住真 onset 得分就相同，
  // 平台内偏向 0 才是"音乐本来就能对上，无需人为挪相位"的诚实读数
  if (score > bestScore + 1e-9 ||
      (Math.abs(score - bestScore) <= 1e-9 && Math.abs(o) < Math.abs(bestOffset))) {
    bestScore = score; bestOffset = o; bestDetail = det;
  }
}

// ---------- 4) 报告 ----------
const fmt = (s) => (s >= 0 ? '+' : '') + s.toFixed(3);
console.log('\n=== 卡点对齐报告 ===');
console.log(`音乐: ${MUSIC} (${(statSync(MUSIC).size / 1048576).toFixed(1)} MB, ${audioDur.toFixed(2)}s)`);
console.log(`成片: ${DUR ? DUR.toFixed(2) + 's' : '(未给 --dur)'} / ${HITS.length} 个命中点 / 搜索 ±${SEARCH}s`);
if (bestDetail === null) {
  const over = HITS.filter((h) => h > audioDur || h + SEARCH < 0);
  console.error(`\n判定: 无法评估——曲长 ${audioDur.toFixed(2)}s 不足（判据 3：可用段 ≥ 成片时长 −1s），以下命中点没有可用音乐区间：`);
  (over.length ? over : HITS).forEach((h) => {
    const why = h > audioDur ? '超出曲尾' : '早于曲首/相位窗越界';
    console.error(`  hit ${h.toFixed(3)}s（曲长 ${audioDur.toFixed(2)}s，${why}）`);
  });
  process.exit(2);
}
console.log(`最优 offset: ${fmt(bestOffset)}s`);
let allPass = true;
let noOnset = 0;
console.log('  #   理想命中    对齐到      误差(ms)   误差(帧)   判定');
HITS.forEach((h, i) => {
  const at = bestDetail[i];
  if (at === null || at === undefined) { // 该 hit 的搜索窗内没有任何瞬态（判据 2）
    noOnset++; allPass = false;
    console.log(`  ${i + 1}   ${h.toFixed(3)}s     —              —          —       NO-ONSET`);
    return;
  }
  const err = at - h; // 实际 onset 位置 − 理想时刻
  const pass = Math.abs(err) <= TOL;
  if (!pass) allPass = false;
  console.log(`  ${i + 1}   ${h.toFixed(3)}s     ${at.toFixed(3)}s    ${(err * 1000).toFixed(0).padStart(6)}   ${(err * FPS).toFixed(1).padStart(5)}     ${pass ? 'PASS' : 'FAIL'}`);
});
if (noOnset) console.log(`\n注：${noOnset} 个命中点 ±0.25s 内无瞬态（判据 2）——纯氛围/弦乐垫天然不卡点`);
console.log(allPass ? `\n判定: PASS（全部 |误差| ≤ ${TOL}s ≈ ${(TOL * FPS).toFixed(1)} 帧）` : `\n判定: FAIL（tol ${TOL}s）——此相位下有 hit 落不进容差，换曲或人工审听`);
console.log('\n参考：误差为负 = 音乐的 onset 早于命中点（先响后打）；误差为正 = 晚响。');

// ---------- 5) 混流 ----------
if (MIX) {
  const v = resolve(MIX.video), out = resolve(MIX.out);
  const args = ['-y', '-loglevel', 'error', '-i', v];
  let musicIdx = 1;
  if (bestOffset >= 0.004) { args.push('-ss', bestOffset.toFixed(3)); }
  args.push('-i', resolve(MUSIC));
  if (bestOffset < -0.004) { // 音乐需晚于成片起点播放：正延迟
    args.push('-af', `adelay=${Math.round(-bestOffset * 1000)}:all=1`);
  }
  args.push('-map', '0:v', '-map', `${musicIdx}:a`, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', out);
  execFileSync(FF, args, { stdio: 'inherit' });
  console.log('混流完成: ' + out);
}
