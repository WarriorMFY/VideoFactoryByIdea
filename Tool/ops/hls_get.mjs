#!/usr/bin/env node
// hls_get.mjs —— 并行抓 HLS 分段并合成 mp4（替代 ffmpeg 顺序拉流的慢车道）
//
//   node Tool/ops/hls_get.mjs --video-m3u8 <path|url> [--audio-m3u8 <path|url>] \
//        --out <out.mp4> [--tmp <dir>] [--conc 12] [--retry 3]
//
// 背景：ffmpeg 顺序拉 TED HLS 时单分段 RTT 主导，16 分钟片子实测 >86 分钟仍未完；
// 本脚本按并发抓全部 .ts 再 concat 复用，通常把同等工作压到几分钟。
//
// 产物：<out>（先 -c copy 合流，失败再转码兜底）；分段缓存留在 --tmp。

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FFMPEG = path.join(ROOT, 'Workspace/deps/ffmpeg/ffmpeg.exe');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };

const VIDEO = opt('video-m3u8');
const AUDIO = opt('audio-m3u8');
const OUT = path.resolve(ROOT, opt('out'));
const TMP = path.resolve(ROOT, opt('tmp', 'Workspace/tmp/hls'));
const CONC = Number(opt('conc', '12'));
const RETRY = Number(opt('retry', '3'));
const UA = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36' };

if (!VIDEO || !OUT) { console.error('用法: hls_get.mjs --video-m3u8 <m3u8> --out <mp4> [--audio-m3u8 ..] [--tmp ..] [--conc 12]'); process.exit(2); }

async function readPlaylist(src) {
  const isUrl = /^https?:/.test(src);
  const text = isUrl ? await (await fetch(src, { headers: UA })).text() : fs.readFileSync(src, 'utf8');
  const base = isUrl ? src.replace(/[^/]*$/, '') : path.dirname(path.resolve(src)) + '/';
  const urls = [];
  for (const line of text.split('\n')) {
    const l = line.trim();
    if (!l || l.startsWith('#')) continue;
    urls.push(/^https?:/.test(l) ? l : base + l);
  }
  return urls;
}

async function grab(url, dest) {
  for (let i = 1; i <= RETRY; i++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 1000) throw new Error('过小 ' + buf.length);
      fs.writeFileSync(dest, buf);
      return buf.length;
    } catch (e) {
      if (i === RETRY) throw new Error(`${path.basename(url)} 失败: ${e.message}`);
      await new Promise((res) => setTimeout(res, 400 * i));
    }
  }
}

async function fetchStream(name, m3u8, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const urls = await readPlaylist(m3u8);
  console.log(`[hls] ${name}: ${urls.length} 段 → ${path.relative(ROOT, dir)}`);
  const files = urls.map((u, i) => path.join(dir, `${String(i).padStart(4, '0')}.ts`));
  let done = 0;
  let total = 0;
  const t0 = Date.now();
  const queue = urls.map((u, i) => ({ u, i }));
  const workers = Array.from({ length: Math.min(CONC, queue.length) }, async () => {
    while (queue.length) {
      const job = queue.shift();
      const n = await grab(job.u, files[job.i]);
      total += n; done++;
      if (done % 20 === 0 || done === urls.length) {
        const s = ((Date.now() - t0) / 1000).toFixed(0);
        console.log(`[hls] ${name}: ${done}/${urls.length} 段 ${(total / 1048576).toFixed(0)}MB ${s}s`);
      }
    }
  });
  await Promise.all(workers);
  const listFile = path.join(dir, 'concat.txt');
  fs.writeFileSync(listFile, files.map((f) => `file '${f.replace(/\\/g, '/')}'`).join('\n'));
  console.log(`[hls] ${name}: 完成 ${(total / 1048576).toFixed(0)}MB / ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  return listFile;
}

const vList = await fetchStream('video', VIDEO, path.join(TMP, 'v'));
const aList = AUDIO ? await fetchStream('audio', AUDIO, path.join(TMP, 'a')) : null;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
const args = ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', vList];
if (aList) args.push('-f', 'concat', '-safe', '0', '-i', aList);
args.push('-c', 'copy', OUT);
console.log('[hls] 合成 mp4 …');
try {
  execFileSync(FFMPEG, args, { stdio: 'inherit' });
} catch (e) {
  console.error('[hls] -c copy 失败，转码兜底');
  const a2 = ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', vList];
  if (aList) a2.push('-f', 'concat', '-safe', '0', '-i', aList);
  a2.push('-c:v', 'libx264', '-crf', '20', '-preset', 'veryfast', '-c:a', 'aac', '-b:a', '192k', OUT);
  execFileSync(FFMPEG, a2, { stdio: 'inherit' });
}
const sz = fs.statSync(OUT).size;
console.log(`[hls] done: ${path.relative(ROOT, OUT)} ${(sz / 1048576).toFixed(1)}MB`);
