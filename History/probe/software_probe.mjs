// 探测：能不能下载「现成视频剪辑软件」（GUI NLE / CLI 工具 / 安装包分发渠道）
// 结论取决于两件事：① 域名是否可达、② 速度是否可用（>200KB/s 才算可用）
const targets = [
  // GUI 剪辑软件官方下载页 / 安装包
  ['CapCut 剪映国际版', 'https://www.capcut.com/download'],
  ['剪映国内版', 'https://www.capcut.cn/'],
  ['DaVinci Resolve', 'https://www.blackmagicdesign.com/products/davinciresolve'],
  ['Shotcut', 'https://shotcut.org/download/'],
  ['Kdenlive', 'https://kdenlive.org/en/download/'],
  ['OpenShot', 'https://www.openshot.org/download/'],
  ['VLC', 'https://www.videolan.org/vlc/'],
  ['HandBrake', 'https://handbrake.fr/downloads.php'],
  ['OBS', 'https://obsproject.com/download'],
  ['LosslessCut', 'https://github.com/mifi/lossless-cut/releases/latest'],
  // CLI 自动化剪辑工具
  ['auto-editor (PyPI)', 'https://pypi.org/simple/auto-editor/'],
  ['auto-editor (GitHub rel)', 'https://github.com/WyattBlue/auto-editor/releases/latest'],
  ['MLT/melt (Shotcut 引擎)', 'https://www.mltframework.org/'],
  // 包管理器通道
  ['winget CDN', 'https://cdn.winget.microsoft.com/cache'],
];

for (const [name, url] of targets) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(12000), redirect: 'follow' });
    const buf = await r.arrayBuffer();
    const sec = (Date.now() - t0) / 1000;
    const mb = buf.byteLength / 1048576;
    console.log(`${name.padEnd(24)} ${r.status} ${(buf.byteLength / 1024).toFixed(0)}KB ${sec.toFixed(1)}s ${mb > 0.05 ? (mb / sec).toFixed(2) + 'MB/s' : '(页面)'}  ${r.url.slice(0, 60)}`);
  } catch (e) {
    console.log(`${name.padEnd(24)} FAIL ${String(e.message).slice(0, 46)}`);
  }
}
