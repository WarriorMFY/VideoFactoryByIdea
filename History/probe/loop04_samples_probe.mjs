// History/probe/loop04_samples_probe.mjs — 小循环 4：找「带英文人声」的可下载样本
// 只测可达性 + 体积 + 类型（是否有人声要等 ASR 才能定量，这里先用音轨存在与否筛）
// 背景：本机出网可用站点见 Tool/env.md §一（media.w3.org 快、test-videos.co.uk 可、Wikimedia/HF 不可达）
const CANDIDATES = [
  ['w3-sintel-trailer', 'https://media.w3.org/2010/05/sintel/trailer.mp4'],
  ['w3-sintel-webm', 'https://media.w3.org/2010/05/sintel/trailer.webm'],
  ['w3-bunny-trailer', 'https://media.w3.org/2010/05/bunny/trailer.mp4'],
  ['w3-bunny-movie', 'https://media.w3.org/2010/05/bunny/movie.mp4'],
  ['w3-movie300', 'https://media.w3.org/2010/05/video/movie_300.mp4'],
  ['w3-movie300-webm', 'https://media.w3.org/2010/05/video/movie_300.webm'],
  ['w3-movie300-ogv', 'https://media.w3.org/2010/05/video/movie_300.ogv'],
  ['tv-sintel-720-10s', 'https://test-videos.co.uk/vids/sintel/mp4/h264/720/Sintel_720_10s_2MB.mp4'],
  ['tv-bbb-720-10s', 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_2MB.mp4'],
  ['tv-jellyfish-720-10s', 'https://test-videos.co.uk/vids/jellyfish/mp4/h264/720/Jellyfish_720_10s_1MB.mp4'],
];

const LISTS = ['https://media.w3.org/2010/05/', 'https://media.w3.org/2010/05/video/', 'https://media.w3.org/2010/05/sintel/'];

async function head(url) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) return { ok: false, status: r.status, ms: Date.now() - t0, note: `HTTP ${r.status}` };
    const len = Number(r.headers.get('content-length') || 0);
    const type = r.headers.get('content-type') || '';
    try { await r.body?.cancel(); } catch { /* ignore */ }
    return { ok: true, status: r.status, len, type, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, note: String(e.message).slice(0, 50) };
  }
}

console.log('=== 目录清单（能不能列目录，便于找更多样本）===');
for (const url of LISTS) {
  const r = await head(url);
  if (!r.ok) { console.log(`  ${r.note.padEnd(28)} ${url}`); continue; }
  console.log(`  HTTP ${r.status}  ${r.type}  ${url}`);
  try {
    const html = await (await fetch(url, { signal: AbortSignal.timeout(20000) })).text();
    const links = [...html.matchAll(/href="([^"]+)"/gi)].map((m) => m[1]).filter((h) => /\.(mp4|webm|ogv|ogg|avi|mov|wav|mp3)$/i.test(h));
    console.log(`    media: ${[...new Set(links)].slice(0, 40).join('  ') || '(无媒体链接)'}`);
  } catch (e) { console.log(`    (读取目录失败: ${String(e.message).slice(0, 40)})`); }
}

console.log('\n=== 候选样本可达性 ===');
for (const [name, url] of CANDIDATES) {
  const r = await head(url);
  const size = r.len ? `${(r.len / 1048576).toFixed(1)}MB` : '-';
  console.log(`  ${r.ok ? 'OK  ' : 'FAIL'}  ${name.padEnd(20)} ${size.padStart(7)}  ${String(r.ms).padStart(6)}ms  ${r.ok ? r.type : r.note}`);
}
