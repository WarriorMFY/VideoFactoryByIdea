#!/usr/bin/env node
/**
 * collect_creator_stats.mjs — 取「平台判卷」：完播率/跳出率/点击转化 vs 同类中位数
 *
 * 为什么要有它（loop13 起因）：
 *   collect_feedback 走的是零登录公开接口，拿得到播放/点赞/评论，**拿不到完播率和平均播放时长**——
 *   而这两个才是"内容好不好"的直接证据，公开接口里永远没有（loop12 一直挂在"采集缺口 P1"）。
 *   实测（2026-10-31 17:2x）：登录态打 `/x/web/data/archive_diagnose/compare` 能一次拿到 53 个字段，
 *   其中 37 个在 not_ready_field 里，说明平台是 **T+1 每日 12:00 更新**（创作中心首页也这么写）。
 *   也就是说：这个接口是"慢，但准"——它给的是平台自己的判卷，还附同类中位数。
 *
 * 口径纪律（loop12 的血教训）：
 *   not_ready_field 里的字段一律写 null，**绝不用 0 冒充**。
 *   "还没算出来"和"算出来是 0"是两件事，混在一起会推出假结论（假 P0「重做前 3 秒」就是这么来的）。
 *
 * 用法：
 *   node Tool/ops/collect_creator_stats.mjs                # 采一次，落盘 + 打印摘要
 *   node Tool/ops/collect_creator_stats.mjs --dry-run      # 只打印，不写文件
 *   node Tool/ops/collect_creator_stats.mjs --size 30      # 多取几条稿件做对比
 *   node Tool/ops/collect_creator_stats.mjs --headless 0   # 想看着它点（调试用）
 *
 * 产物：
 *   History/runs/creator/<YYYY-MM-DD>.json   当日全量（含 not_ready 清单，便于日后回看平台何时给数）
 *   History/runs/creator/series.jsonl        一次一行（趋势用；同一天多次跑只留最后一条）
 *
 * 依赖登录态：Workspace/run/bili_profile（publish_bilibili.mjs login 时写入，实测 14 条 cookie 有效）
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../lib/ff.mjs';
import { launchProfile, loginState, sleep } from '../lib/pw.mjs';

const args = process.argv.slice(2);
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const has = (k) => args.includes(k);

const SIZE = Number(getOpt('--size', '20')) || 20;
const DRY = has('--dry-run');
const HEADLESS = getOpt('--headless', '1') !== '0';
const OUT_DIR = path.join(ROOT, 'History', 'runs', 'creator');
const SERIES = path.join(OUT_DIR, 'series.jsonl');
const FEEDBACK_LATEST = path.join(ROOT, 'History', 'runs', 'feedback', 'latest.json');

/** 空值语义：'' / undefined / NaN → null，0 保持 0（0 是合法数值） */
const numOr = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** 我们从 53 个字段里只要这些（按"能回答什么问题"分组，不图全） */
const WANT = {
  // 计数（与公开接口可对账）
  play: '播放', like: '点赞', coin: '投币', fav: '收藏', comment: '评论', dm: '弹幕',
  share: '分享', unfollow: '取关', total_new_attention_cnt: '新增关注',
  // 质量指标（这才是本轮要的）
  full_play_ratio: '完播率',
  avg_play_time: '平均播放时长(s)',
  play_viewer_rate: '封面点击转化',
  crash_rate: '跳出率',
  interact_rate: '互动率',
  play_fan_rate: '播放转粉率',
  play_trans_fan_rate: '播放转化率',
  tm_rate: '停留率',
  // 同类基准（_med = 比率中位数；_p50 = 分位原始值）
  full_play_ratio_med: '完播率·同类中位',
  crash_rate_med: '跳出率·同类中位',
  interact_rate_med: '互动率·同类中位',
  play_viewer_rate_med: '点击转化·同类中位',
  play_fan_rate_med: '转粉率·同类中位',
  crash_p50: '跳出·同类P50',
  interact_p50: '互动·同类P50',
  play_trans_fan_p50: '播放转化·同类P50',
};

function parseItem(it) {
  const st = it.stat || {};
  const notReady = new Set(Array.isArray(st.not_ready_field) ? st.not_ready_field : []);
  const vals = {};
  const missing = [];
  for (const [k, label] of Object.entries(WANT)) {
    if (k in st === false) { vals[k] = null; missing.push(k); continue; }
    if (notReady.has(k)) { vals[k] = null; missing.push(k); continue; }  // 未就绪 ≠ 0
    vals[k] = numOr(st[k]);
  }
  return {
    aid: it.aid,
    bvid: it.bvid,
    title: it.title,
    duration_s: numOr(it.duration),
    pubtime: it.pubtime ? new Date(it.pubtime * 1000).toISOString() : null,
    is_only_self: !!it.is_only_self,
    values: vals,
    not_ready: missing,
    not_ready_count: notReady.size,
  };
}

/** 与公开口径对账：创作中心 play 一般 ≥ 公开 views，差了要明说 */
function reconcile(items) {
  if (!fs.existsSync(FEEDBACK_LATEST)) return '无 feedback/latest.json，跳过对账';
  try {
    const fb = JSON.parse(fs.readFileSync(FEEDBACK_LATEST, 'utf8'));
    if (!fb.bvid) return '最近一次公开采集没有 bvid，跳过对账';
    const me = items.find((x) => x.bvid === fb.bvid);
    if (!me) return `公开口径针对 ${fb.bvid}，但创作中心列表里没有它`;
    const pub = numOr(fb?.stat?.view);
    const cre = me.values.play;
    if (pub == null || cre == null) return '一侧缺数，无法对账';
    const d = cre - pub;
    return d === 0 ? `对账一致（play=${cre}）` : `创作中心 play=${cre}，公开 views=${pub}，差 ${d > 0 ? '+' : ''}${d}（正常：创作中心更新更早）`;
  } catch (e) {
    return `对账失败：${e.message.split('\n')[0]}`;
  }
}

// 平台口径：比率类字段是「万分之一」整数（full_play_ratio=9210 表示 92.10%，play_viewer_rate=10000 表示 100%）。
// 2026-11-01 修正：原先写 v*100，把 9210 打成 921000.00%，导致 11-01 13:02 首次落盘的内存看数全错（落盘 JSON 原值正确）。
function fmt(v, key) {
  if (v === null) return '未就绪';
  if (key.endsWith('_ratio') || key.endsWith('_rate') || key.endsWith('_med')) return `${(v / 100).toFixed(2)}%`;
  return String(v);
}

async function main() {
  const { ctx, page, info } = await launchProfile({ headless: HEADLESS });
  try {
    const st = await loginState(ctx);
    if (!st.loggedIn) {
      throw new Error('未登录创作中心。先跑：node Tool/ops/publish_bilibili.mjs login');
    }
    console.log(`登录态：UID=${st.uid}（cookie ${st.cookieCount} 条）｜浏览器 ${info.channel}`);

    // 同源 fetch：带 cookie，且日后接口要 x-bili-device-req-json 签名时也不用改（走页面上下文自然带上）
    await page.goto('https://member.bilibili.com/platform/upload-manager/article',
      { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(2500);

    const res = await page.evaluate(async (size) => {
      const r = await fetch(`/x/web/data/archive_diagnose/compare?size=${size}`, { credentials: 'include' });
      return { status: r.status, text: await r.text() };
    }, SIZE);

    let body;
    try {
      body = JSON.parse(res.text);
    } catch {
      throw new Error(`接口返回的不是 JSON（HTTP ${res.status}）：${res.text.slice(0, 120)}`);
    }
    if (body.code !== 0) throw new Error(`接口返回 code=${body.code}：${body.message || ''}`);

    const list = body.data?.list || [];
    if (!list.length) throw new Error('接口返回空列表：账号下没有已发布稿件，或接口口径变了');

    const items = list.map(parseItem);
    const now = new Date();
    // 日期用**本地**年月日（与 collect_feedback 的 feedback.csv 口径一致）；
    // at 用 ISO（UTC）留标准时间戳。混用会导致凌晨 0–8 点的记录落到前一天。
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const at = now.toISOString();
    const reconcileNote = reconcile(items);

    // ---- 打印 ----
    console.log(`\n采集时间 ${day} ${now.toTimeString().slice(0, 5)}｜稿件 ${items.length} 条\n`);
    for (const it of items) {
      console.log(`● ${it.bvid}  ${it.duration_s ?? '?'}s  ${String(it.title).slice(0, 34)}`);
      const v = it.values;
      console.log(`    播放 ${v.play ?? '—'}｜完播 ${fmt(v.full_play_ratio, 'full_play_ratio')}`
        + `（同类中位 ${fmt(v.full_play_ratio_med, 'full_play_ratio_med')}）`
        + `｜均播 ${v.avg_play_time ?? '未就绪'}s`);
      console.log(`    跳出 ${fmt(v.crash_rate, 'crash_rate')}｜互动 ${fmt(v.interact_rate, 'interact_rate')}`
        + `｜点击转化 ${fmt(v.play_viewer_rate, 'play_viewer_rate')}`);
      if (it.not_ready.length) {
        console.log(`    未就绪 ${it.not_ready.length}/${Object.keys(WANT).length} 项（平台 T+1 12:00 更新，不是我们拿不到）`);
      } else {
        console.log('    全部字段已就绪');
      }
    }
    console.log(`\n对账：${reconcileNote}`);

    const readyCore = items.filter((x) => x.values.full_play_ratio !== null);
    console.log(readyCore.length
      ? `\n可用：${readyCore.length} 条稿件的完播率已就绪 → 可进 plan_next_loop 判定`
      : '\n注意：完播率仍未就绪（发布不足 T+1，或平台还没跑批）。这是**等**而不是**错**，别当 0 用。');

    if (DRY) { console.log('\n--dry-run：未落盘'); return; }

    // ---- 落盘 ----
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const dayFile = path.join(OUT_DIR, `${day}.json`);
    fs.writeFileSync(dayFile, JSON.stringify({ collected_at: at, uid: st.uid, size: SIZE, reconcile: reconcileNote, items }, null, 2), 'utf8');

    // series.jsonl：同日只留最后一条（重跑覆盖，不制造 48 行重复——loop12 的坑）
    const row = {
      at, day, uid: st.uid,
      items: items.map((x) => ({
        bvid: x.bvid,
        play: x.values.play,
        full_play_ratio: x.values.full_play_ratio,
        avg_play_time: x.values.avg_play_time,
        crash_rate: x.values.crash_rate,
        interact_rate: x.values.interact_rate,
        not_ready: x.not_ready.length,
      })),
    };
    const prev = fs.existsSync(SERIES)
      ? fs.readFileSync(SERIES, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
      : [];
    const kept = prev.filter((r) => r.day !== day);
    fs.writeFileSync(SERIES, [...kept, row].map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');

    console.log(`\n已写：${path.relative(ROOT, dayFile)}｜series.jsonl 共 ${kept.length + 1} 天`);
  } finally {
    await ctx.close();
  }
}

main().catch((e) => {
  console.error(`\n[失败] ${e.message}`);
  process.exitCode = 1;
});
