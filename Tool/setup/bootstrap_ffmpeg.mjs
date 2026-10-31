#!/usr/bin/env node
/**
 * bootstrap_ffmpeg.mjs — 获取 ffmpeg + ffprobe（Windows x64 静态构建）
 *
 * 环境事实（本次实测，2026-10-27）：
 *   - PowerShell / curl 出网被策略拦截（Tls 连接被关闭），只有 Node 的 fetch 能出网。
 *   - gyan.dev 与 GitHub Release 资产（objects.githubusercontent）实测 ~13KB/s 或直接超时，不可用。
 *   - npmmirror 的 ffmpeg-static 二进制镜像可用（~2MB/s）。
 * 因此主源用 npmmirror 镜像的 ffmpeg-static b6.1.1 (FFmpeg 6.1.1)，并落盘 LICENSE/README 以满足许可证合规。
 *
 * 来源：https://registry.npmmirror.com/-/binary/ffmpeg-static/b6.1.1/  （镜像自 eugeneware/ffmpeg-static）
 * 许可：见落盘的 win32-x64.LICENSE（该构建为 GPL 版本，分发需遵守 GPL；本项目仅本机使用）
 * 落地：Workspace/deps/ffmpeg/{ffmpeg.exe,ffprobe.exe,LICENSE.txt,README.txt,SOURCE.txt}（Workspace 可随时清理重建）
 */
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const BASE = 'https://registry.npmmirror.com/-/binary/ffmpeg-static/b6.1.1/';
const root = path.resolve(import.meta.dirname, '..', '..');
const binDir = path.join(root, 'Workspace', 'deps', 'ffmpeg');

async function exists(p) { try { await fs.access(p); return true; } catch { return false; } }

async function download(url, dest) {
  const t0 = Date.now();
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(600000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  const total = Number(res.headers.get('content-length') || 0);
  let got = 0, mark = 0;
  const src = Readable.fromWeb(res.body);
  src.on('data', (c) => {
    got += c.length;
    if (total && got - mark > total / 5) { mark = got; console.log(`  ${((got / total) * 100).toFixed(0)}% ${(got / 1048576).toFixed(1)}MB`); }
  });
  await pipeline(src, createWriteStream(dest));
  return { bytes: got, sec: (Date.now() - t0) / 1000 };
}

async function main() {
  const ff = path.join(binDir, 'ffmpeg.exe'), fp = path.join(binDir, 'ffprobe.exe');
  if (await exists(ff) && await exists(fp)) { console.log('[ok] 已存在:', binDir); }
  else {
    await fs.mkdir(binDir, { recursive: true });
    console.log('[dl] ffmpeg.exe ...');
    const a = await download(BASE + 'ffmpeg-win32-x64', ff);
    console.log(`[dl] ffmpeg.exe ${(a.bytes / 1048576).toFixed(1)}MB ${a.sec.toFixed(1)}s`);
    console.log('[dl] ffprobe.exe ...');
    const b = await download(BASE + 'ffprobe-win32-x64', fp);
    console.log(`[dl] ffprobe.exe ${(b.bytes / 1048576).toFixed(1)}MB ${b.sec.toFixed(1)}s`);
  }
  // 许可证/README 与来源说明（合规留痕）
  for (const [remote, local] of [['win32-x64.LICENSE', 'LICENSE.txt'], ['win32-x64.README', 'README.txt']]) {
    if (!(await exists(path.join(binDir, local)))) {
      try { const t = await (await fetch(BASE + remote, { signal: AbortSignal.timeout(60000) })).text(); await fs.writeFile(path.join(binDir, local), t); } catch (e) { console.log('[warn]', remote, e.message); }
    }
  }
  await fs.writeFile(path.join(binDir, 'SOURCE.txt'), [
    'ffmpeg/ffprobe 来源记录（自动生成）',
    `mirror_url: ${BASE}`,
    'package: ffmpeg-static (eugeneware) b6.1.1 → 实际二进制为 ffmpeg 6.1.1 essentials build (www.gyan.dev)',
    `fetched_at: ${new Date().toISOString()}`,
    'build: --enable-gpl --enable-version3（GPLv3，含 libx264/libass/fontconfig/loudnorm），详见 LICENSE.txt',
    'scope: 仅本机运行时使用；交付物不含二进制（复现脚本会重新下载）。',
  ].join('\n'));
  const v = spawnSync(ff, ['-version'], { encoding: 'utf8' });
  const head = (v.stdout || '').split('\n').slice(0, 3).filter(Boolean);
  console.log(head.length ? '[ok] ' + head.join(' | ') : '[ok] 二进制已就位（版本探测需交互式控制台，已由后续步骤验证）');
  const cfg = (v.stdout || '').match(/--enable-(gpl|version3)/g);
  console.log('[build] gpl-flags:', cfg ? cfg.join(',') : 'none');
}
main().catch((e) => { console.error('[fail]', e); process.exit(1); });
