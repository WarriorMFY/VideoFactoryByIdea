#!/usr/bin/env node
/**
 * bench_peers.mjs — 赛道基线：及格线在哪、新稿正常水位是多少
 *
 * 为什么要有它（loop13 起因）：
 *   平台判卷（collect_creator_stats）T+1 才有，且只告诉你"这稿几分"，不告诉你"及格线在哪"。
 *   没有及格线，改稿全靠感觉；有了及格线，才知道哪条该改、改到多少算改对。
 *
 * 采两组样本（这个区分是关键，别混着用）：
 *   HOT   order=click   → 历史爆款的**形态范式**（时长、标题句式、收藏率）。
 *         实测：该赛道 order=click 前 20 全是 500–2000 天前的老片，近期无大爆款，
 *         所以这一组**不看热度只看形态**（短视频范式在 1–3 年内基本稳定）。
 *   FRESH order=pubdate → 近 30 天新稿的**播放水位**。用来回答"我们播放 5 是不是很差"。
 *         实测：新稿播放 0/10/255/492 都有，5 播放属于正常起点，不是失败证据。
 *         没有这一组，就会把"新号起点"误读成"内容做砸了"。
 *
 * 为什么必须走登录态浏览器：
 *   零登录直连搜索接口会随机返回 HTML（风控），实测 5 个词里有 2 个被打回。
 *   用 Workspace/run/bili_profile 里的 cookie 打 api.bilibili.com，实测 4/4 通。
 *
 * 用法：
 *   node Tool/ops/bench_peers.mjs
 *   node Tool/ops/bench_peers.mjs --kw 剪辑技巧,剪映教程 --pages 2 --dry-run
 *
 * 产物：
 *   History/bench/peers_<date>.md    基线表 + 我们偏离了哪几条
 *   History/bench/peers_<date>.json  原始样本（可复查 bvid）
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../lib/ff.mjs';
import { launchProfile, loginState, sleep } from '../lib/pw.mjs';

const args = process.argv.slice(2);
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const has = (k) => args.includes(k);

const KWS = (getOpt('--kw', '剪辑技巧,剪映教程,视频剪辑提速,剪辑效率') || '').split(',').map((s) => s.trim()).filter(Boolean);
const PAGES = Number(getOpt('--pages', '2')) || 2;
const HOT_MAX_DUR = Number(getOpt('--hotmaxdur', '600')) || 600;  // 5–10 分钟内算"技巧短片/小教程"
const FRESH_DAYS = Number(getOpt('--freshdays', '30')) || 30;
const DRY = has('--dry-run');

const OURS = {
  bvid: getOpt('--ours-bvid', 'BV1AaxC6hExH'),
  title: getOpt('--ours-title', '5 个剪辑提速技巧｜英文原声 + 中英双语字幕，照着做能省一半时间'),
  duration_s: Number(getOpt('--ours-dur', '38')) || 38,
  play: Number(getOpt('--ours-play', '5')) || 5,
};

const OUT_DIR = path.join(ROOT, 'History', 'bench');

const numOr = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
function dur2s(s) {
  if (!s || typeof s !== 'string') return null;
  const p = s.split(':').map(Number);
  if (p.some((x) => !Number.isFinite(x))) return null;
  return p.reduce((a, b) => a * 60 + b, 0);
}
const clean = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();

function quantile(arr, q) {
  const a = arr.filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return null;
  const pos = (a.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return lo === hi ? a[lo] : a[lo] + (a[hi] - a[lo]) * (pos - lo);
}
const med = (a) => quantile(a, 0.5);
const r1 = (x) => (x == null ? '—' : Math.round(x * 10) / 10);
const pct = (x) => (x == null ? '—' : `${(x * 100).toFixed(2)}%`);

/** 标题特征：只抽"能照着改"的 */
function feat(t) {
  return {
    len: t.length,
    num: /\d/.test(t),
    q: /[？?]|为什么|怎么|如何|居然|竟然|原来|你还在|别再|学废/.test(t),
    benefit: /省|效率|倍|分钟|秒|新手|保姆|入门|必学|干货|学会|搞定|一键|学会/.test(t),
    pipe: /[｜|]/.test(t),
  };
}

function stat(list, key) {
  const v = list.map((r) => r[key]).filter((x) => Number.isFinite(x));
  return { n: v.length, p25: quantile(v, 0.25), p50: quantile(v, 0.5), p75: quantile(v, 0.75), p90: quantile(v, 0.9) };
}

async function main() {
  const { ctx, page, info } = await launchProfile({ headless: true });
  let hot = [], fresh = [];
  try {
    const st = await loginState(ctx);
    console.log(`登录态：${st.loggedIn ? 'UID=' + st.uid : '未登录（搜索接口可能被风控，结果会缺）'}｜${info.channel}`);

    await page.goto('https://search.bilibili.com/all', { waitUntil: 'domcontentloaded', timeout: 40000 });
    await sleep(2000);

    const pull = async (kw, order, pg) => {
      const u = `https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=${encodeURIComponent(kw)}&order=${order}&page=${pg}`;
      const r = await page.evaluate(async (x) => {
        const res = await fetch(x, { credentials: 'include' });
        return { s: res.status, t: await res.text() };
      }, u);
      if (!r.t.trim().startsWith('{')) throw new Error(`非 JSON（HTTP ${r.s}）`);
      const j = JSON.parse(r.t);
      if (j.code !== 0) throw new Error(`code=${j.code} ${j.message}`);
      return j.data?.result || [];
    };

    const norm = (v, kw, grp) => {
      const title = clean(v.title);
      const d = dur2s(v.duration);
      const play = numOr(v.play);
      if (!d || play == null) return null;
      return {
        grp, kw, bvid: v.bvid, title, duration_s: d, play,
        like: numOr(v.like), fav: numOr(v.favorites), review: numOr(v.review),
        pubdate: numOr(v.pubdate), age_d: Math.round((Date.now() / 1000 - (v.pubdate || 0)) / 86400),
        fav_rate: numOr(v.favorites) != null && play ? numOr(v.favorites) / play : null,
        like_rate: numOr(v.like) != null && play ? numOr(v.like) / play : null,
        cover: v.pic ? (v.pic.startsWith('//') ? 'https:' + v.pic : v.pic) : null,
        ...feat(title),
      };
    };

    const now = Math.floor(Date.now() / 1000);
    for (const kw of KWS) {
      for (let pg = 1; pg <= PAGES; pg++) {
        try {
          for (const v of await pull(kw, 'click', pg)) {
            const r = norm(v, kw, 'hot');
            if (r && r.duration_s <= HOT_MAX_DUR) hot.push(r);   // 只看"技巧短片/小教程"，剔除 6 小时合集
          }
        } catch (e) { console.error(`[HOT 跳过] ${kw} p${pg}: ${e.message}`); }
        await sleep(2200);
      }
      try {
        for (const v of await pull(kw, 'pubdate', 1)) {
          const r = norm(v, kw, 'fresh');
          if (r && now - (r.pubdate || 0) < FRESH_DAYS * 86400) fresh.push(r);
        }
      } catch (e) { console.error(`[FRESH 跳过] ${kw}: ${e.message}`); }
      await sleep(2200);
      console.log(`  ${kw}: HOT ${hot.length}｜FRESH ${fresh.length}`);
    }

    // 去重（同 bvid 可能命中多个关键词）
    const dedup = (a) => { const s = new Set(); return a.filter((r) => (s.has(r.bvid) ? false : (s.add(r.bvid), true))); };
    hot = dedup(hot); fresh = dedup(fresh);

    if (hot.length < 8) throw new Error(`HOT 样本太少（${hot.length}），放宽 --hotmaxdur 或换关键词`);

    const base = {
      hot_n: hot.length,
      dur: stat(hot, 'duration_s'),
      title_len: med(hot.map((r) => r.len)),
      fav_rate: med(hot.map((r) => r.fav_rate)),
      like_rate: med(hot.map((r) => r.like_rate)),
      num_share: hot.filter((r) => r.num).length / hot.length,
      q_share: hot.filter((r) => r.q).length / hot.length,
      benefit_share: hot.filter((r) => r.benefit).length / hot.length,
      pipe_share: hot.filter((r) => r.pipe).length / hot.length,
      fresh_n: fresh.length,
      fresh_play: stat(fresh, 'play'),
      fresh_age_med: med(fresh.map((r) => r.age_d)),
    };

    // 我们的稿 vs 基线
    const of = feat(OURS.title);
    const dev = [];
    if (base.dur.p50) {
      const ratio = OURS.duration_s / base.dur.p50;
      dev.push({
        item: '时长', ours: `${OURS.duration_s}s`,
        bench: `中位 ${r1(base.dur.p50)}s（P25 ${r1(base.dur.p25)} / P75 ${r1(base.dur.p75)}）`,
        verdict: ratio > 0.6 && ratio < 1.6 ? '在区间内' : ratio >= 1.6 ? '偏长' : '偏短',
      });
    }
    dev.push({
      item: '标题字数', ours: `${of.len} 字`, bench: `中位 ${r1(base.title_len)} 字`,
      verdict: of.len <= base.title_len * 1.25 ? '在区间内' : '偏长（列表页会截断，且信息密度被稀释）',
    });
    dev.push({
      item: '含数字', ours: of.num ? '有' : '无', bench: `${(base.num_share * 100).toFixed(0)}% 的样本有`,
      verdict: of.num ? '符合惯例' : '偏离（数字是最便宜的可信度）',
    });
    dev.push({
      item: '收益承诺', ours: of.benefit ? '有' : '无', bench: `${(base.benefit_share * 100).toFixed(0)}% 的样本有`,
      verdict: of.benefit ? '符合惯例' : '偏离',
    });
    dev.push({
      item: '带「｜副标题」', ours: of.pipe ? '有' : '无', bench: `${(base.pipe_share * 100).toFixed(0)}% 的样本有`,
      verdict: of.pipe ? '常见（但要看副标题是不是观众收益）' : '少见',
    });
    if (base.fresh_play.p50 != null) {
      dev.push({
        item: '播放', ours: `${OURS.play}`,
        bench: `新稿中位 ${r1(base.fresh_play.p50)}（P75 ${r1(base.fresh_play.p75)} / P90 ${r1(base.fresh_play.p90)}）`,
        verdict: OURS.play >= base.fresh_play.p50 ? '不低于新稿水位' : '低于新稿水位（不是内容问题，是还没起量）',
      });
    }

    const at = new Date();
    const day = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;

    // 把"我们处在水位哪个位置"说清楚——只列表不给结论，等于没做
    const fp = base.fresh_play;
    const posVerdict = fp.p25 == null ? '样本不足，无法定位'
      : OURS.play < fp.p25
        ? `**低于 P25（${r1(fp.p25)}）** —— 连最差的那 1/4 都没到，说明**冷启动推荐池没进**。这不是"内容做砸了"，是"分发入口没打开"`
        : OURS.play < fp.p50
          ? `低于中位（${r1(fp.p50)}），但在正常波动区间内`
          : `高于中位（${r1(fp.p50)}），属于新稿里跑得好的那一半`;

    const md = [
      `# 赛道基线 · ${day}`,
      '',
      `- 关键词：${KWS.join('、')}｜每词 ${PAGES} 页`,
      `- **HOT 组 ${base.hot_n} 条**：order=click，剔除 >${HOT_MAX_DUR}s 的长合集 → 只看**形态范式**（近期无大爆款，别用这组谈热度）`,
      `- **FRESH 组 ${base.fresh_n} 条**：order=pubdate 近 ${FRESH_DAYS} 天（中位 ${r1(base.fresh_age_med)} 天龄）→ 只看**新稿水位**`,
      '',
      '## 1. 形态基线（HOT）',
      '',
      '| 指标 | P25 | 中位 | P75 |',
      '| --- | --- | --- | --- |',
      `| 时长 | ${r1(base.dur.p25)}s | **${r1(base.dur.p50)}s** | ${r1(base.dur.p75)}s |`,
      `| 收藏率（收藏/播放） | — | **${pct(base.fav_rate)}** | — |`,
      `| 点赞率 | — | ${pct(base.like_rate)} | — |`,
      `| 标题字数 | — | **${r1(base.title_len)} 字** | — |`,
      '',
      `标题写法：含数字 ${(base.num_share * 100).toFixed(0)}%｜疑问/悬念 ${(base.q_share * 100).toFixed(0)}%`
        + `｜收益承诺 ${(base.benefit_share * 100).toFixed(0)}%｜带「｜」${(base.pipe_share * 100).toFixed(0)}%`,
      '',
      '> 教程类内容里**收藏率比点赞率更能代表「有用」**（有用才存，好看才赞）。'
        + '现有判定规则用的是点赞率 3% 阈值，口径偏了，应按上表收藏率中位校准。',
      '',
      '## 2. 新稿水位（FRESH，回答「播放 5 是不是很差」）',
      '',
      `| 分位 | 播放 |`,
      `| --- | --- |`,
      `| P25 | ${r1(base.fresh_play.p25)} |`,
      `| 中位 | ${r1(base.fresh_play.p50)} |`,
      `| P75 | ${r1(base.fresh_play.p75)} |`,
      `| P90 | ${r1(base.fresh_play.p90)} |`,
      '',
      `我们的 ${OURS.play} 播放对照这个分布看，才知道是"没起量"还是"做砸了"。`,
      '',
      `**定位：${posVerdict}。**`,
      '',
      '> 这组是**随机新稿**（不是爆款），所以它衡量的是"正常水位"而不是"及格线"。'
        + '播放低于 P25 时先查分发（标题首屏/标签/分区/发布时间），别急着改内容。',
      '',
      '## 3. 我们的稿 vs 基线',
      '',
      `对比对象：\`${OURS.bvid}\`（${OURS.duration_s}s，标题 ${of.len} 字）`,
      '',
      '| 项 | 我们 | 基线 | 判断 |',
      '| --- | --- | --- | --- |',
      ...dev.map((d) => `| ${d.item} | ${d.ours} | ${d.bench} | ${d.verdict} |`),
      '',
      '## 4. HOT 样本标题（按播放降序前 15，看句式）',
      '',
      ...hot.sort((a, b) => b.play - a.play).slice(0, 15)
        .map((r, i) => `${i + 1}. \`${r.duration_s}s\` ${r.title.replace(/\|/g, '\\|')}`),
      '',
      '---',
      '',
      '> 复现：`node Tool/ops/bench_peers.mjs`　原始样本：`History/bench/peers_' + day + '.json`',
    ].join('\n');

    console.log('\n=== 形态基线（HOT） ===');
    console.log(`n=${base.hot_n}｜时长中位 ${r1(base.dur.p50)}s（P25 ${r1(base.dur.p25)} / P75 ${r1(base.dur.p75)}）`);
    console.log(`标题中位 ${r1(base.title_len)} 字｜收藏率中位 ${pct(base.fav_rate)}｜点赞率中位 ${pct(base.like_rate)}`);
    console.log('\n=== 新稿水位（FRESH） ===');
    console.log(`n=${base.fresh_n}｜播放 P25 ${r1(base.fresh_play.p25)} / 中位 ${r1(base.fresh_play.p50)} / P75 ${r1(base.fresh_play.p75)} / P90 ${r1(base.fresh_play.p90)}`);
    console.log('\n=== 我们 vs 基线 ===');
    for (const d of dev) console.log(`  ${d.item}: ${d.ours} vs ${d.bench} → ${d.verdict}`);

    if (DRY) { console.log('\n--dry-run：未落盘'); return; }
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, `peers_${day}.md`), md, 'utf8');
    fs.writeFileSync(path.join(OUT_DIR, `peers_${day}.json`),
      JSON.stringify({ collected_at: at.toISOString(), kws: KWS, pages: PAGES, hot_max_dur: HOT_MAX_DUR, fresh_days: FRESH_DAYS, base, ours: OURS, dev, hot, fresh }, null, 2), 'utf8');
    console.log(`\n已写：History/bench/peers_${day}.md（+ .json）`);
  } finally {
    await ctx.close();
  }
}

main().catch((e) => { console.error(`\n[失败] ${e.message}`); process.exitCode = 1; });
