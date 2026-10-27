// 在 Wikimedia Commons 找一段「短、小、且带音轨」的 CC 视频（用于真实音轨测试）
const API = 'https://commons.wikimedia.org/w/api.php';

async function j(url) {
  const r = await fetch(url, { headers: { 'user-agent': 'DSH-VideoFactory/0.1 (local research)' }, signal: AbortSignal.timeout(30000) });
  return r.json();
}

// 1) 搜索短视频
const search = `${API}?action=query&format=json&list=search&srnamespace=6&srlimit=25&srsearch=filetype:video%20horse`;
const s = await j(search);
const titles = (s.query?.search || []).map((x) => x.title);
console.log('candidates:', titles.length);

// 2) 取 videoinfo（含 derivatives 转码版本）
for (const chunk of [titles.slice(0, 8)]) {
  const info = await j(`${API}?action=query&format=json&prop=videoinfo&viprop=size|derivatives|metadata&titles=${encodeURIComponent(chunk.join('|'))}`);
  for (const page of Object.values(info.query?.pages || {})) {
    const vi = page.videoinfo?.[0];
    if (!vi) continue;
    const ders = (vi.derivatives || []).map((d) => `${d.transcodekey || d.type}:${d.width}x${d.height}:${(d.size / 1048576).toFixed(1)}MB`).join(' ');
    console.log(`- ${page.title} src=${(vi.size / 1048576).toFixed(1)}MB ${vi.width}x${vi.height} ${vi.duration}s`);
    console.log(`    derivatives: ${ders || 'none'}`);
    const small = (vi.derivatives || []).filter((d) => d.size < 12 * 1048576).sort((a, b) => a.size - b.size)[0];
    if (small) console.log(`    small_url: ${small.src}`);
    if (small && vi.duration < 40) { console.log('    PICK:', small.src); break; }
  }
}
