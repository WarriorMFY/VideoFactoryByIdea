#!/usr/bin/env node
/**
 * collect_feedback.mjs — 定期感知 B 站真实反馈（零登录，只读公开接口）
 *
 * 为什么要有它：loop12 把片子发出去之后，「发了然后呢」一直靠人手填 CSV。
 * 手填有三个问题：①想不起来填 ②数记错 ③评论区真实吐槽看不见（只看得到条数）。
 * 这个脚本把公开接口里的数字 + 评论原文 + 弹幕原文落到 feedback.csv，
 * 后面 track_feedback（诊断）和 plan_next_loop（排下一轮）才有真输入。
 *
 * 数据来源（全部公开，不需要 Cookie、不碰账号隐私）：
 *   x/web-interface/view  → 播放 / 点赞 / 投币 / 收藏 / 评论数 / 分享 / 弹幕数 / 时长
 *   x/v2/reply            → 热评原文（置顶 + 前 20 条顶层，取前 6 条进 notes）
 *   x/v1/dm/list.so       → 弹幕原文（带出现秒数，能定位"第几秒被吐槽"）
 *   x/relation/stat       → 粉丝总数（相邻快照相减 = 本区间涨粉）
 *
 * 拿不到的：**平均播放时长 / 完播率** —— 只有登录态创作中心里有。
 * 本脚本不编数：avg_watch_s 留空，或沿用上一条人工填过的值；
 * 你在创作中心看到后可以用 `--avg-watch 12.4` 补录。
 *
 * 幂等：同一天重复跑只更新当天那一行（数值刷新，人工备注保留）。
 * 产物：
 *   feedback.csv                     一天一行（给 track_feedback 按天算环比）
 *   History/runs/feedback/ticks.jsonl 一次一行（半小时/一小时一采时的日内时序，
 *                                    用来判断"推荐流从哪一刻起没再推"）
 *   History/runs/feedback/latest.json 最新一次快照（plan_next_loop 的输入）
 *   History/runs/feedback/<时间戳>.json 仅在数据变化时落（避免高频采集塞满磁盘）
 *
 * 用法：
 *   node Tool/ops/collect_feedback.mjs                       # 采一次，写默认 CSV
 *   node Tool/ops/collect_feedback.mjs --bvid BV1xxx --csv <path>
 *   node Tool/ops/collect_feedback.mjs --avg-watch 12.4      # 补录平均播放时长
 *   node Tool/ops/collect_feedback.mjs --dry-run             # 只打印，不落盘
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../lib/ff.mjs';
import { readCsv, writeCsv } from '../lib/csv.mjs';

const args = process.argv.slice(2);
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const has = (k) => args.includes(k);

const DEFAULT_CSV = 'Prototype/loop12_market_loop/case_ep01/feedback.csv';
const DEFAULT_BVID = 'BV1AaxC6hExH';
const DEFAULT_UID = '3747573749779036';
const RUNS = path.join(ROOT, 'History', 'runs', 'feedback');

// 列顺序：前 10 列与小循环 12 的原始表一致（外部脚本/人眼都按这个读），新列追加在后面
const HEADER = ['date', 'duration_s', 'views', 'avg_watch_s', 'likes', 'favorites', 'comments',
  'shares', 'new_followers', 'notes', 'danmaku', 'coins', 'fans_total', 'views_delta', 'snapshot_at'];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const HDRS = { 'user-agent': UA, referer: 'https://www.bilibili.com/' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, tries = 3) {
  let lastErr;
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(url, { headers: HDRS, signal: AbortSignal.timeout(20000) });
      const text = await res.text();
      // B 站风控偶发返回 HTML 页而不是 JSON，按失败重试，不要抛到调用方
      const j = JSON.parse(text);
      return j;
    } catch (e) {
      lastErr = e;
      if (i < tries) await sleep(1200 * i);
    }
  }
  throw new Error(`${url} 请求失败：${lastErr?.message || lastErr}`);
}

/** 从同目录 publish.md 里捞 BV 号（发布时写的回执），捞不到就退回常量 */
function findBvid(csvAbs) {
  const cand = ['publish.md', 'desc_publish.txt'].map((f) => path.join(path.dirname(csvAbs), f));
  for (const f of cand) {
    if (!fs.existsSync(f)) continue;
    const m = fs.readFileSync(f, 'utf8').match(/BV[0-9A-Za-z]{10}/);
    if (m) return m[0];
  }
  return DEFAULT_BVID;
}

const clean = (s) => String(s ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * 空单元格 → null，不是 0。
 * 踩过：旧表没有 fans_total 列时 `prev.fans_total` 是 undefined，`Number(undefined)` 得 NaN，
 * 一路写成 new_followers="NaN"，后面每个下游脚本都跟着崩。
 */
const numOr = (v) => {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** 弹幕 xml → [{t, text}] */
function parseDanmaku(xml) {
  const out = [];
  const re = /<d p="([^"]*)"[^>]*>([\s\S]*?)<\/d>/g;
  let m;
  while ((m = re.exec(xml))) {
    const t = Number(String(m[1]).split(',')[0]);
    const text = clean(m[2].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
    if (text) out.push({ t: Number.isFinite(t) ? +t.toFixed(2) : null, text });
  }
  return out;
}

async function main() {
  const csvRel = getOpt('--csv', DEFAULT_CSV);
  const csvAbs = path.resolve(ROOT, csvRel);
  const bvid = getOpt('--bvid', '') || findBvid(csvAbs);
  const uid = getOpt('--uid', DEFAULT_UID);
  const avgWatch = getOpt('--avg-watch', '');
  const dry = has('--dry-run');
  const stamp = new Date();
  const today = `${stamp.getFullYear()}-${String(stamp.getMonth() + 1).padStart(2, '0')}-${String(stamp.getDate()).padStart(2, '0')}`;

  fs.mkdirSync(RUNS, { recursive: true });
  console.log(`[collect] ${bvid} @ ${today} ${stamp.toTimeString().slice(0, 5)}`);

  // ---------- 1. 稿件基础数据 ----------
  const view = await getJson(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`);
  if (view.code !== 0) throw new Error(`view 接口失败 code=${view.code} ${view.message}（稿件被删/审核中会这样）`);
  const d = view.data;
  const stat = d.stat;
  const cid = d.cid;
  console.log(`[collect] 标题：${d.title}`);
  console.log(`[collect] 播放 ${stat.view} / 点赞 ${stat.like} / 收藏 ${stat.favorite} / 评论 ${stat.reply} / 弹幕 ${stat.danmaku} / 投币 ${stat.coin} / 分享 ${stat.share}`);

  // ---------- 2. 评论区原文 ----------
  const replies = [];
  try {
    const r = await getJson(`https://api.bilibili.com/x/v2/reply?type=1&oid=${d.aid}&sort=2&ps=20&pn=1`);
    if (r.code === 0 && r.data) {
      const all = [...(r.data.top_replies || []), ...(r.data.replies || [])];
      for (const x of all) {
        const txt = clean(x?.content?.message);
        if (txt) replies.push({ user: clean(x.member?.uname), text: txt, like: x.like || 0, pinned: !!(r.data.top_replies || []).includes(x) });
      }
    }
  } catch (e) {
    console.warn(`[collect] 评论接口跳过：${e.message}`);
  }
  const replyDedup = [...new Map(replies.map((r) => [r.text, r])).values()];
  console.log(`[collect] 评论抓取 ${replyDedup.length} 条`);

  // ---------- 3. 弹幕原文（带秒数） ----------
  let danmakus = [];
  try {
    const res = await fetch(`https://api.bilibili.com/x/v1/dm/list.so?oid=${cid}`, { headers: HDRS, signal: AbortSignal.timeout(20000) });
    const xml = await res.text();
    danmakus = parseDanmaku(xml);
  } catch (e) {
    console.warn(`[collect] 弹幕接口跳过：${e.message}`);
  }
  console.log(`[collect] 弹幕抓取 ${danmakus.length} 条`);

  // ---------- 4. 粉丝总数 ----------
  let fansTotal = null;
  try {
    const f = await getJson(`https://api.bilibili.com/x/relation/stat?vmid=${uid}`);
    if (f.code === 0) fansTotal = f.data.follower;
  } catch (e) {
    console.warn(`[collect] 粉丝接口跳过：${e.message}`);
  }

  // ---------- 5. 合并进 CSV ----------
  const old = fs.existsSync(csvAbs) ? readCsv(csvAbs) : [];
  const oldHdr = (old[0] || []).map((h) => String(h).trim());
  const rowOf = (arr) => Object.fromEntries(oldHdr.map((h, i) => [h, clean(arr[i])]));
  const oldRows = old.slice(1).map(rowOf).filter((r) => r.date);
  oldRows.sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const prevSameDay = oldRows.find((r) => r.date === today);
  const prevDay = oldRows.filter((r) => r.date < today).pop() || null;

  /**
   * 增量基线要能"跨同日多次采集"保持有意义。
   * 需求：一天里跑两次（automation 是 10:00 / 20:00），views_delta 必须还是"相对昨天的增量"，
   * 不能第二次跑就变成 0（否则 plan 的 R1「没进推荐流」和 R2「在推但没人买账」直接判反）。
   * 做法：当天已有行且带 delta 时，反推原始基线 = 当日 views − 当日 delta；否则用昨天的 views。
   */
  const baseOf = (cur, d, prevRow) => {
    if (cur && d !== '' && d != null) {
      const c = numOr(cur), dd = numOr(d);
      if (c != null && dd != null) return c - dd;
    }
    return prevRow ? numOr(prevRow) : null;
  };
  const baseViews = baseOf(
    prevSameDay ? prevSameDay.views : null, prevSameDay ? prevSameDay.views_delta : '',
    prevDay ? prevDay.views : null,
  );
  const baseFans = baseOf(
    prevSameDay ? prevSameDay.fans_total : null, prevSameDay ? prevSameDay.new_followers : '',
    prevDay ? prevDay.fans_total : null,
  );

  // notes：自动段（评论 + 弹幕原文）‖ 人工段（旧行里 ‖ 之后的内容，保留不覆盖）
  const manualPart = prevSameDay && String(prevSameDay.notes).includes('‖')
    ? String(prevSameDay.notes).split('‖').slice(1).join('‖').trim()
    : '';
  const autoBits = [];
  if (replyDedup.length) autoBits.push('评论:' + replyDedup.slice(0, 6).map((r) => r.text.slice(0, 40)).join(' / '));
  else autoBits.push('评论:无');
  if (danmakus.length) autoBits.push('弹幕:' + [...new Set(danmakus.map((x) => x.text))].slice(0, 8).join(' / '));
  let autoPart = autoBits.join(' ‖ ');
  if (autoPart.length > 380) autoPart = autoPart.slice(0, 380) + '…';
  const notes = manualPart ? `${autoPart}‖${manualPart}` : autoPart;

  const inheritWatch = avgWatch !== '' ? avgWatch : (prevSameDay?.avg_watch_s || prevDay?.avg_watch_s || '');
  const fansDelta = fansTotal != null && baseFans != null ? fansTotal - baseFans : '';
  const viewsNow = numOr(stat.view) ?? 0;
  const viewsDelta = baseViews != null ? viewsNow - baseViews : '';
  const row = {
    date: today,
    duration_s: String(d.duration ?? ''),
    views: String(viewsNow),
    avg_watch_s: String(inheritWatch || ''),
    likes: String(stat.like ?? ''),
    favorites: String(stat.favorite ?? ''),
    comments: String(stat.reply ?? ''),
    shares: String(stat.share ?? ''),
    new_followers: fansDelta === '' ? '' : String(fansDelta),
    notes,
    danmaku: String(stat.danmaku ?? ''),
    coins: String(stat.coin ?? ''),
    fans_total: fansTotal == null ? '' : String(fansTotal),
    views_delta: viewsDelta === '' ? '' : String(viewsDelta),
    snapshot_at: stamp.toISOString(),
  };

  // upsert：同日行替换，其余按日期排序
  const merged = oldRows.filter((r) => r.date !== today).concat([row])
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const table = [HEADER, ...merged.map((r) => HEADER.map((h) => r[h] ?? ''))];

  // ---------- 6. 原始快照（给 planner 做"命中几条"统计用） ----------
  const snap = {
    collected_at: stamp.toISOString(),
    bvid, aid: d.aid, cid,
    title: d.title,
    duration_s: d.duration,
    pubdate: d.pubdate,
    stat,
    fans_total: fansTotal,
    fans_delta: row.new_followers === '' ? null : Number(row.new_followers),
    views_delta: row.views_delta === '' ? null : Number(row.views_delta),
    replies: replyDedup,
    danmakus,
    notes_auto: autoPart,
  };
  const snapFile = path.join(RUNS, `${stamp.toISOString().replace(/[:.]/g, '-')}.json`);

  if (dry) {
    console.log('\n[collect] --dry-run，不写文件。将要写入的行：');
    console.log(JSON.stringify(row, null, 2));
    return;
  }
  writeCsv(csvAbs, table);

  // 数据没变就不落新快照，否则定时任务一天两次会把 runs/feedback 塞满几百个一模一样的 json。
  // CSV 仍然写（当天那一行刷新，基线计算要它），--force 可强制留档。
  const latestFile = path.join(RUNS, 'latest.json');
  let prevLatest = null;
  try { prevLatest = JSON.parse(fs.readFileSync(latestFile, 'utf8')); } catch { /* 首次跑，正常 */ }
  const sig = (o) => o ? JSON.stringify([o.stat, (o.replies || []).length, (o.danmakus || []).length]) : null;
  const unchanged = !has('--force') && prevLatest && sig(prevLatest) === sig(snap);

  // 时间戳快照只在数据变化时落；latest.json 每次都刷新——
  // views_delta / fans_delta 是"相对基线"的派生值，同一天再采集会变，
  // 不刷新会让 plan.md 显示上一轮的增量（"播放 3 / +0"这种自相矛盾的读数）。
  if (!unchanged) fs.writeFileSync(snapFile, JSON.stringify(snap, null, 2), 'utf8');
  fs.writeFileSync(latestFile, JSON.stringify(snap, null, 2), 'utf8');

  /**
   * 每小时/半小时一采时，`feedback.csv` 一天只留一行（诊断口径要稳定，环比按天算），
   * 日内「哪半小时播放涨得快」就无处可查 —— 而这正是判断"有没有进推荐流"最直接的证据。
   * 所以另起一个只追加的 ticks.jsonl：一行一个采样点，数据没变也记（时间点本身是信息：
   * 能看出推荐流从哪一刻起没再推）。体积很小：半小时一次 ≈ 7KB/天。
   */
  const ticksFile = path.join(RUNS, 'ticks.jsonl');
  const tick = {
    at: stamp.toISOString(),
    date: today,
    views: Number(stat.view) || 0,
    likes: Number(stat.like) || 0,
    coins: Number(stat.coin) || 0,
    favorites: Number(stat.favorite) || 0,
    comments: Number(stat.reply) || 0,
    danmaku: Number(stat.danmaku) || 0,
    shares: Number(stat.share) || 0,
    fans: fansTotal,
    views_since_publish: baseViews == null ? null : (Number(stat.view) || 0) - baseViews,
  };
  fs.appendFileSync(ticksFile, JSON.stringify(tick) + '\n', 'utf8');

  // ---------- 7. 变化摘要 ----------
  const delta = row.views_delta === '' ? '（首个快照，无基线）' : `（较上次 +${row.views_delta}）`;
  const fansTxt = fansDelta === '' ? `${fansTotal ?? '—'}（无基线）` : `${fansTotal}（${fansDelta >= 0 ? '+' : ''}${fansDelta}）`;
  console.log(`[collect] 播放 ${stat.view}${delta}｜评论 ${replyDedup.length} 条｜弹幕 ${danmakus.length} 条｜粉丝 ${fansTxt}`);
  console.log(`[collect] -> ${csvRel}`);
  console.log(unchanged
    ? '[collect] 数据与上次采样完全一致，未新增快照（CSV 已刷新；要留档加 --force）'
    : `[collect] -> ${path.relative(ROOT, snapFile)}`);
  if (!row.avg_watch_s) {
    console.log('[collect] 注意：avg_watch_s 为空（公开接口没有完播率）。去创作中心看「平均播放时长」后跑 --avg-watch <秒> 补录。');
  }
}

main().catch((e) => {
  console.error('[collect] 失败：' + (e.message || e));
  process.exitCode = 1;
});
