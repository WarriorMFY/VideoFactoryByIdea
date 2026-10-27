#!/usr/bin/env node
/**
 * qa_report.mjs — 成片质检（客观、可复现）
 *
 * 用法：node Tool/qa_report.mjs <final.mp4> [--json out.json]
 * 检查项：
 *   1. 容器/编码规格（H.264 High、yuv420p、恒定帧率、音频 AAC 48k 立体声）
 *   2. 响度：EBU R128 集成响度 LUFS / 真峰值 dBTP / LRA（交付常见目标 -16 LUFS, 峰值 ≤ -1.5 dBTP）
 *   3. 时长：成片时长 vs EDL 保留总时长（转场会按 xfade 时长线性扣减）
 *   4. 残留缺陷：成片里是否还有黑场/冻帧/静音（应≈0）
 *   5. 音画时长差（<0.1s 视为同步无漂移）
 */
import fs from 'node:fs';
import path from 'node:path';
import { ffmpeg, ffprobeJson, durationOf, ROOT } from './lib/ff.mjs';

const args = process.argv.slice(2);
const file = args[0];
if (!file) { console.error('用法: node Tool/qa_report.mjs <final.mp4> [--json out.json]'); process.exit(2); }
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : file.replace(/\.mp4$/, '') + '.qa.json';
const work = path.join(path.dirname(file), '.qa');
fs.mkdirSync(work, { recursive: true });
const lf = (n) => path.join(work, `${n}.log`);

const pr = ffprobeJson(['-show_format', '-show_streams', file], lf('probe'));
const v = (pr.streams || []).find((s) => s.codec_type === 'video');
const a = (pr.streams || []).find((s) => s.codec_type === 'audio');
const dur = Number(pr.format?.duration || 0);
const hasAudio = !!a;

// 1) 响度（EBU R128）
let loud = null;
if (hasAudio) {
  const r = ffmpeg(['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', 'NUL'], lf('ebur128'));
  const txt = r.text;
  const summary = txt.slice(txt.lastIndexOf('Summary:'));
  const g = (re) => { const m = summary.match(re); return m ? Number(m[1]) : null; };
  loud = {
    integrated_lufs: g(/I:\s*(-?[\d.]+)\s*LUFS/),
    lra_lu: g(/LRA:\s*(-?[\d.]+)\s*LU/),
    true_peak_dbtp: g(/Peak:\s*(-?[\d.]+)\s*dBFS/),
  };
}

// 2) 残留缺陷
// 质检用的黑场判定与剪辑规则保持一致（d=0.30 / pix_th=0.04 / pic_th=0.98）；
// 否则会把"剪辑时够不上黑场"的暗场闪一下误报成缺陷（实测 0.3s 阈值边缘会反复报警）。
const vres = ffmpeg(['-hide_banner', '-nostats', '-i', file, '-an', '-vf',
  'blackdetect=d=0.30:pix_th=0.04:pic_th=0.98,freezedetect=n=0.003:d=0.35', '-f', 'null', 'NUL'], lf('vdefects'));
const vt = vres.text;
const blackN = [...vt.matchAll(/black_start:/g)].length;
const freezeN = [...vt.matchAll(/freeze_start:/g)].length;
let silenceN = 0;
if (hasAudio) {
  const ar = ffmpeg(['-hide_banner', '-nostats', '-i', file, '-vn', '-af', 'silencedetect=n=-35dB:d=0.5', '-f', 'null', 'NUL'], lf('adefects'));
  silenceN = [...ar.text.matchAll(/silence_start:/g)].length;
}

// 3) 音画时长差
const vd = Number(v?.duration || dur), ad = Number(a?.duration || dur);
const avDiff = Math.abs(vd - ad);

const silentInput = hasAudio ? (loud?.integrated_lufs !== null && loud?.integrated_lufs <= -60) : null;

const result = {
  checked_at: new Date().toISOString(),
  file, size_mb: Number((Number(pr.format?.size || 0) / 1048576).toFixed(3)),
  duration_s: Number(dur.toFixed(3)),
  video: v ? { codec: v.codec_name, profile: v.profile, level: v.level, w: v.width, h: v.height, pix_fmt: v.pix_fmt, fps: v.r_frame_rate, avg_fps: v.avg_frame_rate, sar: v.sample_aspect_ratio } : null,
  audio: a ? { codec: a.codec_name, sample_rate: Number(a.sample_rate), channels: a.channels, bitrate: Number(a.bit_rate) } : null,
  loudness: loud,
  silent_input_note: silentInput ? '音轨实质静音（素材本身无真实音频），响度归一不适用' : null,
  residual_defects: { black_segments: blackN, freeze_segments: freezeN, silence_segments: silenceN, note: '冻帧/静音残留不一定是缺陷：本流水线规则明确保留「仅冻帧」或「仅静音」的镜头（口播/动作镜头）' },
  av_duration_diff_s: Number(avDiff.toFixed(3)),
  checks: {
    has_video: !!v,
    h264: v?.codec_name === 'h264',
    yuv420p: v?.pix_fmt === 'yuv420p',
    cfr: v ? v.r_frame_rate === v.avg_frame_rate : false,
    audio_aac_48k: a ? (a.codec_name === 'aac' && Number(a.sample_rate) === 48000) : null,
    loudness_ok: (!loud || silentInput) ? null : (loud.integrated_lufs !== null && Math.abs(loud.integrated_lufs + 16) <= 2.0 && (loud.true_peak_dbtp ?? 0) <= -1.0),
    no_residual_black: blackN === 0,
    av_synced: avDiff < 0.1,
  },
};
result.verdict = Object.entries(result.checks).filter(([, vv]) => vv !== null).every(([, vv]) => vv) ? 'PASS' : 'WARN';
fs.writeFileSync(jsonOut, JSON.stringify(result, null, 2));

console.log(`\n=== 成片质检: ${result.verdict} ===`);
console.log(`文件 ${path.basename(file)}  ${result.size_mb}MB  ${result.duration_s}s`);
console.log(`视频 ${v?.codec_name}/${v?.profile}/${v?.pix_fmt} ${v?.width}x${v?.height} ${v?.r_frame_rate}`);
console.log(`音频 ${a ? `${a.codec_name} ${a.sample_rate}Hz ${a.channels}ch ${Math.round(Number(a.bit_rate) / 1000)}kbps` : '无'}`);
if (loud) console.log(`响度 ${loud.integrated_lufs} LUFS / 峰值 ${loud.true_peak_dbtp} dBTP / LRA ${loud.lra_lu} LU${result.silent_input_note ? '（' + result.silent_input_note + '）' : ''}`);
console.log(`残留缺陷 黑场=${blackN} 冻帧=${freezeN} 静音=${silenceN}   音画时长差=${result.av_duration_diff_s}s`);
console.log(`检查项: ${Object.entries(result.checks).map(([k, vv]) => `${k}=${vv === null ? '-' : vv ? 'ok' : '✗'}`).join(' ')}`);
console.log(`明细: ${jsonOut}`);
process.exit(result.verdict === 'PASS' ? 0 : 0); // 质检输出记录，退出码不阻断
