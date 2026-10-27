// 下载 npm 包 tarball 到本地并解包（npm 直连 vosk 大包会 ECONNRESET，改用 Node 流式下载 + bsdtar）
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const ROOT = path.resolve(import.meta.dirname, '..');
const [pkg, destParent] = process.argv.slice(2);
const REG = 'https://registry.npmmirror.com';

const meta = await (await fetch(`${REG}/${pkg}`, { signal: AbortSignal.timeout(60000) })).json();
const version = process.argv[4] || meta['dist-tags'].latest;
const info = meta.versions[version];
const tarUrl = info.dist.tarball;
const dest = path.resolve(ROOT, destParent);
const tarFile = path.join(dest, `${pkg.replace('/', '__')}-${version}.tgz`);
await fs.mkdir(dest, { recursive: true });

console.log(`[pkg] ${pkg}@${version} size=${(info.dist.unpackedSize / 1048576).toFixed(1)}MB tar=${tarUrl}`);
const t0 = Date.now();
const res = await fetch(tarUrl, { signal: AbortSignal.timeout(600000) });
if (!res.ok) throw new Error(`HTTP ${res.status}`);
let bytes = 0;
const src = Readable.fromWeb(res.body);
src.on('data', (c) => { bytes += c.length; });
await pipeline(src, createWriteStream(tarFile));
console.log(`[pkg] downloaded ${(bytes / 1048576).toFixed(1)}MB in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

// tarball 内是 package/ 目录 -> 解到 node_modules/<name>
const target = path.join(dest, 'node_modules', pkg);
await fs.mkdir(path.join(dest, 'node_modules'), { recursive: true });
await fs.rm(target, { recursive: true, force: true });
await fs.mkdir(target, { recursive: true });
const r = spawnSync('tar', ['-xzf', tarFile, '-C', target, '--strip-components=1'], { stdio: 'inherit' });
if (r.status !== 0) throw new Error('tar 解包失败');
console.log('[pkg] extracted ->', target);
