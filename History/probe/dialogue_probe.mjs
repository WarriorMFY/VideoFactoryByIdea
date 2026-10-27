// 探测：带大量英语对白的真实素材（Tears of Steel / Sintel 各镜像 + test-videos 的 Sintel 片段）
const cands = [
  ['tv-sintel-1080-10s', 'https://test-videos.co.uk/vids/sintel/mp4/h264/1080/Sintel_1080_10s_5MB.mp4'],
  ['tv-sintel-720-10s', 'https://test-videos.co.uk/vids/sintel/mp4/h264/720/Sintel_720_10s_1MB.mp4'],
  ['nluug-tos-1080', 'https://ftp.nluug.nl/pub/graphics/blender/demo/movies/ToS/tearsofsteel_1080p.mov'],
  ['nluug-sintel', 'https://ftp.nluug.nl/pub/graphics/blender/demo/movies/Sintel/sintel_trailer-1080p.mp4'],
  ['dotsrc-tos', 'https://mirrors.dotsrc.org/blender/demo/movies/ToS/tearsofsteel_1080p.mov'],
  ['fau-tos', 'https://ftp.fau.de/blender/demo/movies/ToS/tearsofsteel_1080p.mov'],
  ['aarnet-tos', 'https://mirror.aarnet.edu.au/pub/blender/demo/movies/ToS/tearsofsteel_1080p.mov'],
  ['w3c-sintel-trailer', 'https://media.w3.org/2010/05/sintel/trailer.mp4'],
];

for (const [name, url] of cands) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { headers: { range: 'bytes=0-1048575' }, signal: AbortSignal.timeout(20000), redirect: 'follow' });
    const buf = await r.arrayBuffer();
    const sec = (Date.now() - t0) / 1000;
    const mb = buf.byteLength / 1048576;
    console.log(`${name.padEnd(22)} ${String(r.status).padEnd(4)} ${mb.toFixed(2)}MB ${sec.toFixed(1)}s ${(mb / sec).toFixed(2)}MB/s ${r.headers.get('content-range') || ''}`);
  } catch (e) {
    console.log(`${name.padEnd(22)} FAIL ${String(e.message).slice(0, 44)}`);
  }
}
