#!/usr/bin/env node
/**
 * bili_stats.mjs — 阶段 A：自动拉取「自己稿件」的真实数据，并喂给反馈闭环
 *
 * 目标：把 loop12 里"人工填 feedback.csv"这一步自动化——只读公开/半公开数据，不写任何东西。
 *
 * 数据来源（全部只读）：
 *   · 稿件列表：`member.bilibili.com/x/web/archives`（需要登录态）
 *   · 单条数据：`api.bilibili.com/x/web-interface/view?bvid=`（公开；view/danmaku/reply/favorite/coin/share/like）
 *   · UP 主粉丝：`api.bilibili.com/x/relation/stat?vmid=`（公开）
 *
 * 输出：
 *   · 追加/更新 `Prototype/loop12_market_loop/case_ep01/feedback.csv`（与 track_feedback.mjs 的列完全对齐）
 *   · `History/ops/bili/<时间戳>.json`（原始快照，留痕）
 *
 * 注意（诚实边界）：
 *   · **完播率 / 平均播放时长**属于创作中心数据面板，接口不稳定且需额外参数；本脚本拿不到时
 *     这两列留空（feedback.csv 里就是空），并在报告里显式写"未取到"，绝不估算。
 *   · 遇到风控（HTML/-352/-412/-509）立即停下，不重试绕过。
 *
 * 用法：
 *   node Tool\ops\bili_stats.mjs                    # 拉全部稿件 + 更新 feedback.csv
 *   node Tool\ops\bili_stats.mjs --limit 5          # 只看前 5 条
 *   node Tool\ops\bili_stats.mjs --dry-run          # 只打印，不写 csv
 *   node Tool\ops\bili_stats.mjs --bvid BV1xx       # 只更新指定稿件
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadCred, credSummary, checkLogin, biliGet } from '../lib/bili.mjs';

const args = process.argv.slice(2);
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const LIMIT = Number(getOpt('--limit', 20));
const DRY = args.includes('--dry-run');
const ONLY_BVID = getOpt('--bvid', '');
const FB = path.join(ROOT, 'Prototype', 'loop12_market_loop', 'case_ep01', 'feedback.csv');
const SNAP_DIR = path.join(ROOT, 'History', 'ops', 'bili');
const COLUMNS = ['date', 'duration_s', 'views', 'avg_watch_s', 'likes', 'favorites', 'comments', 'shares', 'new_followers', 'notes'];

fs.mkdirSync(SNAP_DIR, { recursive: true });
const cred = loadCred();
if (!cred) { console.error('没有凭据：先 node Tool\\ops\\bili_auth.mjs --template 并填写 Workspace/secrets/bili.cookie.json'); process.exit(2); }
console.log(`凭据：${credSummary(cred)}`);

const login = await checkLogin(cred);
if (!login.loggedIn) { console.error(`未登录（code=${login.code}）：Cookie 失效或复制不全`); process.exit(1); }
console.log(`登录：${login.uname}（mid=${login.mid}）`);

// 1) 稿件列表
let archives = [];
if (ONLY_BVID) {
  const r = await biliGet(`https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(ONLY_BVID)}`, { cred });
  if (!r.ok) { console.error(`拉取 ${ONLY_BVID} 失败：code=${r.code} ${r.message || r.error}`); process.exit(1); }
  archives = [{ bvid: r.json.data.bvid, title: r.json.data.title, duration: r.json.data.duration, pubdate: r.json.data.pubdate }];
} else {
  const r = await biliGet('https://member.bilibili.com/x/web/archives?status=all&pn=1&ps=' + LIMIT, { cred });
  if (r.risk) { console.error(`疑似风控（HTTP ${r.status}）：${r.error}。按约定停下，不重试绕过。`); process.exit(3); }
  if (!r.ok) { console.error(`稿件列表失败：code=${r.code} ${r.message || r.error}`); process.exit(1); }
  const d = r.json.data || {};
  const list = d.archives || d.list || d.vlist || [];
  archives = list.map((a) => ({ bvid: a.bvid || a.bv_id, title: a.title, duration: a.duration ?? a.length, pubdate: a.pubdate || a.ptime, state: a.state }));
  if (!archives.length) {
    console.log('\n稿件列表为空 —— 说明这个账号还没有已投稿件（或全部在草稿箱）。');
    console.log('阶段 A 到此可判 "凭据可用、通道通"，但反馈闭环要等有稿件后再跑。');
  }
}
console.log(`\n== 稿件 ${archives.length} 条`);

// 2) 逐条拉真实数据
const rows = [];
let followersBefore = null;
const fr = await biliGet(`https://api.bilibili.com/x/relation/stat?vmid=${login.mid}`, { cred });
if (fr.ok) followersBefore = fr.json.data?.follower ?? null;

for (const a of archives) {
  if (!a.bvid) continue;
  const v = await biliGet(`https://api.bilibili.com/x/web-interface/view?bvid=${a.bvid}`, { cred });
  if (!v.ok) { console.log(`  ${a.bvid} 数据失败：code=${v.code} ${v.message || v.error}`); continue; }
  const d = v.json.data;
  const st = d.stat || {};
  rows.push({
    bvid: d.bvid, title: d.title, pubdate: d.pubdate, duration_s: d.duration,
    views: st.view, likes: st.like, favorites: st.favorite, comments: st.reply, shares: st.share, danmaku: st.danmaku, coins: st.coin,
  });
  console.log(`  ${d.bvid} 播放 ${st.view} / 点赞 ${st.like} / 收藏 ${st.favorite} / 评论 ${st.reply} / 分享 ${st.share} / 弹幕 ${st.danmaku}`);
}

// 3) 落快照（原始数据留痕）
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const snapFile = path.join(SNAP_DIR, `${stamp}.json`);
fs.writeFileSync(snapFile, JSON.stringify({ fetched_at: new Date().toISOString(), mid: login.mid, uname: login.uname, followers: followersBefore, archives: rows }, null, 2), 'utf8');
console.log(`\n快照 → ${path.relative(ROOT, snapFile)}`);

// 4) 更新 feedback.csv（按 date 去重：同一天只保留一行最新）
function readCsv(file) {
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const head = lines[0].split(',');
  return lines.slice(1).map((l) => {
    // 简单 CSV 解析（本表没有引号包裹的字段，够用；带逗号的 notes 会在写入时被清理）
    const cells = l.split(',');
    const o = {}; head.forEach((h, i) => { o[h] = cells[i] ?? ''; }); return o;
  });
}
const today = new Date().toISOString().slice(0, 10);
const existing = readCsv(FB);
const merged = new Map(existing.map((r) => [r.date, r]));
if (rows.length) {
  const total = rows.reduce((a, r) => ({ views: a.views + (r.views || 0), likes: a.likes + (r.likes || 0), favorites: a.favorites + (r.favorites || 0), comments: a.comments + (r.comments || 0), shares: a.shares + (r.shares || 0) }), { views: 0, likes: 0, favorites: 0, comments: 0, shares: 0 });
  const dur = rows.reduce((a, r) => a + (r.duration_s || 0), 0);
  merged.set(today, {
    date: today,
    duration_s: dur,
    views: total.views,
    avg_watch_s: '',                       // 取不到就留空，不估算
    likes: total.likes,
    favorites: total.favorites,
    comments: total.comments,
    shares: total.shares,
    new_followers: '',                     // 同上
    notes: `auto:${rows.length}条稿件 ${rows.map((r) => r.bvid).join('/')}`.replace(/,/g, ';'),
  });
}
const header = COLUMNS.join(',');
const body = [...merged.values()]
  .sort((a, b) => String(a.date).localeCompare(String(b.date)))
  .map((r) => COLUMNS.map((c) => String(r[c] ?? '').replace(/,/g, ';')).join(','))
  .join('\n');
const csv = header + '\n' + (body ? body + '\n' : '');
if (DRY) { console.log('\n[dry-run] 将写入 feedback.csv：\n' + csv); }
else {
  fs.mkdirSync(path.dirname(FB), { recursive: true });
  fs.writeFileSync(FB, csv, 'utf8');
  console.log(`feedback.csv 已更新 → ${path.relative(ROOT, FB)}（${merged.size} 行）`);
}
console.log('\n提示：接着跑 node Tool\\ops\\track_feedback.mjs --csv Prototype\\loop12_market_loop\\case_ep01\\feedback.csv 出 P0/P1 动作');
