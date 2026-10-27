// Network reachability probe from Node (PowerShell/curl were blocked by sandbox policy).
const targets = [
  ['github.com', 'https://github.com'],
  ['api.github.com', 'https://api.github.com/rate_limit'],
  ['objects.githubusercontent', 'https://objects.githubusercontent.com'],
  ['npmmirror', 'https://registry.npmmirror.com/ffmpeg-static'],
  ['pypi', 'https://pypi.org/simple/six/'],
  ['files.pythonhosted', 'https://files.pythonhosted.org'],
  ['tuna-pypi', 'https://pypi.tuna.tsinghua.edu.cn/simple/six/'],
  ['aliyun-pypi', 'https://mirrors.aliyun.com/pypi/simple/six/'],
];

const rows = [];
for (const [name, url] of targets) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(15000), redirect: 'manual' });
    rows.push({ name, status: r.status, ms: Date.now() - t0 });
  } catch (e) {
    rows.push({ name, status: 'FAIL', ms: Date.now() - t0, err: String(e.message).slice(0, 80) });
  }
}
console.table(rows);
