#!/usr/bin/env node
/**
 * fetch_realspeech.mjs — 下载「带真实人声」的公开授权外语素材（小循环 3 用）
 *
 * 背景：小循环 2 只验证了 TTS 合成语音；本轮补真实人声。
 * 实测可用源（其余大面积不可达，见 History/probe/*_probe.mjs）：
 *   - media.w3.org 上的 Blender 开放电影预告片（CC-BY）：media.w3.org 速度 0.5~5MB/s ✅
 *   - test-videos.co.uk（片段多为无声，附带的 Sintel 片段也要先验音轨）
 * 输出：Workspace/assets/realspeech/<name>.mp4，并打印音轨探测结果
 */
import fs from 'node:fs';
import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ffprobeJson, ROOT } from '../lib/ff.mjs';

const OUT = path.join(ROOT, 'Workspace', 'assets', 'realspeech');
fs.mkdirSync(OUT, { recursive: true });

const CANDS = [
  ['sintel-trailer', 'https://media.w3.org/2010/05/sintel/trailer.mp4'],
  ['tv-sintel-1080-10s', 'https://test-videos.co.uk/vids/sintel/mp4/h264/1080/Sintel_1080_10s_5MB.mp4'],
  ['w3c-movie300', 'https://media.w3.org/2010/05/video/movie_300.mp4'],
];

for (const [name, url] of CANDS) {
  const dest = path.join(OUT, `${name}.mp4`);
  try {
    if (!fs.existsSync(dest) || fs.statSync(dest).size < 100 * 1024) {
      const t0 = Date.now();
      const r = await fetch(url, { signal: AbortSignal.timeout(300000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await pipeline(Readable.fromWeb(r.body), createWriteStream(dest));
      console.log(`[dl] ${name} ${(fs.statSync(dest).size / 1048576).toFixed(2)}MB ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    }
    const pr = ffprobeJson(['-show_format', '-show_streams', dest], path.join(OUT, `_${name}.probe.log`));
    const v = (pr.streams || []).find((s) => s.codec_type === 'video');
    const a = (pr.streams || []).find((s) => s.codec_type === 'audio');
    console.log(`[meta] ${name.padEnd(20)} ${Number(pr.format?.duration || 0).toFixed(1)}s ${v?.width}x${v?.height} ${v?.codec_name} audio=${a ? `${a.codec_name} ${a.sample_rate}Hz ${a.channels}ch` : '无'}`);
  } catch (e) {
    console.log(`[fail] ${name}: ${String(e.message).slice(0, 60)}`);
  }
}
