// 真实素材候选源测速（公开授权短片）
const list = [
  ['BBB-720-10s-1MB', 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4'],
  ['BBB-1080-30s', 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/1080/Big_Buck_Bunny_1080_10s_5MB.mp4'],
  ['sintel-trailer', 'https://download.blender.org/durian/trailer/sintel_trailer-720p.mp4'],
  ['jellyfish', 'https://test-videos.co.uk/vids/jellyfish/mp4/h264/720/Jellyfish_720_10s_1MB.mp4'],
  ['sample-videos', 'https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4'],
];
for (const [name, url] of list) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { headers: { range: 'bytes=0-2097151' }, signal: AbortSignal.timeout(20000), redirect: 'follow' });
    const b = await r.arrayBuffer();
    const sec = (Date.now() - t0) / 1000;
    console.log(`${name}: ${r.status} ${(b.byteLength / 1048576).toFixed(2)}MB ${sec.toFixed(1)}s ${(b.byteLength / 1048576 / sec).toFixed(2)}MB/s total=${r.headers.get('content-range')}`);
  } catch (e) {
    console.log(`${name}: FAIL ${String(e.message).slice(0, 60)}`);
  }
}
