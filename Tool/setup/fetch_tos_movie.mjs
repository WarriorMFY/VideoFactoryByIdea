#!/usr/bin/env node
/**
 * fetch_tos_movie.mjs — 小循环 4：从 nluug 镜像下载 Tears of Steel（真人实拍，含大量英语对白）
 *
 * 为什么值得：这是本轮唯一能找到的「真实电影 + 官方英文/中文字幕」组合，
 *   - TOS-en.srt  → 可当**真值**，于是真实素材第一次能算 WER（小循环 3 只能 reference-free）
 *   - TOS-CH.srt  → 官方人工中文翻译，可当**机翻质量的参照**
 * 授权：Tears of Steel © Blender Foundation，CC-BY 3.0（见 Workspace/assets/tos/copyright.txt）
 *
 * 为什么自己写：单连接实测 nluug 只有 0.06–0.07MB/s，dotsrc 单连接 0.47MB/s，
 *   两家都支持 Range 且并行能再提速 → 先挑快的镜像，再多线程分段写同一文件。
 * 用法：node Tool\setup\fetch_tos_movie.mjs [--threads 8] [--part 4MB] [--mirror <base>]
 * 输出：Workspace/assets/tos/tears_of_steel_720p.mov（372MB）+ `.complete` 标记
 *   注意：文件被预分配成最终大小，所以"已下载完"只能看 `.complete`，不能只看 size。
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../lib/ff.mjs';

const args = process.argv.slice(2);
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const THREADS = Number(getOpt('--threads', 8));
const PART = Number(getOpt('--part', String(4 * 1024 * 1024)));
const FILE = 'tears_of_steel_720p.mov';
// 实测（2026-10-27）：dotsrc 0.47MB/s > nluug 0.07MB/s；gwdg/leaseweb/kumi 404，halifax/clarkson 超时
const MIRRORS = [
  'https://mirrors.dotsrc.org/blender/demo/movies/ToS/',
  'https://ftp.nluug.nl/pub/graphics/blender/demo/movies/ToS/',
];
const DIR = path.join(ROOT, 'Workspace', 'assets', 'tos');
const DEST = path.join(DIR, FILE);
const DONE = path.join(DIR, '.complete');
fs.mkdirSync(DIR, { recursive: true });

if (fs.existsSync(DONE) && fs.existsSync(DEST)) {
  console.log(`[tos] 已完成（看 .complete 标记），跳过：${(fs.statSync(DEST).size / 1048576).toFixed(1)}MB`);
  process.exit(0);
}
fs.rmSync(DONE, { force: true });

const forced = getOpt('--mirror', null);
const candidates = forced ? [forced.endsWith('/') ? forced : `${forced}/`] : MIRRORS;
let base = null;
for (const b of candidates) {
  try {
    const t0 = Date.now();
    const r = await fetch(b + FILE, { headers: { Range: 'bytes=0-1048575' }, signal: AbortSignal.timeout(25000) });
    if (r.status !== 206 && r.status !== 200) throw new Error(`HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    const mbs = buf.length / 1048576 / ((Date.now() - t0) / 1000);
    console.log(`[tos] 测速 ${new URL(b).hostname}: ${mbs.toFixed(2)}MB/s`);
    if (!base || mbs >= 0.3) base = b;
    if (mbs >= 0.3) break;
  } catch (e) {
    console.log(`[tos] 镜像不可用 ${new URL(b).hostname}: ${String(e.message).slice(0, 50)}`);
  }
}
if (!base) { console.error('[tos] 所有镜像都不可用'); process.exit(1); }
const SRC = base + FILE;   // 别叫 URL：会遮蔽全局 URL（TDZ 报错）
console.log(`[tos] 采用 ${base}`);

// 1) 取总长度
let total = 0;
{
  const r = await fetch(SRC, { headers: { Range: 'bytes=0-0' }, signal: AbortSignal.timeout(30000) });
  const cr = r.headers.get('content-range') || '';
  total = Number(cr.split('/')[1] || 0);
  try { await r.body?.cancel(); } catch { /* ignore */ }
  if (!total) throw new Error(`拿不到文件长度（content-range=${cr}）`);
}
console.log(`[tos] 目标 ${(total / 1048576).toFixed(1)}MB，${THREADS} 线程 × ${(PART / 1048576).toFixed(0)}MB/段`);

// 2) 预分配（稀疏写：不先占满磁盘，但保证各段能 seek 写入）
const fd = fs.openSync(DEST, 'w');
fs.ftruncateSync(fd, total);
fs.closeSync(fd);

// 3) 并行分段下载 + 写入（每段独立重试）
const chunks = [];
for (let off = 0; off < total; off += PART) chunks.push({ off, end: Math.min(off + PART, total) - 1 });
let doneBytes = 0;
let failed = 0;
let idx = 0;
const t0 = Date.now();

async function worker(n) {
  while (true) {
    const i = idx++;
    if (i >= chunks.length) return;
    const { off, end } = chunks[i];
    let ok = false;
    for (let attempt = 0; attempt < 4 && !ok; attempt++) {
      try {
        const r = await fetch(SRC, { headers: { Range: `bytes=${off}-${end}` }, signal: AbortSignal.timeout(180000) });
        if (r.status !== 206 && r.status !== 200) throw new Error(`HTTP ${r.status}`);
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length !== end - off + 1) throw new Error(`长度不符 ${buf.length} != ${end - off + 1}`);
        const f = fs.openSync(DEST, 'r+');
        fs.writeSync(f, buf, 0, buf.length, off);
        fs.closeSync(f);
        doneBytes += buf.length;
        ok = true;
      } catch (e) {
        if (attempt === 3) { failed++; console.log(`  [fail] 段 ${i} (${(off / 1048576).toFixed(0)}MB): ${String(e.message).slice(0, 60)}`); }
        else await new Promise((r2) => setTimeout(r2, 1500 * (attempt + 1)));
      }
    }
  }
}

const timer = setInterval(() => {
  const sec = (Date.now() - t0) / 1000;
  const mbs = doneBytes / 1048576 / sec;
  console.log(`  ${(doneBytes / 1048576).toFixed(1)}/${(total / 1048576).toFixed(0)}MB ${mbs.toFixed(2)}MB/s 剩余约 ${Math.max(0, Math.round((total - doneBytes) / 1048576 / Math.max(mbs, 0.01) / 60))} 分钟`);
}, 20000);

await Promise.all(Array.from({ length: THREADS }, (_, i) => worker(i)));
clearInterval(timer);

const size = fs.statSync(DEST).size;
console.log(`[tos] 完成 ${(size / 1048576).toFixed(1)}MB / 用时 ${((Date.now() - t0) / 1000 / 60).toFixed(1)} 分钟 / 失败段 ${failed} → ${path.relative(ROOT, DEST)}`);
if (size !== total || failed > 0) {
  console.error(`[tos] 不完整（失败段 ${failed}），请重跑本脚本（会整段重下，已完成的段不做续传）`);
  process.exit(1);
}
fs.writeFileSync(DONE, `${new Date().toISOString()} ${total} bytes ${base}\n`);
console.log('[tos] 已写 .complete 标记');
