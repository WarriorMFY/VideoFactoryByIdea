#!/usr/bin/env node
/**
 * make_real_bench.mjs — 真实素材 + 已知"废镜头"的混合测试素材（多段，用于验证真实素材上的多段切分与转场）
 *
 * 为什么：合成素材能验证规则正确性，但真实编码特性、真实运动、码率分布与合成不同。
 * 这里用真实公开素材（Big Buck Bunny, © Blender Foundation, CC-BY 3.0）拼接已知废镜头：
 *   头 3s 黑场+静音 · 真实片段前半 · 中插 2s 黑场+静音 · 真实片段后半 · 尾 2s 黑场+静音
 * 于是"该切什么"仍有机器可读真值，且能验证真实素材上的多段裁剪 + 转场。
 *
 * 已知局限：test-videos.co.uk 的 BBB 片段本身**无音轨**，因此本用例不覆盖音频路径；
 * 音频（响度归一/静音检测）由合成用例 History/bench/synth 覆盖。
 *
 * 用法：node Tool/make_real_bench.mjs [clip] [outDir]
 */
import fs from 'node:fs';
import path from 'node:path';
import { ffmpeg, ffprobeJson, durationOf, ROOT } from './lib/ff.mjs';

const clip = process.argv[2] || path.join(ROOT, 'Workspace', 'assets', 'Big_Buck_Bunny_1080_10s_5MB.mp4');
const outDir = process.argv[3] || path.join(ROOT, 'History', 'bench', 'real');
fs.mkdirSync(outDir, { recursive: true });
const lf = (n) => path.join(outDir, `_${n}.log`);

const pr = ffprobeJson(['-show_format', '-show_streams', clip], lf('probe'));
const v = (pr.streams || []).find((s) => s.codec_type === 'video');
const a = (pr.streams || []).find((s) => s.codec_type === 'audio');
if (!v) throw new Error('素材无视频流');
const W = v.width, H = v.height;
const [fr, fd] = String(v.r_frame_rate).split('/').map(Number);
const fps = fd ? fr / fd : fr;
const clipDur = Number(pr.format.duration);
const HEAD = 3, MID = 2, TAIL = 2;
const split = Number((clipDur * 0.35).toFixed(3)); // 真实片段内部切分点

const black = (d, lbl) => `color=c=black:s=${W}x${H}:r=${fps}:d=${d}[${lbl}]`;
const sil = (d, lbl) => `anullsrc=r=48000:cl=stereo:d=${d}[${lbl}]`;
const segB = Number((clipDur - split).toFixed(3));

const fc = [
  // 真实片段：视频拆两段（+可选音频拆两段）
  `[0:v]fps=${fps},setsar=1,format=yuv420p,split=2[vA][vB]`,
  `[vA]trim=0:${split},setpts=PTS-STARTPTS[va]`,
  `[vB]trim=${split}:${clipDur},setpts=PTS-STARTPTS[vb]`,
  // 黑场/静音
  black(HEAD, 'b1'), sil(HEAD, 's1'),
  black(MID, 'b2'), sil(MID, 's2'),
  black(TAIL, 'b3'), sil(TAIL, 's3'),
];
if (a) {
  fc.push(
    `[0:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,asplit=2[aA][aB]`,
    `[aA]atrim=0:${split},asetpts=PTS-STARTPTS[aa]`,
    `[aB]atrim=${split}:${clipDur},asetpts=PTS-STARTPTS[ab]`,
    `[b1][s1][va][aa][b2][s2][vb][ab][b3][s3]concat=n=5:v=1:a=1[vout][aout]`,
  );
} else {
  fc.push(
    sil(split, 'sa'), sil(segB, 'sb'),
    `[b1][s1][va][sa][b2][s2][vb][sb][b3][s3]concat=n=5:v=1:a=1[vout][aout]`,
  );
}

const outFile = path.join(outDir, 'source.mp4');
const r = ffmpeg(['-y', '-hide_banner', '-loglevel', 'error', '-i', clip,
  '-filter_complex', fc.join(';'), '-map', '[vout]', '-map', '[aout]',
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', outFile], lf('make'));
if (r.status !== 0) { console.error(r.text.split('\n').slice(-20).join('\n')); process.exit(1); }

const total = durationOf(outFile, lf('dur'));
const segs = [
  { id: 'HEAD_BLACK', start: 0, end: HEAD, expect: 'drop', why: '片头黑场+静音' },
  { id: 'REAL_A', start: HEAD, end: HEAD + split, expect: 'keep', why: '真实素材前段，不得误切' },
  { id: 'MID_BLACK', start: HEAD + split, end: HEAD + split + MID, expect: 'drop', why: '中插黑场+静音（转场残留）' },
  { id: 'REAL_B', start: HEAD + split + MID, end: HEAD + split + MID + (clipDur - split), expect: 'keep', why: '真实素材后段，不得误切' },
  { id: 'TAIL_BLACK', start: HEAD + split + MID + (clipDur - split), end: total, expect: 'drop', why: '片尾黑场+静音' },
];
const gt = {
  generated_at: new Date().toISOString(),
  source: 'Tool/make_real_bench.mjs',
  clip: { file: clip, duration: clipDur, width: W, height: H, fps, has_audio: !!a, license: 'Big Buck Bunny © Blender Foundation, CC-BY 3.0' },
  duration_s: total,
  spec_note: '真值 = 脚本人为插入的黑场+静音段（机器可读）；真实片段本身应全部保留。素材本身无音轨时音频路径不覆盖。',
  sections: segs,
  kept: segs.filter((s) => s.expect === 'keep').map((s) => [s.start, s.end]),
  dropped: segs.filter((s) => s.expect === 'drop').map((s) => [s.start, s.end]),
};
fs.writeFileSync(path.join(outDir, 'ground_truth.json'), JSON.stringify(gt, null, 2));
console.log(`[real-bench] ${outFile} dur=${total.toFixed(2)}s clip=${clipDur}s clip_audio=${!!a}`);
for (const s of segs) console.log(`   ${s.id.padEnd(11)} [${s.start.toFixed(2)}, ${s.end.toFixed(2)}] ${s.expect}`);
