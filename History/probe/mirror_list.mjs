// 查 npmmirror 二进制镜像里可用的 ffmpeg / ffprobe Windows 版本
async function list(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
  const j = await r.json();
  return j;
}
function pick(entries) {
  return entries.map((e) => `${e.name}${e.size ? ` (${(e.size / 1048576).toFixed(1)}MB)` : ''}`).join('  |  ');
}
for (const pkg of ['ffmpeg-static', 'ffprobe-static', 'ffmpeg']) {
  try {
    const j = await list(`https://registry.npmmirror.com/-/binary/${pkg}/`);
    console.log(`\n### ${pkg}: ${j.length} dirs`);
    const names = j.map((e) => e.name);
    console.log('versions:', names.slice(-8).join(', '));
    const last = j[j.length - 1];
    const j2 = await list(last.url);
    console.log(`  ${last.name}:`, 'dirs=', j2.map((e) => e.name).join(', '));
    const win = j2.find((e) => /win32|win/i.test(e.name));
    if (win) {
      const j3 = await list(win.url);
      console.log(`  ${last.name}${win.name}:`, pick(j3));
    }
  } catch (e) {
    console.log(`\n### ${pkg}: FAIL ${String(e.message).slice(0, 90)}`);
  }
}
