// 下载公开授权真实素材：Big Buck Bunny (Blender Foundation, CC-BY 3.0)
// 源：https://test-videos.co.uk/vids/bigbuckbunny/ （test-videos.co.uk 提供的公开测试片段）
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const ROOT = path.resolve(import.meta.dirname, '..');
const outDir = path.join(ROOT, 'Workspace', 'assets');
await fs.mkdir(outDir, { recursive: true });

const candidates = [
  ['Big_Buck_Bunny_1080_30s_10MB.mp4', 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/1080/Big_Buck_Bunny_1080_30s_10MB.mp4'],
  ['Big_Buck_Bunny_1080_10s_5MB.mp4', 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/1080/Big_Buck_Bunny_1080_10s_5MB.mp4'],
  ['Big_Buck_Bunny_720_10s_1MB.mp4', 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4'],
];

for (const [name, url] of candidates) {
  const dest = path.join(outDir, name);
  try { if ((await fs.stat(dest)).size > 100000) { console.log('[skip]', name); continue; } } catch {}
  const t0 = Date.now();
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(180000), redirect: 'follow' });
    if (!r.ok) { console.log('[fail]', name, r.status); continue; }
    await pipeline(Readable.fromWeb(r.body), createWriteStream(dest));
    const st = await fs.stat(dest);
    console.log(`[ok] ${name} ${(st.size / 1048576).toFixed(2)}MB ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    break; // 拿到一个够用的就停
  } catch (e) { console.log('[fail]', name, String(e.message).slice(0, 60)); }
}
