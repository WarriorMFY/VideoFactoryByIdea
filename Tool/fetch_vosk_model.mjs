#!/usr/bin/env node
/**
 * fetch_vosk_model.mjs — 下载 Vosk 离线 ASR 模型（默认 small-en-us）
 *
 * 为什么自己写下载器：alphacephei.com 单连接只有 ~10-17KB/s，且经常中途断；
 * 实测「多连接分段并行 + 每段独立重试续传」能把 40MB 的模型拉下来且不怕断。
 *
 * 用法：node Tool/fetch_vosk_model.mjs [模型名]
 * 落地：Workspace/asr/models/<模型名>/ + Workspace/cache/vosk_parts/（分段缓存）
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from './lib/ff.mjs';

const name = process.argv[2] || 'vosk-model-small-en-us-0.15';
const modelDir = path.join(ROOT, 'Workspace', 'asr', 'models');
const target = path.join(modelDir, name);
const partsDir = path.join(ROOT, 'Workspace', 'cache', 'vosk_parts', name);
const zip = path.join(ROOT, 'Workspace', 'cache', `${name}.zip`);
const url = `https://alphacephei.com/vosk/models/${name}.zip`;
const WORKERS = Number(process.env.VOSK_WORKERS || 6);
const SEG = 4 * 1024 * 1024;

if (fs.existsSync(target) && fs.readdirSync(target).length > 0) {
  console.log('[ok] 模型已存在:', target);
  process.exit(0);
}
fs.mkdirSync(modelDir, { recursive: true });
fs.mkdirSync(partsDir, { recursive: true });

const head = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(60000) });
const TOTAL = Number(head.headers.get('content-length') || 0);
if (!TOTAL) throw new Error('HEAD 拿不到文件大小');
console.log(`[dl] ${url}  ${(TOTAL / 1048576).toFixed(1)}MB  分段 ${SEG / 1048576}MB × ${WORKERS} 并发`);

const nSeg = Math.ceil(TOTAL / SEG);
const jobs = Array.from({ length: nSeg }, (_, i) => i);
const t0 = Date.now();
let done = 0;

async function fetchSeg(i) {
  const from = i * SEG, to = Math.min(TOTAL - 1, from + SEG - 1);
  const file = path.join(partsDir, `${String(i).padStart(4, '0')}.part`);
  const want = to - from + 1;
  for (let attempt = 0; attempt < 12; attempt++) {
    const have = fs.existsSync(file) ? fs.statSync(file).size : 0;
    if (have >= want) return;
    try {
      const res = await fetch(url, { headers: { range: `bytes=${from + have}-${to}` }, signal: AbortSignal.timeout(300000) });
      if (res.status !== 206) throw new Error(`expect 206 got ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.length) throw new Error('empty');
      fs.appendFileSync(file, buf);
      done += buf.length;
      const el = (Date.now() - t0) / 1000;
      console.log(`  [${i}] ${(fs.statSync(file).size / 1048576).toFixed(1)}/${(want / 1048576).toFixed(1)}MB  总 ${(done / 1048576).toFixed(1)}/${(TOTAL / 1048576).toFixed(1)}MB  ${(done / 1048576 / el).toFixed(2)}MB/s`);
    } catch (e) {
      console.log(`  [${i}] retry: ${String(e.message).slice(0, 50)}`);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw new Error(`分段 ${i} 下载失败`);
}

// 简单并发池
const queue = jobs.slice();
await Promise.all(Array.from({ length: WORKERS }, async () => {
  while (queue.length) await fetchSeg(queue.shift());
}));

// 拼接 + 校验
const out = fs.openSync(zip, 'w');
for (let i = 0; i < nSeg; i++) {
  const buf = fs.readFileSync(path.join(partsDir, `${String(i).padStart(4, '0')}.part`));
  fs.writeSync(out, buf);
}
fs.closeSync(out);
const size = fs.statSync(zip).size;
if (size !== TOTAL) throw new Error(`大小不符 ${size} != ${TOTAL}`);
console.log(`[dl] 完成 ${(size / 1048576).toFixed(1)}MB  ${((Date.now() - t0) / 1000).toFixed(0)}s`);

const r = spawnSync('tar', ['-xf', zip, '-C', modelDir], { stdio: 'inherit' });
if (r.status !== 0) throw new Error('解压失败');
fs.writeFileSync(path.join(modelDir, 'SOURCE.txt'), [
  `model: ${name}`,
  `url: ${url}`,
  `fetched_at: ${new Date().toISOString()}`,
  'license: Apache-2.0（Vosk 模型，Alpha Cephei）',
  'note: 该主机单连接极慢，必须多段并行下载（见 Tool/fetch_vosk_model.mjs）',
].join('\n'));
console.log('[ok] 模型就绪:', target);
