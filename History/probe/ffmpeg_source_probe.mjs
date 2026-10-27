// Probe which ffmpeg binary source is downloadable, and probe pip mirror speed from node side.
const targets = [
  ['gyan-essentials', 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip'],
  ['BtbN-gpl-latest', 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip'],
  ['npmffmpeg-installer', 'https://registry.npmmirror.com/@ffmpeg-installer/win32-x64/-/win32-x64-1.1.0.tgz'],
  ['npm-ffmpeg-static', 'https://registry.npmmirror.com/ffmpeg-static'],
];

for (const [name, url] of targets) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { method: 'GET', headers: { range: 'bytes=0-1023' }, signal: AbortSignal.timeout(20000), redirect: 'follow' });
    const buf = await r.arrayBuffer();
    console.log(name, '->', r.status, 'len', buf.byteLength, 'ctype', r.headers.get('content-type'), 'accept-ranges', r.headers.get('accept-ranges'), `${Date.now() - t0}ms`, 'final', r.url.slice(0, 90));
  } catch (e) {
    console.log(name, '-> FAIL', String(e.message).slice(0, 100), `${Date.now() - t0}ms`);
  }
}
