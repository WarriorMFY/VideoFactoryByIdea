#!/usr/bin/env node
/**
 * track_bilibili.mjs — 已发布作品的动态跟踪（枚举 → 打点 → 增量报告）
 *
 * 为什么这么分三步：
 *   - 枚举（roster）必须登录：空间接口按 IP 强风控（实测 `space/wbi/arc/search` 自算 wbi 签名
 *     仍返回 -412 request was banned，旧版接口 -799 频控），member 接口无 cookie 直接 -101。
 *   - 打点（snap）不需要登录：`x/web-interface/view` 公开可用，实测稳定，
 *     所以**登录态过期也不影响长期跟踪**，只有新增作品时才会漏掉一条。
 *   - 报告（report）纯本地读盘，不联网。
 *
 * 命令：
 *   node Tool/ops/track_bilibili.mjs status                       看登录态 / 作品数 / 最近打点
 *   node Tool/ops/track_bilibili.mjs roster  [--mid 3747573749779036]  枚举全部作品（需登录）
 *   node Tool/ops/track_bilibili.mjs snap    [--bvid BVxxx ...]   打点（免登录）
 *   node Tool/ops/track_bilibili.mjs report                       生成增量报告
 *   node Tool/ops/track_bilibili.mjs run                          三步串起来（定时任务用这个）
 *
 * 产物（都在 History/publish/bilibili/track/，属过程留痕）：
 *   account.json            账号档案（mid / 昵称 / 粉丝 / 作品数）
 *   roster.json             作品清单（bvid / 标题 / 发布时间 / 分区 / 状态）
 *   snapshots/<ts>.json     单次打点全量
 *   snapshots/index.jsonl   每次打点一行（账号级汇总，画趋势用）
 *   report.md               人类可读的增量报告（最近一次 vs 上一次）
 *
 * 边界：只读不写线上。不刷、不评、不改稿件；数据全部来自接口实际返回值，缺就留 null 不补。
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../lib/ff.mjs';
import { launchProfile, loginState, sleep } from '../lib/pw.mjs';

const TRACK = path.join(ROOT, 'History', 'publish', 'bilibili', 'track');
const SNAPS = path.join(TRACK, 'snapshots');
const ACCOUNT_F = path.join(TRACK, 'account.json');
const ROSTER_F = path.join(TRACK, 'roster.json');
const INDEX_F = path.join(SNAPS, 'index.jsonl');

const UA = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  referer: 'https://www.bilibili.com/',
  accept: 'application/json, text/plain, */*',
  'accept-language': 'zh-CN,zh;q=0.9',
};

const argv = process.argv.slice(2);
const CMD = argv[0] || 'status';
const getOpt = (k, d = '') => (argv.includes(k) ? argv[argv.indexOf(k) + 1] ?? d : d);
const getAll = (k) => argv.reduce((acc, v, i) => (v === k && argv[i + 1] ? [...acc, argv[i + 1]] : acc), []);

const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);
const readJson = (f, d = null) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return d;
  }
};
const writeJson = (f, o) => {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(o, null, 2));
};

// ---------- 账号级公开数据（免登录） ----------
async function fetchCard(mid) {
  const r = await fetch(`https://api.bilibili.com/x/web-interface/card?mid=${mid}`, { headers: UA });
  const j = await r.json();
  if (j.code !== 0) throw new Error(`card 接口失败 ${j.code} ${j.message}`);
  return {
    mid: String(mid),
    name: j.data.card?.name || null,
    sign: j.data.card?.sign || null,
    follower: j.data.follower ?? null,
    like_num: j.data.like_num ?? null,
    archive_count: j.data.archive_count ?? null,
  };
}

// ---------- 单条作品（免登录，稳定路径） ----------
async function fetchView(bvid, tries = 3) {
  for (let i = 1; i <= tries; i++) {
    try {
      const r = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, { headers: UA });
      const j = await r.json();
      if (j.code === 0) {
        const d = j.data;
        return {
          bvid,
          aid: d.aid,
          ok: true,
          title: d.title,
          pubdate: d.pubdate,
          duration: d.duration,
          tid: d.tid,
          tname: d.tname,
          state: d.state,
          stat: {
            view: d.stat.view,
            like: d.stat.like,
            coin: d.stat.coin,
            favorite: d.stat.favorite,
            share: d.stat.share,
            reply: d.stat.reply,
            danmaku: d.stat.danmaku,
          },
        };
      }
      // 已知不可见码直接翻译（来自实测），免得报告里只剩裸数字
      const HIDDEN = {
        62012: '仅UP主自己可见（state=-50，审核中或被设为私享）',
        62002: '稿件不可见（可能已删除）',
        '-404': '查无此稿（已删除或 BV 号有误）',
      };
      if (HIDDEN[j.code]) return { bvid, ok: false, code: j.code, message: HIDDEN[j.code] };
      if ([-404, 62002, -799, -412].includes(j.code)) {
        return { bvid, ok: false, code: j.code, message: j.message || '不可见' };
      }
    } catch (e) {
      if (i === tries) return { bvid, ok: false, code: 'NET', message: e.message };
    }
    await sleep(800 * i);
  }
  return { bvid, ok: false, code: 'RATE', message: '多次重试仍被频控' };
}

// ---------- 枚举（需登录） ----------
/** 在登录态页面里调 member 接口：cookie 自动带上，不用手攒 */
async function fetchRosterInPage(page) {
  const out = await page.evaluate(async () => {
    const all = [];
    let total = null;
    for (let pn = 1; pn <= 20; pn++) {
      const u = `https://member.bilibili.com/x/web/archives?pn=${pn}&ps=50&status=&time=&keyword=`;
      const r = await fetch(u, { credentials: 'include' });
      const j = await r.json();
      if (j.code !== 0) return { error: { code: j.code, message: j.message }, got: all.length };
      const d = j.data || {};
      total = d.page?.total ?? d.page?.count ?? total;
      const arr = d.arc_audits || d.vlist || d.archives || [];
      for (const it of arr) {
        const a = it.Archive || it.archive || it;
        all.push({
          bvid: a.bvid,
          aid: a.aid,
          title: a.title,
          pubdate: a.ptime || a.pubdate || null,
          ctime: a.ctime || null,
          duration: a.duration ?? null,
          tid: a.tid ?? null,
          state: a.state ?? null,
          state_desc: a.state_desc || a.reject_reason || null,
          is_only_self: a.is_only_self ?? null,
        });
      }
      const size = d.page?.size ?? 50;
      if (arr.length < size || (total && all.length >= total)) break;
      await new Promise((res) => setTimeout(res, 400));
    }
    return { total, list: all };
  });
  return out;
}

async function cmdRoster() {
  const midOpt = getOpt('--mid', '');
  const acc = readJson(ACCOUNT_F, {});
  const mid = midOpt || acc.mid;
  if (!mid) throw new Error('缺 mid：先跑 snap（从作品反查 mid）或传 --mid');

  const { ctx, page, info } = await launchProfile({ headless: true });
  try {
    const st = await loginState(ctx);
    log(`浏览器 ${info.channel}｜登录态 ${st.loggedIn ? `UID=${st.uid}` : '未登录'}`);
    if (!st.loggedIn) throw new Error('枚举需要登录：先跑 node Tool/ops/publish_bilibili.mjs login');

    // 必须先落在 member 域上，页面内 fetch 才是同源带 cookie
    await page.goto('https://member.bilibili.com/platform/upload-manager/article', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await sleep(2500);

    const res = await fetchRosterInPage(page);
    if (res.error) throw new Error(`member 接口 ${res.error.code} ${res.error.message}（已取 ${res.got} 条）`);
    const list = res.list.filter((x) => x.bvid);
    log(`枚举到 ${list.length} 条（接口 total=${res.total ?? '?'}）`);

    const card = await fetchCard(mid).catch(() => null);
    const account = { ...(card || acc), mid: String(mid), updatedAt: new Date().toISOString() };
    writeJson(ACCOUNT_F, account);
    writeJson(ROSTER_F, { at: new Date().toISOString(), mid: String(mid), total: res.total ?? list.length, works: list });
    log(`清单 ${path.relative(ROOT, ROSTER_F)}｜账号 ${account.name || '?'} 作品数 ${account.archive_count ?? '?'}`);
    return list;
  } finally {
    await ctx.close().catch(() => {});
  }
}

// ---------- 打点 ----------
async function cmdSnap() {
  const extra = getAll('--bvid');
  const roster = readJson(ROSTER_F, { works: [] });
  const known = (roster.works || []).map((w) => w.bvid);
  const set = [...new Set([...known, ...extra])].filter(Boolean);
  if (!set.length) throw new Error('没有可打点的作品：先跑 roster，或传 --bvid BVxxx');

  const acc0 = readJson(ACCOUNT_F, {});
  const midOpt = getOpt('--mid', acc0.mid);
  let account = null;
  if (midOpt) {
    account = await fetchCard(midOpt).catch((e) => {
      log(`⚠ 账号卡接口失败：${e.message}`);
      return null;
    });
    if (account) writeJson(ACCOUNT_F, { ...account, updatedAt: new Date().toISOString() });
  } else {
    log('⚠ 没有 mid，跳过账号级数据（粉丝/总作品数）');
  }

  log(`开始打点 ${set.length} 条…`);
  const items = [];
  for (const [i, bvid] of set.entries()) {
    const v = await fetchView(bvid);
    items.push(v);
    const tag = v.ok ? `${String(v.stat.view).padStart(7)} 播 / ${v.stat.like} 赞` : `✗ ${v.code} ${v.message || ''}`;
    log(`  ${i + 1}/${set.length} ${bvid} ${v.ok ? `「${(v.title || '').slice(0, 18)}」${tag}` : tag}`);
    await sleep(350);
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const snap = {
    at: new Date().toISOString(),
    account,
    counts: {
      works: items.length,
      visible: items.filter((x) => x.ok).length,
      hidden: items.filter((x) => !x.ok).length,
    },
    totals: items.filter((x) => x.ok).reduce(
      (a, x) => {
        for (const k of ['view', 'like', 'coin', 'favorite', 'share', 'reply', 'danmaku']) a[k] += x.stat[k] || 0;
        return a;
      },
      { view: 0, like: 0, coin: 0, favorite: 0, share: 0, reply: 0, danmaku: 0 }
    ),
    items,
  };
  writeJson(path.join(SNAPS, `${ts}.json`), snap);
  fs.mkdirSync(SNAPS, { recursive: true });
  fs.appendFileSync(
    INDEX_F,
    JSON.stringify({
      at: snap.at,
      file: `${ts}.json`,
      follower: account?.follower ?? null,
      archive_count: account?.archive_count ?? null,
      works: snap.counts.works,
      visible: snap.counts.visible,
      ...snap.totals,
    }) + '\n'
  );
  writeJson(path.join(TRACK, 'latest.json'), snap);
  log(`已落盘 ${path.relative(ROOT, path.join(SNAPS, `${ts}.json`))}`);
  return snap;
}

// ---------- 报告 ----------
function listSnaps() {
  if (!fs.existsSync(SNAPS)) return [];
  return fs
    .readdirSync(SNAPS)
    .filter((f) => /^\d{4}-\d{2}-\d{2}T.*\.json$/.test(f))
    .sort();
}

const fmt = (n) => (n == null ? '—' : n.toLocaleString('en-US'));
const signed = (n) => (n == null ? '—' : n > 0 ? `+${n.toLocaleString('en-US')}` : n === 0 ? '0' : `−${Math.abs(n).toLocaleString('en-US')}`);
const dur = (s) => (s == null ? '—' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
/** 统一按北京时间输出：bilibili 的 pubdate 是秒级 unix，直接 toLocaleString 在报告里会被截断 */
const bj = (t) => {
  if (!t) return '—';
  const d = new Date((t + 8 * 3600) * 1000); // 手工 +8，避免依赖运行环境时区
  const p = (n) => String(n).padStart(2, '0');
  return { date: `${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())}`, time: `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}` };
};
const ymd = (t) => (t ? `${bj(t).date} ${bj(t).time}` : '—');
const ago = (t) => (t ? ((Date.now() / 1000 - t) / 3600).toFixed(1) + 'h' : '—');

function cmdReport() {
  const files = listSnaps();
  if (!files.length) throw new Error('还没有任何快照，先跑 snap');
  const cur = readJson(path.join(SNAPS, files[files.length - 1]));
  const prev = files.length > 1 ? readJson(path.join(SNAPS, files[files.length - 2])) : null;
  const prevMap = new Map((prev?.items || []).map((x) => [x.bvid, x]));
  const gapH = prev ? (new Date(cur.at) - new Date(prev.at)) / 3600000 : null;

  const rows = cur.items.map((x) => {
    const p = prevMap.get(x.bvid);
    const dv = x.ok && p?.ok ? x.stat.view - p.stat.view : null;
    const dl = x.ok && p?.ok ? x.stat.like - p.stat.like : null;
    const dc = x.ok && p?.ok ? x.stat.favorite - p.stat.favorite : null;
    const engagement = x.ok && x.stat.view > 0
      ? ((x.stat.like + x.stat.coin + x.stat.favorite + x.stat.share + x.stat.reply) / x.stat.view) * 100
      : null;
    return { x, dv, dl, dc, engagement, isNew: prev ? !p : false };
  });
  rows.sort((a, b) => (b.dv ?? -1) - (a.dv ?? -1) || (b.x.stat?.view ?? 0) - (a.x.stat?.view ?? 0));

  const t = cur.totals;
  const pt = prev?.totals;
  const dTot = (k) => (prev && pt ? t[k] - pt[k] : null);

  const alerts = [];
  for (const r of rows) {
    const x = r.x;
    if (!x.ok) {
      alerts.push(`**${x.bvid}** 取不到数据（${x.code} ${x.message || ''}）——审核中、已删除或仅自己可见，去创作中心确认`);
      continue;
    }
    const h = (Date.now() / 1000 - x.pubdate) / 3600;
    if (x.stat.view === 0 && h > 48) alerts.push(`**${x.bvid}**「${x.title}」发布 ${h.toFixed(0)}h 仍 0 播放——疑似未过审/推荐未生效`);
    if (r.dv != null && r.dv < 0) alerts.push(`**${x.bvid}**「${x.title}」播放回退 ${r.dv}——通常是数据修正，连续两轮出现就要查是否被限流`);
    if (r.isNew) alerts.push(`**${x.bvid}**「${x.title}」首次进入跟踪（新发布或此前漏采）`);
  }
  const dead = rows.filter((r) => !r.x.ok).length;

  const md = [];
  md.push(`# B 站跟踪报告 · ${new Date(cur.at).toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' })}`);
  md.push('');
  md.push(
    `> 账号 **${cur.account?.name || '—'}**（mid ${cur.account?.mid || '—'}）｜作品 **${cur.counts.works}** 条` +
      `（可见 ${cur.counts.visible}${dead ? ` / 不可见 ${dead}` : ''}）｜粉丝 **${fmt(cur.account?.follower)}**` +
      (prev?.account?.follower != null && cur.account?.follower != null
        ? `（${signed(cur.account.follower - prev.account.follower)}）`
        : '')
  );
  if (prev) md.push(`> 对比基准：${new Date(prev.at).toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' })}（间隔 ${gapH.toFixed(1)}h）`);
  else md.push('> 首次打点，没有基准，增量列留空。');
  md.push('');
  md.push('## 总览');
  md.push('');
  md.push('| 指标 | 当前 | 增量 |');
  md.push('| --- | ---: | ---: |');
  md.push(`| 播放 | ${fmt(t.view)} | ${signed(dTot('view'))} |`);
  md.push(`| 点赞 | ${fmt(t.like)} | ${signed(dTot('like'))} |`);
  md.push(`| 收藏 | ${fmt(t.favorite)} | ${signed(dTot('favorite'))} |`);
  md.push(`| 投币 | ${fmt(t.coin)} | ${signed(dTot('coin'))} |`);
  md.push(`| 评论 | ${fmt(t.reply)} | ${signed(dTot('reply'))} |`);
  md.push(`| 分享 | ${fmt(t.share)} | ${signed(dTot('share'))} |`);
  md.push(`| 弹幕 | ${fmt(t.danmaku)} | ${signed(dTot('danmaku'))} |`);
  md.push('');
  md.push('## 分片（按播放增量排序）');
  md.push('');
  md.push('| # | 标题 | 发布 | 时长 | 播放 | Δ播放 | 赞 | 藏 | 评 | 互动率 | BVID |');
  md.push('| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |');
  rows.forEach((r, i) => {
    const x = r.x;
    if (!x.ok) {
      md.push(`| ${i + 1} | — | — | — | ✗ ${x.code} | — | — | — | — | — | ${x.bvid} |`);
      return;
    }
    md.push(
      `| ${i + 1} | ${x.title.replace(/\|/g, '\\|').slice(0, 34)} | ${ymd(x.pubdate)} | ${dur(x.duration)} | ` +
        `${fmt(x.stat.view)} | ${signed(r.dv)} | ${fmt(x.stat.like)} | ${fmt(x.stat.favorite)} | ${fmt(x.stat.reply)} | ` +
        `${r.engagement == null ? '—' : r.engagement.toFixed(2) + '%'} | ${x.bvid} |`
    );
  });
  md.push('');
  md.push('## 需要你看一眼');
  md.push('');
  if (!alerts.length) md.push('- 无异常：所有作品都在正常累积数据。');
  else alerts.forEach((a) => md.push(`- ${a}`));
  md.push('');
  md.push('---');
  md.push('');
  md.push(`快照 ${files.length} 份，最近 5 次：${files.slice(-5).map((f) => f.replace('.json', '')).join(' · ')}`);
  md.push('');
  md.push('> 数据来自 B 站公开接口实际返回值；取不到的字段留 `—`，不做估算。');

  const out = path.join(TRACK, 'report.md');
  fs.writeFileSync(out, md.join('\n'));
  writeJson(path.join(TRACK, 'report.json'), {
    at: cur.at,
    prevAt: prev?.at || null,
    gapH,
    totals: { now: t, delta: Object.fromEntries(['view', 'like', 'favorite', 'coin', 'reply', 'share', 'danmaku'].map((k) => [k, dTot(k)])) },
    rows: rows.map((r) => ({
      bvid: r.x.bvid,
      title: r.x.ok ? r.x.title : null,
      view: r.x.ok ? r.x.stat.view : null,
      deltaView: r.dv,
      engagement: r.engagement,
    })),
    alerts,
  });
  log(`报告 ${path.relative(ROOT, out)}（${rows.length} 条，异常 ${alerts.length} 条）`);
  return out;
}

// ---------- status ----------
async function cmdStatus() {
  const acc = readJson(ACCOUNT_F, {});
  const roster = readJson(ROSTER_F, null);
  const files = listSnaps();
  let login = '未登录';
  try {
    const { ctx, info } = await launchProfile({ headless: true });
    const st = await loginState(ctx);
    login = st.loggedIn ? `已登录 UID=${st.uid}` : '未登录';
    log(`浏览器 ${info.channel}｜${login}`);
    await ctx.close().catch(() => {});
  } catch (e) {
    log(`浏览器不可用：${e.message}`);
  }
  log(`账号 ${acc.name || '—'}（mid ${acc.mid || '—'}）粉丝 ${fmt(acc.follower)}｜作品数 ${acc.archive_count ?? '—'}`);
  log(`清单 ${roster ? `${roster.works.length} 条 @ ${roster.at}` : '无（未跑过 roster）'}`);
  log(`快照 ${files.length} 份${files.length ? `｜最近 ${files[files.length - 1].replace('.json', '')}` : ''}`);
  if (!files.length) return;
  const last = readJson(path.join(SNAPS, files[files.length - 1]));
  log(`最近一次：${last.counts.visible} 条可见 / 合计 ${fmt(last.totals.view)} 播 ${fmt(last.totals.like)} 赞`);
}

function usage() {
  console.log(`track_bilibili — 已发布作品动态跟踪

  status                      登录态 / 清单 / 快照概况
  roster [--mid N]            枚举全部作品（需登录，写 roster.json）
  snap   [--bvid BVxxx ...]   打点（免登录，写 snapshots/<ts>.json）
  report                      生成 report.md（最近一次 vs 上一次）
  run                         串起来：能登录就刷新清单 → 打点 → 报告

产物：History/publish/bilibili/track/
`);
}

// ---------- 入口 ----------
try {
  if (CMD === 'status') await cmdStatus();
  else if (CMD === 'roster') await cmdRoster();
  else if (CMD === 'snap') await cmdSnap();
  else if (CMD === 'report') cmdReport();
  else if (CMD === 'run') {
    // 有登录态才刷新清单；没有就沿用旧清单继续打点，跟踪不因登录过期而中断
    try {
      await cmdRoster();
    } catch (e) {
      log(`⚠ 枚举跳过：${e.message}`);
    }
    await cmdSnap();
    cmdReport();
  } else usage();
} catch (e) {
  log('FATAL ' + (e.message || e));
  if (process.env.TRACK_DEBUG) console.error(e);
  process.exitCode = 1;
}
