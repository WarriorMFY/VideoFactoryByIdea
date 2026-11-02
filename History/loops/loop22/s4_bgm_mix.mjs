#!/usr/bin/env node
/**
 * s4_bgm_mix.mjs — loop22 S4/H1 实验：给 v2 成片加音乐床（sidechain ducking）
 * 同源单变量：视频轨 copy，只重混音频。BGM 代理取自样本《108部动画混剪》前 25s 纯乐段，
 * 仅用于内部技术实验（不发布、不入交付物），产线需换授权曲库。
 *
 * 用法: node s4_bgm_mix.mjs <in.mp4> <out.mp4> <bgm.wav>
 * 判卷指标：BGM 在「人声段 vs 静默段」的 RMS 差（ducking 是否生效）+ 成片响度
 */
import { ffmpeg, FP, run } from '../../../Tool/lib/ff.mjs';
import fs from 'node:fs';

const [inFile, outFile, bgm] = process.argv.slice(2);
if (!inFile || !outFile || !bgm) { console.log('用法: s4_bgm_mix.mjs in.mp4 out.mp4 bgm.wav'); process.exit(2); }

const LOG = 'History/runs/_logs/loop22_bgm_mix.log';
const r = ffmpeg([
  '-hide_banner', '-y',
  '-i', inFile,
  '-stream_loop', '-1', '-i', bgm,
  '-filter_complex',
  // BGM: 低电平铺底 + 2s 淡入；人声作为 sidechain 触发压低 BGM
  '[1:a]volume=0.22,afade=t=in:d=2[bgm];' +
  '[bgm][0:a]sidechaincompress=threshold=0.02:ratio=6:attack=80:release=500:makeup=1[duck];' +
  '[duck][0:a]amix=inputs=2:normalize=0,apad=whole_dur=209.40,loudnorm=I=-16:TP=-1.5:LRA=11[aout]',
  '-map', '0:v', '-map', '[aout]',
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000',
  '-t', '209.40', '-movflags', '+faststart', outFile,
], LOG);
if (r.status !== 0) { console.error('混音失败:', (r.text || '').slice(-400)); process.exit(1); }

// ---- 判卷：分段测 BGM 残留电平（人声活跃段 vs 人声间隙段）----
const vd = String(run(FP, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=duration', '-of', 'csv=p=0', outFile], 'History/runs/_logs/loop22_vd.log').text || '').trim();
console.log('输出视频流时长', vd);
// 静默段示例：章节卡/片尾（v2 结构里 8.0-10.4 标题卡只有少量音乐、203-209 片尾）
for (const [label, ss, t] of [['人声活跃段(15-20s)', 15, 5], ['章节卡段(8.5-10s)', 8.5, 1.5], ['片尾段(204-209s)', 204, 5]]) {
  const rr = run(FP, ['-v', 'info', '-ss', String(ss), '-t', String(t), '-i', outFile,
    '-af', 'astats=metadata=1:reset=1', '-f', 'null', '-'], `History/runs/_logs/loop22_rms_${ss}.log`);
  const rms = [...(rr.text || '').matchAll(/RMS level dB: (-?[\d.]+)/g)].map(m => +m[1]);
  if (rms.length) {
    const avg = rms.reduce((a, b) => a + b, 0) / rms.length;
    console.log(`${label}: 平均RMS ${avg.toFixed(1)} dB`);
  }
}
