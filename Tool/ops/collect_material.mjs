#!/usr/bin/env node
/**
 * collect_material.mjs — 素材采集线（loop27 升格）
 *
 * 目标：为工厂提供「稳定、可灵活选择代价层级」的素材采集入口。
 * 层级（代价从低到高）：
 *   L0 库内复用     —— 0 积分 0 流量，先查 manifest 再谈采集
 *   L1 开放授权网采 —— 0 积分，NASA(PD) / Wikimedia Commons / Openverse(CC0,PDM,CC-BY)，
 *                      授权与署名自动登记进 manifest
 *   L2 待核授权网采 —— 0 积分 + 人工核授权；NC/ND/未知授权候选只进 quarantine/，不进 library/
 *   L3 AI 生成      —— 消耗积分；brief 出采集简报，agent 执行 ImageGen/VideoGen 后 register 入库（AI 声明纪律）
 *
 * 用法：
 *   node Tool/ops/collect_material.mjs plan   --need "重史诗感" [--type image|video|any]
 *   node Tool/ops/collect_material.mjs fetch  --need "重史诗感" [--type any] [--limit 8] [--concurrency 6] [--source nasa,wiki,ov]
 *   node Tool/ops/collect_material.mjs list   [--type image] [--tag 史诗感] [--need "重史诗感"]
 *   node Tool/ops/collect_material.mjs register --path <file> [--tags a,b] [--note "..."] [--cost L3]
 *   node Tool/ops/collect_material.mjs brief  --need "重史诗感" [--type image|video|any] [--count 4]
 *
 * 库结构：
 *   Material/manifest.jsonl   总账（版本化，一行一素材）
 *   Material/library/<type>/  正式库（L1 已核授权 + register 登记的产物）
 *   Material/quarantine/      待核授权区（L2，人工确认授权后方可 promote）
 *   Material/inbox/<run>/     采集暂存（本次运行原始落点，入库后保留原件）
 *   Material/briefs/          L3 采集简报
 * 采集回执：History/runs/materials/<run_id>.json
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { ROOT, ffprobeJson } from '../lib/ff.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MATERIAL = path.join(ROOT, 'Material');
const LIB = path.join(MATERIAL, 'library');
const QUAR = path.join(MATERIAL, 'quarantine');
const INBOX = path.join(MATERIAL, 'inbox');
const BRIEFS = path.join(MATERIAL, 'briefs');
const MANIFEST = path.join(MATERIAL, 'manifest.jsonl');
const RUNS = path.join(ROOT, 'History', 'runs', 'materials');

const UA = 'VideoFactory-material-line/0.1 (local ops)';
const MAX_BYTES = 300 * 1024 * 1024; // 单文件上限，防失控

/* ---------------- 风格词典：创作需求 → 各源查询词 ---------------- */
const LEXICON = {
  '史诗感': {
    aliases: ['epic', 'grand', '宏大'],
    web: ['epic landscape aerial', 'mountain clouds aerial', 'storm supercell timelapse', 'canyon aerial view'],
    nasa: ['nebula', 'galaxy', 'earth from space', 'rocket launch'],
  },
  '治愈': {
    aliases: ['healing', 'calm', '温暖'],
    web: ['forest sunlight rays', 'calm ocean waves', 'flower field wind', 'cherry blossom spring'],
    nasa: ['aurora from space'],
  },
  '赛博朋克': {
    aliases: ['cyberpunk', 'neon'],
    web: ['city neon night', 'rain street night lights', 'night traffic long exposure'],
    nasa: [],
  },
  '科技感': {
    aliases: ['tech', 'futuristic', '未来'],
    web: ['circuit board macro', 'server room data center', 'fiber optic light'],
    nasa: ['rocket launch', 'satellite'],
  },
  '极简': {
    aliases: ['minimal', 'simple'],
    web: ['minimal architecture', 'fog minimal landscape', 'single tree field'],
    nasa: [],
  },
  '废土': {
    aliases: ['post-apocalyptic', 'decay'],
    web: ['abandoned building decay', 'rust industrial', 'desert ruins'],
    nasa: [],
  },
};

/** 需求词 → 词典条目（子串双向命中，别名兜底） */
function resolveNeed(need) {
  if (!need) return { key: '未分类', web: [], nasa: [], aliases: [] };
  for (const [k, v] of Object.entries(LEXICON)) {
    if (need.includes(k) || k.includes(need) || (v.aliases || []).some(a => need.toLowerCase().includes(a))) {
      return { key: k, ...v };
    }
  }
  // 未命中词典：需求词本身即查询词（这些源的英文检索最有效，中文原样兜底）
  return { key: need, web: [need], nasa: [need], aliases: [] };
}

/* ---------------- 授权分类 ---------------- */
function classifyLicense(s) {
  const t = String(s || '').toLowerCase();
  if (/public domain|publicdomain|cc0|cc 0|pdm|pd\b/.test(t)) return { cls: 'PD/CC0', tier: 'L1' };
  if (/^cc[ -]by$|cc by [1-4]/.test(t) || /attribution[ ]*[1-4]/.test(t)) return { cls: 'CC BY', tier: 'L1' };
  if (/nc|nd|non-free|fair use|©|copyright/.test(t)) return { cls: 'REVIEW', tier: 'L2' };
  if (!t) return { cls: 'UNKNOWN', tier: 'L2' };
  return { cls: t.toUpperCase(), tier: 'L2' }; // 其余（CC BY-SA 等共享边界）保守进 L2
}

/* ---------------- 通用 fetch + 重试 ---------------- */
async function jget(url, timeoutMs = 15000) {
  const c = new AbortController();
  const timer = setTimeout(() => c.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA }, signal: c.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(timer); }
}
async function withRetry(fn, n = 2, delays = [400, 800, 1600]) {
  let err;
  for (let i = 0; i <= n; i++) {
    try { return await fn(); }
    catch (e) {
      err = e;
      if (e?.name === 'AbortError') throw e; // 配额中止不重试
      if (i < n) {
        // Retry-After 只做参考，硬上限 8s：v1 被大值 Retry-After 拖到分钟级
        const wait = Math.min(8000, Math.max(delays[i] ?? 1600, e?.retryAfterMs || 0));
        await new Promise(r => setTimeout(r, wait));
      }
    }
  }
  throw err;
}

/* ---------------- 源实现：NASA（公开领域，图+视频） ---------------- */
async function nasaSearch(q, mediaType, pageSize) {
  const data = await withRetry(() => jget(
    `https://images-api.nasa.gov/search?q=${encodeURIComponent(q)}&media_type=${mediaType}&page_size=${pageSize}`));
  return (data?.collection?.items || []).map(it => {
    const d = it.data?.[0] || {};
    return {
      source: 'nasa', nasaId: d.nasa_id, title: d.title || d.nasa_id, mediaType,
      pageUrl: `https://images.nasa.gov/details/${d.nasa_id}`,
      license: 'Public Domain (NASA)', attribution: 'NASA Image and Video Library',
      keywords: d.keywords || [], q,
    };
  }).filter(x => x.nasaId);
}
/** HEAD 预选：按体积上限挑最高画质（避免达到配额后仍拖百 MB 原片） */
async function pickBySize(urls, maxBytes) {
  for (const u of urls) {
    try {
      const h = await fetch(u, { method: 'HEAD', headers: { 'user-agent': UA } });
      const len = Number(h.headers.get('content-length') || 0);
      if (!len || len <= maxBytes) return u;
    } catch { /* 换下一个 */ }
  }
  return null;
}
/** 解析 NASA asset 列表 → 最佳文件 URL */
async function nasaAssetFile(cand, mediaType, maxBytes) {
  const assets = await withRetry(() => jget(`https://images-api.nasa.gov/asset/${encodeURIComponent(cand.nasaId)}`));
  const hrefs = (assets?.collection?.items || []).map(x => x.href).filter(Boolean).map(h => h.replace(/^http:/, 'https:'));
  let pick = null;
  if (mediaType === 'video') {
    const mp4s = hrefs.filter(h => /\.mp4$/i.test(h));
    const ordered = [
      ...mp4s.filter(h => /~orig\.mp4/i.test(h)),
      ...mp4s.filter(h => /~mobile\.mp4/i.test(h)),
      ...mp4s.filter(h => /~preview\.mp4/i.test(h)),
      ...mp4s,
    ];
    pick = await pickBySize(ordered, maxBytes);
  } else {
    const imgs = hrefs.filter(h => /\.(jpe?g|png)$/i.test(h));
    const ordered = [
      ...imgs.filter(h => /~orig\./i.test(h)),
      ...imgs.filter(h => /~large\./i.test(h)),
      ...imgs.filter(h => /~medium\./i.test(h)),
      ...imgs,
    ];
    pick = await pickBySize(ordered, maxBytes);
  }
  if (!pick) return null;
  return { ...cand, fileUrl: pick };
}

/* ---------------- 源实现：Wikimedia Commons（多许可，图+视频） ---------------- */
function stripHtml(s) { return String(s || '').replace(/<[^>]+>/g, '').trim(); }
/** Commons 缩略图：原图动辄 8000px/30MB，取 1920 宽足够 1080 时间线 */
function wikiThumbUrl(url, w = 1920) {
  const m = String(url).match(/^(https:\/\/upload\.wikimedia\.org\/wikipedia\/commons)\/([0-9a-f])\/([0-9a-f]{2})\/(.+)$/);
  if (!m) return null;
  const [, base, a, ab, file] = m;
  return `${base}/thumb/${a}/${ab}/${file}/${w}px-${file}`;
}
async function firstOk(urls) {
  const list = urls.filter(Boolean);
  for (const u of list) {
    try { const h = await fetch(u, { method: 'HEAD', headers: { 'user-agent': UA } }); if (h.ok) return u; } catch { /* 下一个 */ }
  }
  return list[list.length - 1] || null;
}
/** 剥掉 API 附带的 utm 查询串：v1 因 `?utm_source=…` 污染正则，转码派生全落空 */
function cleanUrl(u) { return String(u || '').split('?')[0].split('#')[0]; }
async function headLen(url) {
  try {
    const h = await fetch(url, { method: 'HEAD', headers: { 'user-agent': UA } });
    if (!h.ok) return -1;
    return Number(h.headers.get('content-length') || 0);
  } catch { return -1; }
}
async function wikiSearch(q, mediaType, limit, maxBytes = MAX_BYTES, minVideoH = 540) {
  const isVideo = mediaType === 'video';
  const ftype = isVideo ? 'filetype:video' : 'filetype:bitmap';
  const prop = isVideo ? 'videoinfo' : 'imageinfo';
  const iprop = isVideo ? 'url|size|derivatives|extmetadata' : 'url|size|mime|extmetadata';
  const url = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2'
    + `&generator=search&gsrsearch=${encodeURIComponent(q + ' ' + ftype)}&gsrnamespace=6&gsrlimit=${limit}`
    + `&prop=${prop}&${isVideo ? 'viprop' : 'iiprop'}=${iprop}`
    + '&iiextmetadatafilter=LicenseShortName|Artist|ObjectName&viextmetadatafilter=LicenseShortName|Artist|ObjectName';
  const data = await withRetry(() => jget(url));
  const pages = data?.query?.pages || [];
  const out = [];
  for (const p of pages) {
    const ii = (isVideo ? p.videoinfo : p.imageinfo)?.[0];
    if (!ii) continue;
    if (/svg|gif/i.test(ii.mime || '')) continue;
    const meta = ii.extmetadata || {};
    const lic = stripHtml(meta.LicenseShortName?.value);
    let fileUrl = cleanUrl(ii.url);
    if (isVideo) {
      // 官方 derivatives 给全档位；挑 ≤1080p 里最大、体积不超上限、且不低于画质地板的
      // （画质地板前移：v1 先下 480p 再被 probe 拒，白花 27s）
      const cands = (ii.derivatives || [])
        .filter(d => d.src && d.height && d.height >= minVideoH && d.height <= 1080 && /vp9\.webm$|mpeg4\.mov$/i.test(d.src))
        .sort((a, b) => b.height - a.height);
      let picked = null;
      for (const d of cands) {
        const len = await headLen(cleanUrl(d.src));
        if (len === -1) continue;
        if (!len || len <= maxBytes) { picked = cleanUrl(d.src); break; }
      }
      if (!picked) continue; // 全部档位超体积或低于地板 → 该素材不值得下
      fileUrl = picked;
    } else {
      fileUrl = (await firstOk([wikiThumbUrl(cleanUrl(ii.url), 1920), cleanUrl(ii.url)])) || cleanUrl(ii.url);
    }
    out.push({
      source: 'wikimedia', title: p.title || meta.ObjectName?.value || q, mediaType,
      pageUrl: ii.descriptionurl, fileUrl,
      license: lic || 'UNKNOWN', attribution: stripHtml(meta.Artist?.value) || 'Wikimedia Commons',
      w: ii.width, h: ii.height, q,
    });
  }
  return out;
}

/* ---------------- 源实现：Openverse（CC0/PDM/CC-BY，仅图片） ---------------- */
async function openverseSearch(q, limit) {
  const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=${limit}&license=cc0,pdm,by`;
  const data = await withRetry(() => jget(url));
  return (data?.results || []).map(r => ({
    source: 'openverse', title: r.title || q, pageUrl: r.foreign_landing_url, fileUrl: r.url,
    license: `CC ${String(r.license).toUpperCase()} ${r.license_version || ''}`.trim(),
    attribution: `${r.creator || 'unknown'} (Openverse)`, w: r.width, h: r.height, q,
  })).filter(x => x.fileUrl);
}

/* ---------------- 候选收集（多源轮转，保证多样性） ---------------- */
async function gatherCandidates({ need, type, limit, sources, maxBytes, minVideoH }) {
  const lex = resolveNeed(need);
  const wantImage = type !== 'video', wantVideo = type !== 'image';
  const perQ = Math.max(4, Math.ceil(limit * 1.5));
  const buckets = [];

  if (sources.includes('nasa')) {
    const qs = lex.nasa.length ? lex.nasa : [need];
    for (const mt of ['image', 'video']) {
      if ((mt === 'image' && !wantImage) || (mt === 'video' && !wantVideo)) continue;
      for (const q of qs) {
        try { const items = await nasaSearch(q, mt, perQ); if (items.length) { buckets.push(items); break; } } catch (e) { console.error(`  [nasa/${mt}] ${q} 失败: ${e.message}`); }
      }
    }
  }
  if (sources.includes('wiki')) {
    const qs = lex.web.length ? lex.web : [need];
    for (const mt of (wantImage ? ['image'] : []).concat(wantVideo ? ['video'] : [])) {
      for (const q of qs) {
        try { const items = await wikiSearch(q, mt, perQ, maxBytes, minVideoH); if (items.length) { buckets.push(items); break; } } catch (e) { console.error(`  [wiki/${mt}] ${q} 失败: ${e.message}`); }
      }
    }
  }
  if (sources.includes('ov') && wantImage) {
    const qs = lex.web.length ? lex.web : [need];
    for (const q of qs) {
      try { const items = await openverseSearch(q, perQ); if (items.length) { buckets.push(items); break; } } catch (e) { console.error(`  [openverse] ${q} 失败: ${e.message}`); }
    }
  }
  // NASA 视频候选需二次解析 asset 列表才能拿到文件 URL
  const resolved = [];
  const needAsset = buckets.flat().filter(c => c.source === 'nasa' && !c.fileUrl);
  if (needAsset.length) {
    const pool = [...needAsset];
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(4, pool.length) }, async () => {
      while (i < pool.length) {
        const c = pool[i++];
        try { const f = await nasaAssetFile(c, c.mediaType || 'image', maxBytes); if (f) resolved.push(f); } catch { /* skip */ }
      }
    }));
  }
  const direct = buckets.flat().filter(c => c.fileUrl);
  // 多源轮转合并，取 limit*2 余量（给下载失败/去重留 buffer）
  const merged = [];
  const maxLen = Math.max(direct.length, resolved.length);
  for (let i = 0; i < maxLen; i++) {
    if (resolved[i]) merged.push({ ...resolved[i], kind: resolved[i].mediaType === 'video' ? 'video' : 'image' });
    if (direct[i]) merged.push({ ...direct[i], kind: /\.(webm|ogv|mp4|mov|avi|mkv)$/i.test(direct[i].fileUrl) ? 'video' : 'image' });
  }
  // NASA asset 解析时丢失了 media_type 信息：按扩展名兜底重判
  return { lex, candidates: merged.slice(0, Math.max(limit * 2, 12)) };
}

/* ---------------- 下载（限速=并发拉满+逐文件上限+重试） ---------------- */
function sha256File(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
async function downloadTo(url, dest, signal, maxBytes = MAX_BYTES) {
  return withRetry(async () => {
    if (signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    const r = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow', signal });
    if (!r.ok) {
      const ra = Number(r.headers.get('retry-after')) || 0;
      throw Object.assign(new Error(`HTTP ${r.status}`), { status: r.status, retryAfterMs: ra * 1000 });
    }
    // 体积预检：先看 header，超限直接放弃，别用带宽买教训（v1 白下 300MB 用了 125s）
    const declared = Number(r.headers.get('content-length') || 0);
    if (declared && declared > maxBytes) {
      throw new Error(`文件过大 ${(declared / 1048576).toFixed(0)}MB > 上限 ${Math.round(maxBytes / 1048576)}MB`);
    }
    if (!r.body) throw new Error('空 body');
    await new Promise((resolve, reject) => {
      let bytes = 0, done = false;
      const ws = fs.createWriteStream(dest);
      const src = Readable.fromWeb(r.body);
      const fail = (e) => { if (!done) { done = true; try { src.destroy(); ws.destroy(); fs.existsSync(dest) && fs.unlinkSync(dest); } catch { } reject(e); } };
      src.on('data', c => { bytes += c.length; if (bytes > maxBytes) fail(new Error(`超单文件上限 ${maxBytes}`)); });
      src.on('error', fail); ws.on('error', fail);
      ws.on('finish', () => { if (!done) { done = true; resolve(bytes); } });
      src.pipe(ws);
    });
  }, 2, [1200, 5000, 12000]); // 429/5xx 友好退避；配合每主机并发闸（见下）
}
let _probeSeq = 0;
function probe(file) {
  try {
    const j = ffprobeJson(['-show_format', '-show_streams', file], path.join(RUNS, `_probe_${++_probeSeq}.log`));
    const v = (j.streams || []).find(s => s.codec_type === 'video');
    if (!v) return null;
    const dur = Number(j.format?.duration) || 0;
    if (!v.width) return null;
    return { w: v.width, h: v.height, dur: Math.round(dur * 100) / 100, codec: v.codec_name };
  } catch { return null; }
}

/* ---------------- manifest 读写 ---------------- */
function readManifest() {
  if (!fs.existsSync(MANIFEST)) return [];
  return fs.readFileSync(MANIFEST, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}
function appendManifest(entry) {
  fs.mkdirSync(MATERIAL, { recursive: true });
  fs.appendFileSync(MANIFEST, JSON.stringify(entry) + '\n');
}
function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'mat';
}

/** 每主机并发闸：最大限速 = 全局并发拉满 + 对限流严格的主机单独降档 */
function makeLimiter(n) {
  let active = 0; const waiters = [];
  return async function run(fn) {
    if (active >= n) await new Promise(r => waiters.push(r));
    active++;
    try { return await fn(); }
    finally {
      active--;
      if (waiters.length && active < n) waiters.shift()();
    }
  };
}
const HOST_LIMITS = { 'upload.wikimedia.org': 2 };

/* ---------------- 子命令：plan（方案卡 = 选择闸门） ---------------- */
async function cmdPlan(args) {
  const need = args.need || '';
  const type = args.type || 'any';
  const lex = resolveNeed(need);
  console.log(`\n══ 素材采集方案 · need="${need}" type=${type} ══\n`);

  // L0 库内复用
  const all = readManifest();
  const kw = [lex.key, ...(lex.aliases || [])];
  const hits = all.filter(m => (m.tags || []).some(t => kw.some(k => String(t).toLowerCase().includes(k.toLowerCase()))) || kw.some(k => String(m.need || '').includes(k)));
  console.log(`L0 库内复用      代价: 0积分/0流量`);
  console.log(`   库内命中 ${hits.length} 条${hits.length ? `（可用 list 检索）` : '（库为空或无同类）'}`);
  console.log(`   → node Tool/ops/collect_material.mjs list --need "${need}"\n`);

  // L1/L2 网采（实时数一遍开放源的命中量，3 个源各一次轻量请求）
  console.log(`L1 开放授权网采  代价: 0积分（耗时=带宽）  授权自动登记`);
  console.log(`   图片: NASA(PD)/Wikimedia 缩略1920px 画质稳；视频: NASA 存档多为 320p、Wikimedia 转码可到 1080p`);
  console.log(`   注意: NASA 教育图常自带标题字幕，商用级干净画面优先 Openverse(本网络不可达)/L3`);
  const counts = [];
  const qsNasa = lex.nasa.length ? lex.nasa : [need];
  const qsWeb = lex.web.length ? lex.web : [need];
  if (type !== 'video') {
    try { const d = await jget(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(qsWeb[0])}&page_size=1&license=cc0,pdm,by`, 8000); counts.push(`Openverse(CC0/CC-BY): ${d?.result_count ?? '?'}`); } catch { counts.push('Openverse: 不可达'); }
  }
  try { const d = await jget(`https://images-api.nasa.gov/search?q=${encodeURIComponent(qsNasa[0])}&page_size=1`, 8000); counts.push(`NASA(PD): ${d?.collection?.metadata?.total_hits ?? '?'}`); } catch { counts.push('NASA: 不可达'); }
  try { const d = await jget(`https://commons.wikimedia.org/w/api.php?action=query&format=json&list=search&srlimit=1&srinfo=totalhits&srsearch=${encodeURIComponent(qsWeb[0])}`, 8000); counts.push(`Wikimedia(多许可): ${d?.query?.searchinfo?.totalhits ?? '?'}`); } catch { counts.push('Wikimedia: 不可达'); }
  for (const c of counts) console.log(`   ${c}`);
  console.log(`   → node Tool/ops/collect_material.mjs fetch --need "${need}" --type ${type} --limit 8\n`);

  console.log(`L2 待核授权网采  代价: 0积分+人工核授权`);
  console.log(`   NC/ND/未知授权候选只落 quarantine/，promote 前不得用于发布`);
  console.log(`   → fetch 会自动分拣（看回执里的 quarantine 计数）\n`);

  console.log(`L3 AI 生成       代价: 消耗积分（ImageGen/VideoGen）`);
  console.log(`   优势：风格精确可控、无授权风险；入库强制 ai_generated=true（AI 声明纪律）`);
  console.log(`   → node Tool/ops/collect_material.mjs brief --need "${need}" --type ${type} --count 4\n`);

  console.log(`选择后把上面 → 的命令原样执行即可。方案卡即闸门：不选不动。`);
}

/* ---------------- 子命令：fetch（最大限速采集） ---------------- */
async function cmdFetch(args) {
  const need = args.need || '未分类';
  const type = args.type || 'any';
  const limit = Number(args.limit || 8);
  const conc = Math.min(10, Math.max(1, Number(args.concurrency || 6)));
  const maxBytes = Math.round(Number(args['max-mb'] || 120) * 1024 * 1024);
  const minVideoH = Number(args['min-video-h'] || 540); // 工厂底线：低于 540p 的素材剪进 1080 时间线就是糊
  const minImgH = Number(args['min-img-h'] || 500);
  const sources = String(args.source || 'nasa,wiki').split(','); // ov=Openverse 本网络不可达，需要时显式加回
  const runId = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14) + '_' + Math.random().toString(36).slice(2, 6);
  const runDir = path.join(INBOX, runId);
  fs.mkdirSync(runDir, { recursive: true });
  fs.mkdirSync(RUNS, { recursive: true });
  const t0 = Date.now();

  console.log(`\n══ 采集 run=${runId} need="${need}" type=${type} limit=${limit} 并发=${conc} 单文件≤${Math.round(maxBytes / 1048576)}MB ══`);
  const { lex, candidates } = await gatherCandidates({ need, type, limit, sources, maxBytes, minVideoH });
  console.log(`候选 ${candidates.length} 条（nasa/wikimedia/openverse 轮转）\n`);
  if (!candidates.length) { console.log('候选为空，检查网络或换 --need 查询词。'); return; }

  const known = new Set(readManifest().map(m => m.sha256).filter(Boolean));
  const ok = [], dups = [], failed = [], quarantined = [], cancelled = [];
  const quota = new AbortController(); // 配额满即中止在途下载（v1：达到 limit 后仍拖大文件导致进程挂死）
  let i = 0;

  async function worker() {
    while (i < candidates.length && ok.length + quarantined.length < limit) {
      if (quota.signal.aborted) return;
      const c = candidates[i++];
      const ext = path.extname(new URL(c.fileUrl).pathname) || (c.kind === 'video' ? '.mp4' : '.jpg');
      const tmp = path.join(runDir, `d${i}${ext}`);
      const host = new URL(c.fileUrl).host;
      const limiters = args._limiters || (args._limiters = new Map());
      if (!limiters.has(host)) limiters.set(host, makeLimiter(HOST_LIMITS[host] || conc));
      try {
        const bytes = await limiters.get(host)(() => downloadTo(c.fileUrl, tmp, quota.signal, maxBytes));
        const sha = sha256File(tmp);
        if (known.has(sha)) { fs.unlinkSync(tmp); dups.push({ title: c.title, why: '库内重复' }); continue; }
        known.add(sha);
        const p = probe(tmp);
        const isImg = c.kind === 'image';
        if (!p) { fs.unlinkSync(tmp); failed.push({ title: c.title, why: 'ffprobe 无法识别' }); continue; }
        const reject = (why) => { try { fs.existsSync(tmp) && fs.unlinkSync(tmp); } catch { } failed.push({ title: c.title, why }); console.log(`  – [${c.source}] ${c.title.slice(0, 46)} 跳过：${why}`); };
        if (isImg && p.h < minImgH) { reject(`分辨率过低 ${p.w}x${p.h}`); continue; }
        if (!isImg && p.h < minVideoH) { reject(`画质过低 ${p.w}x${p.h}（底线 ${minVideoH}p）`); continue; }
        if (!isImg && p.dur && p.dur < 2) { reject(`时长过短 ${p.dur}s`); continue; }
        const lic = classifyLicense(c.license);
        const dir = lic.tier === 'L1' ? path.join(LIB, c.kind === 'video' ? 'video' : 'image') : QUAR;
        fs.mkdirSync(dir, { recursive: true });
        const name = `${sha.slice(0, 8)}_${slugify(c.title)}${ext}`;
        const dest = path.join(dir, name);
        fs.renameSync(tmp, dest);
        const rel = path.relative(MATERIAL, dest).replace(/\\/g, '/');
        const entry = {
          id: sha.slice(0, 10), need, run_id: runId, tier: lic.tier,
          type: c.kind === 'video' ? 'video' : 'image',
          source: c.source, source_url: c.pageUrl || c.fileUrl, file_url: c.fileUrl,
          license: lic.cls, license_raw: c.license, attribution: c.attribution,
          width: p.w, height: p.h, duration: c.kind === 'video' ? (p.dur || null) : null, codec: p.codec,
          bytes, sha256: sha, path: rel, ai_generated: false,
          tags: [lex.key, c.source, c.kind], acquired_at: new Date().toISOString(), note: '',
        };
        appendManifest(entry);
        (lic.tier === 'L1' ? ok : quarantined).push(entry);
        if (ok.length + quarantined.length >= limit) quota.abort(); // 够了就掐在途大文件
        console.log(`  ✓ [${c.source}] ${c.title.slice(0, 46)} ${p.w}x${p.h}${c.kind === 'video' && p.dur ? ` ${p.dur}s` : ''} ${lic.cls}${lic.tier === 'L2' ? ' →隔离区' : ''}`);
      } catch (e) {
        const aborted = e?.name === 'AbortError' || /abort/i.test(String(e?.message || ''));
        try { fs.existsSync(tmp) && fs.unlinkSync(tmp); } catch { }
        if (aborted) { cancelled.push({ title: c.title }); continue; }
        failed.push({ title: c.title, why: String(e.message || e) });
        console.error(`  ✗ [${c.source}] ${c.title.slice(0, 46)} — ${e.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: conc }, worker));

  const receipt = {
    run_id: runId, need, type, limit, concurrency: conc, sources,
    candidates: candidates.length, saved: ok.length, quarantined: quarantined.length,
    dups: dups.length, failed: failed.length, cancelled: cancelled.length, ms: Date.now() - t0,
    ids: [...ok, ...quarantined].map(m => m.id), detail: { dups, failed, cancelled },
  };
  fs.writeFileSync(path.join(RUNS, `${runId}.json`), JSON.stringify(receipt, null, 2));
  console.log(`\n入库 ${ok.length} · 隔离 ${quarantined.length} · 去重 ${dups.length} · 失败 ${failed.length} · 配额中止 ${cancelled.length} · 耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`回执: History/runs/materials/${runId}.json`);
}

/* ---------------- 子命令：list（L0 复用检索） ---------------- */
function cmdList(args) {
  const all = readManifest();
  let rows = all;
  if (args.type) rows = rows.filter(m => m.type === args.type);
  if (args.tag) rows = rows.filter(m => (m.tags || []).some(t => t.includes(args.tag)));
  if (args.need) { const lex = resolveNeed(args.need); const kw = [lex.key, ...(lex.aliases || [])]; rows = rows.filter(m => kw.some(k => (m.tags || []).includes(k) || String(m.need || '').includes(k))); }
  console.log(`\n素材库 ${rows.length}/${all.length} 条`);
  for (const m of rows) {
    console.log(`  ${m.id} [${m.tier}/${m.type}] ${m.tags.join(',')} | ${m.width}x${m.height}${m.type === 'video' && m.duration ? ` ${m.duration}s` : ''} | ${m.license} | ${m.source}${m.ai_generated ? ' | AI生成' : ''}`);
    console.log(`        ${m.path}`);
  }
}

/* ---------------- 子命令：register（AI 产物 / 隔离晋升 登记入库） ---------------- */
function cmdRegister(args) {
  const src = path.resolve(args.path || '');
  if (!fs.existsSync(src)) { console.error(`文件不存在: ${src}`); process.exit(1); }
  const cost = args.cost || 'L3';
  const tags = String(args.tags || '').split(',').filter(Boolean);
  const p = probe(src);
  if (!p) { console.error('ffprobe 无法识别该文件'); process.exit(1); }
  const sha = sha256File(src);
  const known = readManifest().filter(m => m.sha256 === sha);
  if (known.length) { console.log(`已入库（重复）: ${known[0].id} ${known[0].path}`); return; }
  const type = p.dur > 0 && /\.(mp4|webm|mov|mkv|avi|ogv)$/i.test(src) ? 'video' : 'image';
  const dir = path.join(LIB, type);
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, `${sha.slice(0, 8)}_${slugify(path.basename(src, path.extname(src)))}${path.extname(src)}`);
  fs.copyFileSync(src, dest);
  const entry = {
    id: sha.slice(0, 10), need: args.need || '', run_id: 'manual', tier: cost,
    type, source: cost === 'L3' ? 'ai-generated' : 'manual', source_url: '', file_url: '',
    license: cost === 'L3' ? '自有(AI生成)' : '待补', license_raw: '', attribution: '',
    width: p.w, height: p.h, duration: type === 'video' ? (p.dur || null) : null, codec: p.codec,
    bytes: fs.statSync(src).size, sha256: sha, path: path.relative(MATERIAL, dest).replace(/\\/g, '/'),
    ai_generated: cost === 'L3', tags: tags.length ? tags : ['未分类'],
    acquired_at: new Date().toISOString(), note: args.note || '',
  };
  appendManifest(entry);
  console.log(`已登记入库: ${entry.id} → ${entry.path}${entry.ai_generated ? '（ai_generated=true，发布物 AI 声明纪律适用）' : ''}`);
}

/* ---------------- 子命令：brief（L3 采集简报） ---------------- */
function cmdBrief(args) {
  const need = args.need || '';
  const type = args.type || 'any';
  const count = Number(args.count || 4);
  const lex = resolveNeed(need);
  const bases = [...(lex.web || []), ...(lex.nasa || [])];
  const list = Array.from({ length: count }, (_, i) => bases[i % Math.max(bases.length, 1)] || need);
  const styleTail = ', cinematic composition, dramatic lighting, high detail, no text no watermark';
  const items = list.map((q, i) => ({
    idx: i + 1, base_query: q,
    image_prompt: type === 'video' ? null : `${q}${styleTail}`,
    video_prompt: type === 'image' ? null : `${q}, slow cinematic camera push-in, epic atmosphere${i % 2 ? ', gentle parallax' : ', wide establishing shot'}`,
  }));
  fs.mkdirSync(BRIEFS, { recursive: true });
  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const file = path.join(BRIEFS, `${ts}_${slugify(need)}.json`);
  const brief = { need, type, count, generated_at: new Date().toISOString(), note: 'L3 简报：agent 用 ImageGen/VideoGen 执行后，逐个 collect_material.mjs register --cost L3 入库', items };
  fs.writeFileSync(file, JSON.stringify(brief, null, 2));
  console.log(`\nL3 采集简报 ×${count} → ${path.relative(ROOT, file)}`);
  for (const it of items) console.log(`  #${it.idx} ${it.image_prompt || it.video_prompt}`);
  console.log(`\n执行后登记入库（强制 AI 声明）:`);
  console.log(`  node Tool/ops/collect_material.mjs register --path <生成文件> --tags ${lex.key} --cost L3 --need "${need}"`);
}

/* ---------------- 入口 ---------------- */
const [, , cmd, ...rest] = process.argv;
const args = {};
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith('--')) args[rest[i].slice(2)] = rest[i + 1]?.startsWith('--') ? true : rest[++i];
}
fs.mkdirSync(RUNS, { recursive: true });
switch (cmd) {
  case 'plan': await cmdPlan(args); break;
  case 'fetch': await cmdFetch(args); break;
  case 'list': cmdList(args); break;
  case 'register': cmdRegister(args); break;
  case 'brief': cmdBrief(args); break;
  default:
    console.log('子命令: plan | fetch | list | register | brief（--help 看 collect_material.mjs 头注释）');
}
