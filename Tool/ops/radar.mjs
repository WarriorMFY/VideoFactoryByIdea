#!/usr/bin/env node
/**
 * radar.mjs — 选题雷达「常态化」：每次跑一期快照 + 与上一期对比，积累趋势
 *
 * 为什么需要它（小循环 12 挂账项⑤）：一次侦查只能看到"当下谁火"，看不出"什么在升温"。
 * 但选题的价值恰恰在趋势：新进榜、播放增速、关键词搜索面变化。
 * 本沙箱不能设定时任务，所以做成「跑一次 = 存一期快照」，由人（或每天第一件事）触发即可积累。
 *
 * 复用而不是重写：数据采集完全走 `Tool/ops/recon_bilibili.mjs`（只读公开接口），
 * 本脚本只负责**快照 / 索引 / 差分 / 报告**。
 *
 * 用法：
 *   node Tool\ops\radar.mjs                          # 采集一期快照并出趋势报告
 *   node Tool\ops\radar.mjs --seed <market_raw.json> # 把历史侦查结果当基线导入（用于首次建立趋势）
 *   node Tool\ops\radar.mjs --out History/ops/radar  # 快照根目录（默认）
 *   node Tool\ops\radar.mjs --top 60                 # 传给 recon 的样本量
 *
 * 输出：
 *   <out>/snapshots/<yyyy-mm-dd_HHMM>.json   每期原始数据（含 generated_at）
 *   <out>/index.json                          期数索引（体积/样本数/关键词热度）
 *   <out>/report-latest.md                    与上一期的差分报告（人看）
 *   <out>/report-<yyyy-mm-dd_HHMM>.md         归档
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from '../lib/ff.mjs';

const args = process.argv.slice(2);
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const OUT = path.resolve(ROOT, getOpt('--out', path.join('History', 'ops', 'radar')));
const TOP = Number(getOpt('--top', 60));
const SEED = getOpt('--seed', '');
const SNAPS = path.join(OUT, 'snapshots');
const INDEX = path.join(OUT, 'index.json');
const LOGS = path.join(ROOT, 'History', 'runs', '_logs');
for (const d of [OUT, SNAPS, LOGS]) fs.mkdirSync(d, { recursive: true });

const tsOf = (iso) => {
  // 用**本地时间**命名快照（generated_at 是 UTC ISO，直接用会让人看到"02:02"这种奇怪时刻）
  const d = iso ? new Date(iso) : new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
};

/** keyword_markets 可能是对象（旧格式）也可能是数组（新格式：[{keyword,num_results,top_play}]），统一成对象 */
function kwMap(data) {
  const kw = data.keyword_markets;
  if (!kw) return {};
  if (Array.isArray(kw)) return Object.fromEntries(kw.filter((x) => x && x.keyword).map((x) => [x.keyword, x]));
  return kw;
}

function loadIndex() {
  try { return JSON.parse(fs.readFileSync(INDEX, 'utf8')); } catch { return { generated_at: null, snapshots: [] }; }
}

/** 采集一期：调 recon_bilibili.mjs 写到临时目录，再把 market_raw.json 收进快照 */
function collect() {
  const tmp = path.join(OUT, '.tmp-collect');
  fs.rmSync(tmp, { recursive: true, force: true });
  const logPath = path.join(LOGS, 'radar_recon.log');
  const fd = fs.openSync(logPath, 'w');
  let r;
  try {
    r = spawnSync(process.execPath, [path.join(ROOT, 'Tool/ops/recon_bilibili.mjs'), '--out', path.relative(ROOT, tmp), '--top', String(TOP)], {
      cwd: ROOT, stdio: ['ignore', fd, fd], timeout: 300000, killSignal: 'SIGKILL',
    });
  } finally { fs.closeSync(fd); }
  const raw = path.join(tmp, 'market_raw.json');
  if (r.status !== 0 || !fs.existsSync(raw)) {
    console.error('[radar] 采集失败，日志：', path.relative(ROOT, logPath));
    console.error(fs.readFileSync(logPath, 'utf8').split('\n').slice(-6).join('\n'));
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(raw, 'utf8'));
  fs.rmSync(tmp, { recursive: true, force: true });   // 临时采集目录用完即删（快照里已有正式副本）
  return data;
}

function snapshotFrom(data) {
  const ts = tsOf(data.generated_at);
  const file = path.join(SNAPS, `${ts}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  const cands = data.candidates || [];
  const kw = kwMap(data);
  const idx = loadIndex();
  const entry = {
    ts,
    file: path.relative(ROOT, file),
    generated_at: data.generated_at,
    pool_size: data.pool_size || 0,
    candidates: cands.length,
    top_zones: Object.entries(data.zones || {}).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([z, n]) => `${z}(${n})`),
    keyword_top: Object.entries(kw).map(([k, v]) => ({ keyword: k, num_results: v.num_results || 0, top_play: v.top_play || 0 }))
      .sort((a, b) => b.num_results - a.num_results),
  };
  idx.snapshots = (idx.snapshots || []).filter((s) => s.ts !== ts);
  idx.snapshots.push(entry);
  idx.snapshots.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  idx.generated_at = new Date().toISOString();
  fs.writeFileSync(INDEX, JSON.stringify(idx, null, 2), 'utf8');
  return { entry, file };
}

/** 与本期的上一期做差分 */
function diff(cur, prev) {
  if (!prev) return { first: true };
  const byId = (d) => new Map((d.candidates || []).map((c) => [c.bvid, c]));
  const curM = byId(cur), prevM = byId(prev);
  const added = [...curM.values()].filter((c) => !prevM.has(c.bvid));
  const dropped = [...prevM.values()].filter((c) => !curM.has(c.bvid));
  const gains = [...curM.values()]
    .filter((c) => prevM.has(c.bvid))
    .map((c) => ({ ...c, gain: (c.view || 0) - (prevM.get(c.bvid).view || 0) }))
    .filter((c) => c.gain > 0)
    .sort((a, b) => b.gain - a.gain);
  const kwCur = kwMap(cur), kwPrev = kwMap(prev);
  const kw = Object.keys({ ...kwCur, ...kwPrev }).map((k) => ({
    keyword: k,
    num_results: kwCur[k]?.num_results ?? 0,
    d_results: (kwCur[k]?.num_results ?? 0) - (kwPrev[k]?.num_results ?? 0),
    top_play: kwCur[k]?.top_play ?? 0,
    d_top_play: (kwCur[k]?.top_play ?? 0) - (kwPrev[k]?.top_play ?? 0),
  })).sort((a, b) => b.d_results - a.d_results);
  // 上一次采到、这次没采到（多半是 B 站搜索接口被风控返回 HTML）——必须显式标注，不能当成"热度归零"
  const kwMissing = Object.keys(kwPrev).filter((k) => !(k in kwCur));
  return { first: false, added, dropped, gains, kw, kwMissing, prevTs: prev.generated_at };
}

const fmt = (n) => (n >= 1e8 ? `${(n / 1e8).toFixed(2)}亿` : n >= 1e4 ? `${(n / 1e4).toFixed(1)}万` : String(n ?? 0));

function report(cur, d, idx) {
  const L = [];
  const curTs = tsOf(cur.generated_at);
  L.push(`# 选题雷达 · ${cur.generated_at}`, '');
  L.push(`样本 ${cur.pool_size} 条榜单 + ${Object.keys(kwMap(cur)).length} 个关键词市场；历史快照 ${idx.snapshots.length} 期`, '');
  if (d.kwMissing && d.kwMissing.length) {
    L.push(`> 注意：有 ${d.kwMissing.length} 个关键词本期采集失败（B 站搜索接口返回 HTML 被风控：${d.kwMissing.slice(0, 5).join(' / ')}），趋势以榜单差分为准。`, '');
  }
  if (d.first) {
    L.push('## 趋势', '', '这是**第一期**，没有可比基线（下次再跑就有差分了）。', '');
  } else {
    L.push(`## 与上一期（${d.prevTs}）相比`, '');
    L.push(`- 新进榜 **${d.added.length}** 条，掉榜 **${d.dropped.length}** 条`, '');
    if (d.added.length) {
      L.push('### 新进榜（前 8）', '', '| 标题 | 分区 | 播放 | 时长 | 热度 |', '| --- | --- | --- | --- | --- |');
      for (const c of d.added.sort((a, b) => (b.heat || 0) - (a.heat || 0)).slice(0, 8)) {
        L.push(`| ${String(c.title || '').slice(0, 40).replace(/\|/g, '/')} | ${c.zone || '-'} | ${fmt(c.view)} | ${c.duration_s}s | ${c.heat ?? '-'} |`);
      }
      L.push('');
    }
    if (d.gains.length) {
      L.push('### 播放增速（前 8）', '', '| 标题 | 分区 | 增量 | 当前播放 |', '| --- | --- | --- | --- |');
      for (const c of d.gains.slice(0, 8)) L.push(`| ${String(c.title || '').slice(0, 40).replace(/\|/g, '/')} | ${c.zone || '-'} | +${fmt(c.gain)} | ${fmt(c.view)} |`);
      L.push('');
    }
    const rising = d.kw.filter((k) => k.d_results > 0).slice(0, 6);
    if (rising.length) {
      L.push('### 关键词搜索面变化', '', '| 关键词 | 结果数变化 | 头部播放 | 头部播放变化 |', '| --- | --- | --- | --- |');
      for (const k of rising) L.push(`| ${k.keyword} | ${k.d_results > 0 ? '+' : ''}${k.d_results} | ${fmt(k.top_play)} | ${k.d_top_play >= 0 ? '+' : ''}${fmt(k.d_top_play)} |`);
      L.push('');
    }
  }
  // 建议：优先"新进榜且工厂当天可做"，其次"增速最快"
  const pool = d.first ? (cur.candidates || []) : [...d.added, ...d.gains];
  const pick = pool
    .filter((c) => !c.hard_exclude)
    .sort((a, b) => (b.heat || 0) * 1000 + (b.gain || 0) / 1e5 - ((a.heat || 0) * 1000 + (a.gain || 0) / 1e5))
    .slice(0, 3);
  L.push('## 建议下一期选题（按"热度 + 增量 + 工厂当天可交付"排序）', '');
  if (!pick.length) L.push('- 本期没有新信号，建议沿用上期选题或扩大 `--top`。');
  for (const c of pick) {
    L.push(`- **${String(c.title || '').slice(0, 46)}**（${c.zone || '-'}·${c.duration_s}s·${fmt(c.view)} 播放·热度 ${c.heat ?? '-'}）`
      + `${c.effort ? ` → 工期：${c.effort}` : ''}${c.bilingual_hint ? ' · 命中"双语/外语"信号' : ''}`);
  }
  L.push('');
  L.push('> 判定口径：热度/增量来自公开接口快照差分，只表示"值得做"，不代表"做了就有效果"；效果仍需上架后 T+1/T+7 数据。');
  fs.writeFileSync(path.join(OUT, 'report-latest.md'), L.join('\n'), 'utf8');
  fs.writeFileSync(path.join(OUT, `report-${curTs}.md`), L.join('\n'), 'utf8');
  return L.join('\n');
}

// ---------- 主流程 ----------
const idxBefore = loadIndex();
if (SEED) {
  const seedFile = path.resolve(ROOT, SEED);
  if (!fs.existsSync(seedFile)) { console.error('种子文件不存在:', seedFile); process.exit(1); }
  const data = JSON.parse(fs.readFileSync(seedFile, 'utf8'));
  const { entry } = snapshotFrom(data);
  console.log(`[radar] 已导入基线快照 ${entry.ts}（${entry.candidates} 条候选 / pool ${entry.pool_size}）`);
  process.exit(0);
}

console.log(`[radar] 采集第 ${idxBefore.snapshots.length + 1} 期（top=${TOP}）…`);
const cur = collect();
const { entry } = snapshotFrom(cur);
const idx = loadIndex();
const prevTs = idx.snapshots.filter((s) => s.ts !== entry.ts).slice(-1)[0];
let prev = null;
if (prevTs) {
  try { prev = JSON.parse(fs.readFileSync(path.resolve(ROOT, prevTs.file), 'utf8')); } catch { prev = null; }
}
const d = diff(cur, prev);
const md = report(cur, d, idx);
console.log(`\n[radar] 快照 ${entry.ts}：${entry.candidates} 条候选 / pool ${entry.pool_size} / 关键词 ${entry.keyword_top.length} 个`);
if (!d.first) {
  console.log(`[radar] 对比 ${d.prevTs}：新进榜 ${d.added.length} / 掉榜 ${d.dropped.length} / 有增量的 ${d.gains.length}`);
  for (const c of d.gains.slice(0, 3)) console.log(`   ↑ ${String(c.title).slice(0, 30)} +${fmt(c.gain)}`);
} else {
  console.log('[radar] 这是第一期，无基线可比（再跑一次就有趋势）');
}
console.log(`\n[radar] 报告 → ${path.relative(ROOT, path.join(OUT, 'report-latest.md'))}`);
