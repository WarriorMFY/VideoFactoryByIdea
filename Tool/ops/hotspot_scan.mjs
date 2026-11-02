#!/usr/bin/env node
// 名人热点感知器：收集 ≤24h 的「名人演讲 / 采访」热点信号，只增不删。
//
//   node Tool/ops/hotspot_scan.mjs scan
//       抓 TED 官网最新演讲（24h 窗口），写 signals/<时间戳>.json + .md，
//       并把每条信号追加进 index.jsonl（历史信号永不删除，重复项标 repeat）。
//
//   node Tool/ops/hotspot_scan.mjs add --title "..." --url "..." [--published "..."]
//        [--source websearch] [--note "..."] [--kind 采访]
//       把联网搜索得到的补充信号并入最新一轮的 json/md 与 index（不新建轮次文件）。
//
// 设计约定（对应 Skills/talk-loop 方法论）：
//   - 信号只增不删：每轮一个新文件，index.jsonl 纯追加。
//   - 幂等判重：以 url / id 为键，历史出现过的标 repeat=true，不丢弃。
//   - 本机网络只有 ted.com 可靠；新闻/采访类热点由自动化代理联网搜索后经 add 并入。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'History', 'hotspot', 'signals');
const INDEX = path.join(OUT, 'index.jsonl');
const WINDOW_H = Number(process.env.HOTSPOT_WINDOW_H || 24);
const UA = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
};
const TZ = 'Asia/Shanghai';

const now = Date.now();
const cutoff = now - WINDOW_H * 3600e3;
const fmt = (ts) => new Date(ts).toLocaleString('zh-CN', { hour12: false, timeZone: TZ, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const stamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
};

function loadSeen() {
  const seen = new Map(); // key -> { first_run, title }
  if (fs.existsSync(INDEX)) {
    for (const line of fs.readFileSync(INDEX, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const j = JSON.parse(line);
        if (j.key) seen.set(j.key, { first_run: j.run, title: j.title });
      } catch { /* 坏行跳过 */ }
    }
  }
  return seen;
}

// ---- 源 1：TED 官网最新演讲 ----
async function fetchTed() {
  const out = [];
  const html = await fetch('https://www.ted.com/talks?sort=newest', { headers: UA, signal: AbortSignal.timeout(30000) }).then((r) => r.text());
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('TED 页面无 __NEXT_DATA__（结构可能已变）');
  const talks = JSON.parse(m[1]).props.pageProps.talks || [];
  for (const t of talks) {
    const ts = t.publishedAt ? Date.parse(t.publishedAt) : 0;
    if (!ts || ts < cutoff) continue;
    out.push({
      key: `ted:${t.id}`,
      source: 'TED 官网',
      kind: '演讲上线',
      title: `${t.presenterDisplayName || '未知讲者'} — ${t.title}`,
      url: `https://www.ted.com/talks/${t.slug}`,
      published: new Date(ts).toISOString(),
      duration_min: Math.round((t.duration || 0) / 60),
      note: `TED 主舞台/工作坊新片，片长 ${Math.round((t.duration || 0) / 60)} 分钟`,
    });
  }
  return out;
}

// ---- 主流程 ----
async function scan() {
  fs.mkdirSync(OUT, { recursive: true });
  const seen = loadSeen();
  const signals = [];
  const errors = [];

  try {
    const ted = await fetchTed();
    signals.push(...ted);
  } catch (e) {
    errors.push(`TED 官网: ${e.message}`);
  }

  for (const s of signals) {
    const hit = seen.get(s.key);
    s.repeat = Boolean(hit);
    if (hit) s.first_seen = hit.first_run;
  }

  const run = stamp();
  const fresh = signals.filter((s) => !s.repeat);
  const record = { run, generated_at: new Date().toISOString(), window_hours: WINDOW_H, counts: { total: signals.length, fresh: fresh.length, repeat: signals.length - fresh.length }, sources_status: errors.length ? { errors } : 'all_ok', signals };
  const jsonPath = path.join(OUT, `${run}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(record, null, 2));

  const lines = [];
  lines.push(`# 热点信号 ${run.replace('T', ' ').replaceAll('-', '/').slice(0, 10)} ${run.slice(11, 16)}（窗口 ${WINDOW_H}h）`);
  lines.push('');
  lines.push(`**本轮 ${signals.length} 条：新捕获 ${fresh.length}，历史重复 ${signals.length - fresh.length}**　来源状态：${errors.length ? '⚠ ' + errors.join('；') : '全部正常'}`);
  lines.push('');
  const groups = {};
  for (const s of signals) (groups[s.kind] ||= []).push(s);
  for (const [kind, list] of Object.entries(groups)) {
    lines.push(`## ${kind}（${list.length}）`);
    lines.push('');
    for (const s of list.sort((a, b) => Date.parse(b.published || 0) - Date.parse(a.published || 0))) {
      lines.push(`- **${s.repeat ? '[重复]' : '[新]'}** ${s.published ? fmt(Date.parse(s.published)) : '时间未知'}｜${s.title}`);
      lines.push(`  ${s.url}${s.note ? `　· ${s.note}` : ''}${s.repeat ? `　· 首见 ${s.first_seen}` : ''}`);
    }
    lines.push('');
  }
  if (!signals.length) {
    lines.push('（本轮窗口内无信号。可能是客观没有新热点，也可能源不可达——看上面来源状态。）');
    lines.push('');
  }
  lines.push('---');
  lines.push('*本文件由 Tool/ops/hotspot_scan.mjs 生成；历史信号在 index.jsonl 与历史轮次文件中，只增不删。*');
  const mdPath = path.join(OUT, `${run}.md`);
  fs.writeFileSync(mdPath, lines.join('\n'));

  const idxLines = signals.map((s) => JSON.stringify({ run, key: s.key, title: s.title, url: s.url, source: s.source, kind: s.kind, published: s.published, repeat: s.repeat }));
  if (idxLines.length) fs.appendFileSync(INDEX, idxLines.join('\n') + '\n');

  console.log(`[hotspot] 本轮 ${signals.length} 条（新 ${fresh.length} / 重复 ${signals.length - fresh.length}）`);
  for (const e of errors) console.log(`[hotspot][err] ${e}`);
  console.log(`[hotspot] json: ${path.relative(ROOT, jsonPath)}`);
  console.log(`[hotspot] md  : ${path.relative(ROOT, mdPath)}`);
  return record;
}

// ---- add：把联网搜索信号并入最新一轮 ----
function add(argv) {
  const get = (k) => {
    const i = argv.indexOf(k);
    return i >= 0 ? argv[i + 1] : '';
  };
  const title = get('--title');
  const url = get('--url');
  if (!title || !url) { console.error('[hotspot] add 需要 --title 与 --url'); process.exit(1); }
  const source = get('--source') || 'websearch';
  const kind = get('--kind') || '采访/报道';
  const note = get('--note');
  const published = get('--published');
  const seen = loadSeen();

  // 最新一轮文件
  const runs = fs.readdirSync(OUT).filter((f) => f.endsWith('.json')).sort();
  if (!runs.length) { console.error('[hotspot] 还没有任何轮次文件，先跑 scan'); process.exit(1); }
  const latest = runs[runs.length - 1];
  const jsonPath = path.join(OUT, latest);
  const mdPath = jsonPath.replace(/\.json$/, '.md');
  const rec = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  const key = url.replace(/[?#].*$/, '');
  const hit = seen.get(key);
  const sig = { key, source, kind, title, url, published: published || '', note, repeat: Boolean(hit) };
  if (hit) sig.first_seen = hit.first_run;
  rec.signals.push(sig);
  rec.counts = { total: rec.signals.length, fresh: rec.signals.filter((s) => !s.repeat).length, repeat: rec.signals.filter((s) => s.repeat).length };
  fs.writeFileSync(jsonPath, JSON.stringify(rec, null, 2));

  // md 追加段落
  const lines = [`- **${sig.repeat ? '[重复]' : '[新]'}** ${published || '时间未知'}｜${title}`, `  ${url}${note ? `　· ${note}` : ''}${sig.repeat ? `　· 首见 ${sig.first_seen}` : ''}`];
  let md = fs.readFileSync(mdPath, 'utf8');
  const tail = '---\n*本文件由';
  md = md.replace(tail, `## ${kind}（联网搜索补充）\n\n${lines.join('\n')}\n\n${tail}`);
  fs.writeFileSync(mdPath, md);

  fs.appendFileSync(INDEX, JSON.stringify({ run: rec.run, key, title, url, source, kind, published: sig.published, repeat: sig.repeat }) + '\n');
  console.log(`[hotspot] add → ${path.relative(ROOT, mdPath)}（${sig.repeat ? '重复' : '新信号'}）`);
}

const cmd = process.argv[2] || 'scan';
if (cmd === 'scan') await scan();
else if (cmd === 'add') add(process.argv.slice(2));
else { console.error('用法: hotspot_scan.mjs scan | add --title .. --url .. [--published ..] [--note ..] [--kind ..]'); process.exit(1); }
