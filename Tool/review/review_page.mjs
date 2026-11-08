// review_page.mjs —— 循环评审页生成器
//
// 用途：把一轮小循环的产物（视频/图片）组织成一个可在浏览器看、可分享的单页站点。
// 由 loop42 手工搭站（git 版 index.html + 硬链接 media + ffmpeg 抽封面）提炼而来，
// 目标是把「每轮都手写一遍页面 → 硬链接 → 抽帧 → 发布」压成一条命令。
//
// 用法:
//   node Tool/review/review_page.mjs --config review.json [--out site]//
// 它做什么：
//   1. 读配置，校验每个 file 存在（缺一个就整体失败，不生成半成品页面）
//   2. ffprobe 取时长/分辨率，自动填徽标——配置里不写时长，避免手抄错
//   3. 每个文件抽一帧当封面（posterAt 秒，缺省取 35% 处）
//   4. media/ 用硬链接挂入（同盘零额外磁盘），跨盘自动退化为复制并告警
//   5. 渲染单页 HTML（深色影评风：点击封面加载播放 + 下载 + 步骤链 + 折叠注记）
//   6. 写 review_manifest.json（清单/体积/生成时间/待回填的分享链接）
//
// 它不做什么：**不发布**。发布由调用方执行 workbuddy_sites_deploy(directory=<out>)，
// 因为发布需要人工授权，且是本仓库唯一的对外动作。脚本只打印下一步命令。
//
// 配置结构见同目录 review.md 与 example.review.json。
import { execFileSync } from 'node:child_process';
import {
  readFileSync, writeFileSync, mkdirSync, existsSync, statSync,
  linkSync, copyFileSync, unlinkSync,
} from 'node:fs';
import { join, dirname, resolve, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const FF = join(ROOT, 'Workspace/deps/ffmpeg/ffmpeg.exe');
const FFPROBE = join(ROOT, 'Workspace/deps/ffmpeg/ffprobe.exe');

// ---------- 参数 ----------
const argv = process.argv.slice(2);
const getArg = (k, d) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const CFG_PATH = resolve(getArg('config', 'review.json'));
if (!existsSync(CFG_PATH)) {
  console.error(`找不到配置: ${CFG_PATH}\n用法: node Tool/review/review_page.mjs --config review.json [--out site]`);
  process.exit(1);
}
const CFG = JSON.parse(readFileSync(CFG_PATH, 'utf8'));
const CFG_DIR = dirname(CFG_PATH);
// --out 相对当前工作目录（不是配置目录）：写站点是「我在哪儿执行」的语义
const OUT = resolve(getArg('out', CFG.out || join(CFG_DIR, 'site')));
const MEDIA = join(OUT, 'media');
// 注意：本脚本不做递归删除。宿主环境对 fs 删除打了 safe-delete 补丁（进回收站），
// 大目录 rmSync 会失败——换 slug / 换结构重发前，先在 shell 手动清空输出目录。

// ---------- 收集条目 ----------
const hero = CFG.hero || null;
const sections = CFG.sections || [];
const allItems = [...(hero ? [{ ...hero, __hero: true }] : []),
  ...sections.flatMap(s => (s.items || []).map(it => ({ ...it, __section: s })))];
if (!allItems.length) {
  console.error('配置里没有任何条目（hero 或 sections[].items 至少给一个）');
  process.exit(1);
}

// 相对配置目录解析文件；同时接受相对仓库根
const resolveFile = f => {
  const cands = [resolve(CFG_DIR, f), resolve(ROOT, f)];
  const hit = cands.find(p => existsSync(p));
  if (!hit) {
    console.error(`✗ 文件不存在: ${f}\n  试过: ${cands.join('  |  ')}`);
    process.exit(1);
  }
  return hit;
};

// slug：链接名用 ASCII，避开中文文件名在 URL 上的编码差异；下载名给原文件名
const slugOf = (it, i) => it.slug || `v${String(i + 1).padStart(2, '0')}`;

const fmtDur = s => (s >= 60 ? `${Math.floor(s / 60)}m${(s % 60).toFixed(0)}s` : `${s.toFixed(2)}s`);
const fmtBytes = b => (b >= 1 << 30 ? `${(b / (1 << 30)).toFixed(2)} GB` : `${(b / 1048576).toFixed(1)} MB`);

mkdirSync(MEDIA, { recursive: true });

// ---------- 逐个处理：探测 + 封面 + 硬链接 ----------
const manifest = [];
const seen = new Map();   // src → manifest 条目：同一文件在 hero 与卡片里重复出现时复用同一链接
let totalBytes = 0;

allItems.forEach((it, i) => {
  const src = resolveFile(it.file);
  if (seen.has(src)) {            // 复用：不重复抽帧、不重复占盘
    manifest.push(seen.get(src));
    return;
  }
  const slug = slugOf(it, i);
  const ext = extname(src).toLowerCase();
  const linkName = `${slug}${ext}`;
  const linkPath = join(MEDIA, linkName);

  // 时长 / 分辨率 / 体积
  let dur = null, w = null, h = null;
  try {
    const out = execFileSync(FFPROBE, [
      '-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height:format=duration',
      '-of', 'json', src,
    ], { encoding: 'utf8' });
    const p = JSON.parse(out);
    dur = Number(p.format?.duration) || null;
    w = p.streams?.[0]?.width ?? null;
    h = p.streams?.[0]?.height ?? null;
  } catch (e) {
    console.error(`✗ 探测失败（不是视频？）: ${it.file}`);
    process.exit(1);
  }
  const bytes = statSync(src).size;
  totalBytes += bytes;

  // 硬链接（已存在先删），跨盘退化为复制
  if (existsSync(linkPath)) unlinkSync(linkPath);
  let linked = 'hardlink';
  try {
    linkSync(src, linkPath);
  } catch {
    copyFileSync(src, linkPath);
    linked = 'copy';
    console.warn(`  ⚠ 跨盘或链接失败，改为复制: ${it.file}`);
  }

  // 封面：posterAt 秒；缺省 35% 处（避开片头黑场）
  const posterName = `${slug}.jpg`;
  const posterPath = join(MEDIA, posterName);
  const at = Number.isFinite(it.posterAt) ? it.posterAt : Math.max(0, (dur || 1) * 0.35);
  try {
    execFileSync(FF, [
      '-y', '-loglevel', 'error', '-ss', at.toFixed(3), '-i', src,
      '-frames:v', '1', '-vf', 'scale=720:-1', '-q:v', '3', posterPath,
    ]);
  } catch {
    console.warn(`  ⚠ 抽封面失败，页面将无封面: ${it.file}`);
  }

  const entry = {
    slug, source: it.file, link: `media/${linkName}`,
    poster: existsSync(posterPath) ? `media/${posterName}` : null,
    title: it.title || basename(src), duration: dur, sizeBytes: bytes,
    resolution: w && h ? `${w}x${h}` : null, linked,
  };
  seen.set(src, entry);
  manifest.push(entry);
  console.log(`  ✓ ${slug.padEnd(4)} ${fmtDur(dur || 0).padStart(7)}  ${fmtBytes(bytes).padStart(9)}  ${basename(src)}`);
});

// ---------- HTML 渲染 ----------
const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const stepsHtml = steps => (steps?.length
  ? `<div class="chain">${steps.map(s => {
    const kind = s.kind ? ` ${esc(s.kind)}` : '';
    return `<span class="step${kind}">${esc(s.text)}</span>`;
  }).join('')}</div>`
  : '');

const dlHtml = (m, label) => `<a class="dl" href="${m.link}" download="${esc(basename(m.source))}">
        <svg viewBox="0 0 24 24"><path d="M12 16l-6-6h4V4h4v6h4l-6 6zm-8 2h16v2H4z"/></svg>
        ${esc(label || '下载')} · ${fmtBytes(m.sizeBytes)}
      </a>`;

const posterHtml = m => `<div class="poster" data-src="${m.link}"${m.poster ? ` data-poster="${m.poster}"` : ''}>
        ${m.poster ? `<img src="${m.poster}" alt="${esc(m.title)} 封面" loading="lazy">` : ''}
        <div class="play"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>
      </div>`;

const heroHtml = (it, m) => `<h2>${esc(CFG.heroKicker || '主推')}</h2>
  <div class="hero">
    ${posterHtml(m)}
    <div class="body">
      <div class="row">
        <span class="title">${esc(it.title || m.title)}</span>
        <span class="dur">${fmtDur(m.duration || 0)}</span>
      </div>
      ${it.desc ? `<p class="desc">${esc(it.desc)}</p>` : ''}
      ${stepsHtml(it.steps)}
      ${dlHtml(m, it.downloadLabel || '下载原片')}
    </div>
  </div>`;

const cardHtml = (it, m) => `<div class="card${it.accent ? ` accent${esc(it.accent)}` : ''}">
      ${posterHtml(m)}
      <div class="body">
        <div class="row">
          <span class="title">${esc(it.title || m.title)}</span>
          <span class="dur">${fmtDur(m.duration || 0)}</span>
        </div>
        ${it.desc ? `<p class="desc">${esc(it.desc)}</p>` : ''}
        ${stepsHtml(it.steps)}
        ${dlHtml(m, it.downloadLabel || '下载')}
      </div>
    </div>`;

let mi = 0;
const heroBlock = hero ? heroHtml(allItems[mi++], manifest[0]) : '';
const sectionBlocks = sections.map(sec => {
  const cards = (sec.items || []).map(() => cardHtml(allItems[mi++], manifest[mi - 1])).join('\n\n    ');
  return `  <h2>${esc(sec.name)}</h2>\n  <div class="grid">\n\n    ${cards}\n\n  </div>`;
}).join('\n\n');

const tags = (CFG.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('\n      ');
// notes.items 按 HTML 片段处理（语法条目需要 <b>），其余字段一律转义
const notesBlock = CFG.notes?.items?.length
  ? `  <details${CFG.notes.open ? ' open' : ''}>
    <summary>${esc(CFG.notes.summary || '说明')}</summary>
    <ol>
${CFG.notes.items.map(x => `      <li>${x}</li>`).join('\n')}
    </ol>
  </details>`
  : '';

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(CFG.title)}</title>
<style>
  :root{
    --bg:#0a0908; --card:#141210; --card2:#1a1715; --line:#2a2521;
    --tx:#ece7e1; --tx2:#8d8681; --gold:#c9a35a; --red:#d94f45; --green:#8aa15c;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--bg);color:var(--tx);font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;line-height:1.65;-webkit-font-smoothing:antialiased;padding:0 20px 80px}
  .wrap{max-width:1120px;margin:0 auto}
  header{padding:56px 0 28px;border-bottom:1px solid var(--line);margin-bottom:36px}
  .kicker{font-size:12px;letter-spacing:.22em;color:var(--gold);text-transform:uppercase;margin-bottom:14px}
  h1{font-size:clamp(26px,4vw,40px);font-weight:650;letter-spacing:-.01em;line-height:1.2}
  .sub{color:var(--tx2);font-size:15px;margin-top:12px;max-width:660px}
  .meta{display:flex;flex-wrap:wrap;gap:10px;margin-top:22px}
  .tag{font-size:12px;color:var(--tx2);border:1px solid var(--line);border-radius:999px;padding:4px 12px}
  h2{font-size:15px;font-weight:600;letter-spacing:.06em;color:var(--tx2);margin:44px 0 16px;display:flex;align-items:center;gap:12px}
  h2::after{content:"";flex:1;height:1px;background:var(--line)}
  .hero{background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden}
  .poster{position:relative;cursor:pointer;aspect-ratio:16/9;background:#000;overflow:hidden}
  .poster img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .5s ease}
  .poster:hover img{transform:scale(1.02)}
  .poster::after{content:"";position:absolute;inset:0;background:radial-gradient(circle at 50% 50%,rgba(0,0,0,.15),rgba(0,0,0,.55));transition:opacity .3s}
  .poster .play{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2;width:64px;height:64px;border-radius:50%;border:1px solid rgba(255,255,255,.5);background:rgba(10,9,8,.45);display:grid;place-items:center;backdrop-filter:blur(4px);transition:transform .25s,border-color .25s}
  .poster:hover .play{transform:translate(-50%,-50%) scale(1.08);border-color:var(--gold)}
  .poster .play svg{width:20px;height:20px;fill:var(--tx);margin-left:3px}
  video{width:100%;display:block;background:#000;aspect-ratio:16/9}
  .body{padding:18px 20px 20px}
  .row{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}
  .title{font-size:17px;font-weight:600}
  .dur{font-size:12px;color:var(--tx2);font-variant-numeric:tabular-nums}
  .desc{color:var(--tx2);font-size:13.5px;margin-top:8px}
  .chain{display:flex;flex-wrap:wrap;gap:6px;margin-top:14px}
  .step{font-size:11.5px;font-variant-numeric:tabular-nums;border-radius:6px;padding:3px 9px;background:var(--card2);border:1px solid var(--line);color:var(--tx2)}
  .step.hit{color:#f0b8b3;border-color:#4a2522;background:#241312}
  .step.fast{color:#c8d6a3;border-color:#333d26;background:#1a2015}
  .step.slow{color:#b9c8dd;border-color:#2b3442;background:#171c24}
  .dl{display:inline-flex;align-items:center;gap:7px;margin-top:16px;font-size:13px;color:var(--gold);text-decoration:none;border-bottom:1px solid transparent;transition:border-color .2s}
  .dl:hover{border-color:var(--gold)}
  .dl svg{width:14px;height:14px;fill:currentColor}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden;transition:border-color .25s}
  .card:hover{border-color:#3b342d}
  .accentA{border-top:2px solid #7d8fa3}
  .accentB{border-top:2px solid var(--red)}
  .accentC{border-top:2px solid var(--gold)}
  .accentD{border-top:2px solid var(--green)}
  details{margin-top:40px;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:0 20px}
  summary{cursor:pointer;padding:18px 0;font-size:14px;color:var(--tx);font-weight:550;list-style:none;display:flex;justify-content:space-between;align-items:center}
  summary::-webkit-details-marker{display:none}
  summary::after{content:"＋";color:var(--tx2);font-weight:400}
  details[open] summary::after{content:"－"}
  details ol{padding:0 0 20px 20px;color:var(--tx2);font-size:13.5px}
  details li{margin-bottom:9px}
  details li b{color:var(--tx);font-weight:550}
  footer{margin-top:56px;padding-top:22px;border-top:1px solid var(--line);color:#6b6560;font-size:12px;line-height:1.8}
  footer a{color:#8d8681}
  code{font-family:ui-monospace,Consolas,monospace;font-size:11.5px;color:#9a938c}
</style>
</head>
<body>
<div class="wrap">

  <header>
    <div class="kicker">${esc(CFG.kicker || '')}</div>
    <h1>${esc(CFG.title)}</h1>
    ${CFG.lead ? `<p class="sub">${esc(CFG.lead)}</p>` : ''}
    ${tags ? `<div class="meta">\n      ${tags}\n    </div>` : ''}
  </header>

${heroBlock}

${sectionBlocks}

${notesBlock}

  <footer>
    ${CFG.footer || `由 Tool/review/review_page.mjs 生成 · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`}
  </footer>

</div>
<script>
  document.querySelectorAll('.poster').forEach(el => {
    el.addEventListener('click', () => {
      const v = document.createElement('video');
      v.src = el.dataset.src;
      if (el.dataset.poster) v.poster = el.dataset.poster;
      v.controls = true; v.autoplay = true; v.playsInline = true;
      el.replaceWith(v);
      v.play().catch(() => {});
    }, { once: true });
  });
</script>
</body>
</html>
`;

writeFileSync(join(OUT, 'index.html'), html, 'utf8');

const manifestPath = join(OUT, 'review_manifest.json');
writeFileSync(manifestPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  config: CFG_PATH,
  output: OUT,
  itemCount: manifest.length,
  totalBytes,
  shareLink: CFG.shareLink || null,
  items: manifest,
}, null, 2), 'utf8');

const sizes = manifest.reduce((a, m) => { a[m.linked] = (a[m.linked] || 0) + 1; return a; }, {});
console.log(`\n页面: ${join(OUT, 'index.html')}`);
console.log(`条目: ${manifest.length} · 合计 ${fmtBytes(totalBytes)} · 链接方式 ${Object.entries(sizes).map(([k, v]) => `${k}×${v}`).join(' ')}`);
console.log(`清单: ${manifestPath}`);
console.log(`\n下一步（发布需人工授权）:\n  workbuddy_sites_deploy(directory="${OUT}", language="static")`);
