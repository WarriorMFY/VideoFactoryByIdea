// 下载公开授权真实素材：Big Buck Bunny (Blender Foundation, CC-BY 3.0)
// 源：https://test-videos.co.uk/vids/bigbuckbunny/ （公开测试片段；该站时通时断，必须重试 + 校验长度）
//
// 血泪（小循环 4 回归时踩到）：这个站在同一台机器上会「先给 1.4MB 然后断流」，
// 原脚本只要文件 >100KB 就 [skip]，于是拿到一个**截断的 mp4**，后面 loop1 的 real 用例
// 把它当 17s 素材、切点全错、验收 FAIL —— 看起来像代码回归，其实是下载残缺。
// 现在：记录 content-length → 落盘后校验大小 → 不符就删掉重试（最多 5 次）。
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const outDir = path.join(ROOT, 'Workspace', 'assets');
await fs.mkdir(outDir, { recursive: true });
const MIN_BYTES = 100000; // 小于这个视为坏文件（重新下）
const RETRIES = 5;

const candidates = [
  ['Big_Buck_Bunny_1080_30s_10MB.mp4', 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/1080/Big_Buck_Bunny_1080_30s_10MB.mp4'],
  ['Big_Buck_Bunny_1080_10s_5MB.mp4', 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/1080/Big_Buck_Bunny_1080_10s_5MB.mp4'],
  ['Big_Buck_Bunny_720_10s_1MB.mp4', 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4'],
];

async function sizeOf(p) {
  try { return (await fs.stat(p)).size; } catch { return 0; }
}

/** 问服务器「这个文件应该多大」（Range: 0-0 + content-range），拿不到就返回 0 */
async function expectSize(url) {
  try {
    const r = await fetch(url, { headers: { Range: 'bytes=0-0' }, signal: AbortSignal.timeout(20000) });
    const cr = r.headers.get('content-range') || '';
    const total = Number(cr.split('/')[1] || 0);
    try { await r.body?.cancel(); } catch { /* ignore */ }
    if (total) return total;
    const len = Number(r.headers.get('content-length') || 0);
    try { await r.body?.cancel(); } catch { /* ignore */ }
    return r.status === 200 ? len : 0;
  } catch { return 0; }
}

async function download(name, url) {
  const dest = path.join(outDir, name);
  const tmp = `${dest}.part`;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    const t0 = Date.now();
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(180000), redirect: 'follow' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const expect = Number(r.headers.get('content-length') || 0);
      await pipeline(Readable.fromWeb(r.body), createWriteStream(tmp));
      const got = await sizeOf(tmp);
      if (got < MIN_BYTES || (expect && got !== expect)) {
        await fs.rm(tmp, { force: true });
        throw new Error(`长度不符（拿到 ${got} 字节${expect ? `，期望 ${expect}` : ''}），多半是断流`);
      }
      await fs.rename(tmp, dest);
      console.log(`[ok] ${name} ${(got / 1048576).toFixed(2)}MB ${((Date.now() - t0) / 1000).toFixed(1)}s（第 ${attempt} 次尝试）`);
      return true;
    } catch (e) {
      await fs.rm(tmp, { force: true }).catch(() => {});
      console.log(`[retry ${attempt}/${RETRIES}] ${name}: ${String(e.message).slice(0, 70)}`);
      if (attempt < RETRIES) await new Promise((r2) => setTimeout(r2, 1500 * attempt));
    }
  }
  return false;
}

for (const [name, url] of candidates) {
  const dest = path.join(outDir, name);
  const have = await sizeOf(dest);
  if (have >= MIN_BYTES) {
    // 关键：本地文件也可能是「断流残片」，必须问服务器真实长度再比
    const want = await expectSize(url);
    if (!want || Math.abs(have - want) < 1024) { console.log('[skip]', name, `${(have / 1048576).toFixed(2)}MB`); continue; }
    console.log(`[clean] 本地是残缺文件（${have} / 期望 ${want} 字节），删除重下：${name}`);
    await fs.rm(dest, { force: true });
  } else if (have > 0) {
    console.log('[clean] 删除残缺文件', name, `${have} 字节`);
    await fs.rm(dest, { force: true });
  }
  if (await download(name, url)) break; // 拿到一个够用的就停
}
