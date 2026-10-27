// 探测：能拿到「带音轨的真实视频」的源（外语素材验证用）
const cands = [
  ['w3c-sintel-trailer', 'https://media.w3.org/2010/05/sintel/trailer.mp4'],
  ['w3c-bunny-trailer', 'https://media.w3.org/2010/05/bunny/trailer.mp4'],
  ['w3c-movie_300', 'https://media.w3.org/2010/05/video/movie_300.mp4'],
  ['w3c-movie_300.webm', 'https://media.w3.org/2010/05/video/movie_300.webm'],
  ['google-gtv-ForBiggerBlazes', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'],
  ['google-gtv-ForBiggerEscapes', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4'],
  ['google-gtv-BigBuckBunny', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'],
  ['filesamples-640x360', 'https://filesamples.com/samples/video/mp4/sample_640x360.mp4'],
  ['learningcontainer-mp4', 'https://www.learningcontainer.com/wp-content/uploads/2020/05/sample-mp4-file.mp4'],
  ['upload.wikimedia-test', 'https://upload.wikimedia.org/wikipedia/commons/transcoded/c/c0/Big_Buck_Bunny_4K.webm/Big_Buck_Bunny_4K.webm.360p.webm'],
  ['test-videos-index', 'https://test-videos.co.uk/'],
];

for (const [name, url] of cands) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { headers: { range: 'bytes=0-2097151' }, signal: AbortSignal.timeout(20000), redirect: 'follow' });
    const buf = await r.arrayBuffer();
    const sec = (Date.now() - t0) / 1000;
    const mb = buf.byteLength / 1048576;
    const ct = r.headers.get('content-type') || '';
    const range = r.headers.get('content-range') || '';
    console.log(`${name.padEnd(30)} ${String(r.status).padEnd(4)} ${mb.toFixed(2)}MB ${sec.toFixed(1)}s ${(mb / sec).toFixed(2)}MB/s  ${ct.slice(0, 28)}  ${range}`);
  } catch (e) {
    console.log(`${name.padEnd(30)} FAIL ${String(e.message).slice(0, 46)}`);
  }
}
