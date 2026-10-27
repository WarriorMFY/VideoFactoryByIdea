// 测速：候选下载源的吞吐（下载固定字节数，算 MB/s），用于挑选最快的 ffmpeg 来源
const candidates = [
  ['gyan-essentials', 'https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-9.0.2-essentials_build.zip', 4 * 1024 * 1024],
  ['BtbN-gpl', 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip', 4 * 1024 * 1024],
  ['npmmirror-bin-list', 'https://registry.npmmirror.com/-/binary/ffmpeg-static/', 64 * 1024],
];

async function timed(name, url, bytes) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { headers: { range: `bytes=0-${bytes - 1}` }, signal: AbortSignal.timeout(90000), redirect: 'follow' });
    const buf = await r.arrayBuffer();
    const sec = (Date.now() - t0) / 1000;
    console.log(`${name}: ${r.status} ${(buf.byteLength / 1048576).toFixed(2)}MB in ${sec.toFixed(1)}s = ${(buf.byteLength / 1048576 / sec).toFixed(2)} MB/s  final=${r.url.slice(0, 70)}`);
    if (name === 'npmmirror-bin-list' && buf.byteLength < 200000) console.log(new TextDecoder().decode(buf).slice(0, 1500));
  } catch (e) {
    console.log(`${name}: FAIL ${String(e.message).slice(0, 80)} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
}

await Promise.all(candidates.map(([n, u, b]) => timed(n, u, b)));
