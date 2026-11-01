#!/usr/bin/env node
/**
 * bootstrap_asr.mjs — 准备离线 ASR / TTS 依赖（不依赖 npm install）
 *
 * 为什么不用 npm install：本沙箱下 npm 安装 vosk 这类含大二进制/安装脚本的包会失败
 * （ECONNRESET 或 "operation was rejected by your operating system"）。
 * 而 Node 的 fetch + Windows 自带 bsdtar 可以稳定地把 tarball 拉下来解包，因此自己实现。
 *
 * 依赖清单（全部从 npmmirror 镜像取，来源/许可记录在 Workspace/deps/asr/DEPENDENCIES.md）：
 *   koffi                     MIT       —— 预编译 FFI，用来直连 libvosk.dll（不依赖需编译的 ffi-napi）
 *   @koromix/koffi-win32-x64  MIT       —— koffi 的 Windows 原生二进制
 *   vosk                      Apache-2.0—— Vosk 语音识别 SDK（内含 win-x86_64/libvosk.dll）
 *   @andresaya/edge-tts       MIT       —— Edge 神经 TTS（造测试素材用）
 *   ws                        MIT       —— edge-tts 的 WebSocket 依赖
 *
 * 用法：node Tool/bootstrap_asr.mjs
 */
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ROOT } from '../lib/ff.mjs';

const REG = 'https://registry.npmmirror.com';
const DEST = path.join(ROOT, 'Workspace', 'deps', 'asr');
const NM = path.join(DEST, 'node_modules');
const CACHE = path.join(ROOT, 'Workspace', 'cache', 'npm-tarballs');

const PKGS = [
  ['koffi', null],
  ['@koromix/koffi-win32-x64', null],
  ['vosk', '0.3.39'],
  ['@andresaya/edge-tts', null],
  ['ws', null],
];

async function fetchTarball(pkg, version) {
  const res = await fetch(`${REG}/${pkg.replace('/', '%2F')}`, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`meta ${pkg}: HTTP ${res.status}`);
  const meta = await res.json();
  const v = version || meta['dist-tags'].latest;
  const info = meta.versions[v];
  if (!info) throw new Error(`${pkg}@${v} 不存在`);
  const tarName = `${pkg.replace('/', '__')}-${v}.tgz`;
  const tarPath = path.join(CACHE, tarName);
  if (!fsSync.existsSync(tarPath) || fsSync.statSync(tarPath).size < 1024) {
    const r = await fetch(info.dist.tarball, { signal: AbortSignal.timeout(600000) });
    if (!r.ok) throw new Error(`tarball ${pkg}: HTTP ${r.status}`);
    await pipeline(Readable.fromWeb(r.body), createWriteStream(tarPath));
  }
  return { pkg, version: v, tarPath, unpacked: info.dist.unpackedSize || 0 };
}

async function main() {
  await fs.mkdir(path.join(DEST), { recursive: true });
  await fs.mkdir(NM, { recursive: true });
  await fs.mkdir(CACHE, { recursive: true });
  // 一个空的 package.json，避免上游 npm 再去接管这个目录
  const pj = path.join(DEST, 'package.json');
  if (!fsSync.existsSync(pj)) {
    await fs.writeFile(pj, JSON.stringify({ name: 'vfactory-asr', private: true, type: 'commonjs', note: '依赖由 Tool/bootstrap_asr.mjs 解包，不走 npm install' }, null, 2));
  }
  await fs.writeFile(path.join(DEST, 'index.cjs'), '// 供 createRequire 使用的本地锚点文件\n');

  const rows = [];
  for (const [pkg, ver] of PKGS) {
    const target = path.join(NM, pkg);
    if (fsSync.existsSync(path.join(target, 'package.json'))) {
      rows.push(`${pkg}  已存在`);
      continue;
    }
    const { version, tarPath, unpacked } = await fetchTarball(pkg, ver);
    await fs.mkdir(target, { recursive: true });
    // 坑（2026-10-31 本机实测）：Node 在 Windows 上解析到的 tar 是 system32 的 bsdtar，
    // 它会把绝对路径 `F:\...` 里的盘符当成远程主机（"Cannot connect to F: resolve failed"）。
    // 规避：cwd 切到缓存目录、参数全部用相对路径，任何 tar 实现都不会误判。
    const relTar = path.basename(tarPath);
    // bsdtar 对反斜杠相对路径（..\\..\\asr\\...）会打不开，统一转成正斜杠
    const relTarget = path.relative(CACHE, target).split(path.sep).join('/');
    const r = spawnSync('tar', ['-xzf', relTar, '-C', relTarget, '--strip-components=1'], { stdio: 'inherit', cwd: CACHE });
    if (r.status !== 0) throw new Error(`${pkg} 解包失败`);
    rows.push(`${pkg}@${version}  ${(unpacked / 1048576).toFixed(1)}MB`);
  }
  console.log('[asr] ' + rows.join(' | '));

  const deps = [
    '| 包 | 版本 | 许可 | 用途 |', '| --- | --- | --- | --- |',
    '| koffi | 3.3.4 | MIT | 预编译 FFI，直连 libvosk.dll |',
    '| @koromix/koffi-win32-x64 | 3.3.4 | MIT | koffi Windows 原生二进制 |',
    '| vosk | 0.3.39 | Apache-2.0 | 离线语音识别 SDK（libvosk.dll） |',
    '| @andresaya/edge-tts | 1.9.x | MIT | Edge 神经 TTS（造测试素材） |',
    '| ws | 8.x | MIT | edge-tts 的 WebSocket 依赖 |',
    '',
    `安装方式：node Tool/bootstrap_asr.mjs（npmmirror tarball 解包，不依赖 npm install / 无编译）`,
    `时间：${new Date().toISOString()}`,
  ].join('\n');
  await fs.writeFile(path.join(DEST, 'DEPENDENCIES.md'), deps);
  console.log('[asr] ->', path.relative(ROOT, NM));
}
main().catch((e) => { console.error('[fail]', e.message); process.exit(1); });
