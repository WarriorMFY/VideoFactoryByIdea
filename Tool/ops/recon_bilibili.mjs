#!/usr/bin/env node
/**
 * recon_bilibili.mjs — 市场侦查：B 站热门/分区/关键词数据 → 找出"当前工厂能力能快速交付"的选题
 *
 * 为什么这么写：
 *   1. 只读公开接口（popular / ranking / search），不登录、不抓播放地址、不做任何越权动作；
 *   2. 判断"能不能做"用的是**我们自己的量化能力**（不要靠感觉）：
 *        · 知识型内容（classify_content 那套信号在素材侧能算，市场侧只能用文本特征近似）
 *        · 时长：≤10 分钟 → 当天可交付；10–30 分钟 → 一天；>30 分钟 → 走长片流程
 *        · 是否需要翻译：标题/简介/标签里出现"英/双语/搬运/考研/编程/AI"等信号
 *   3. 输出两份：机器可读 JSON + 人可读 markdown（选题清单 + 依据 + 风险）
 *
 * 用法：node Tool/ops/recon_bilibili.mjs [--out History/loops/loop12] [--top 60]
 * 输出：<out>/market_raw.json、<out>/market_report.md
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../lib/ff.mjs';

const args = process.argv.slice(2);
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const OUT = path.resolve(ROOT, getOpt('--out', path.join('History', 'loops', 'loop12')));
const TOP = Number(getOpt('--top', 60));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const api = async (url, tag) => {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Referer: 'https://www.bilibili.com/' }, signal: AbortSignal.timeout(25000) });
    const j = await r.json();
    console.log(`[api] ${tag} HTTP ${r.status} code=${j?.code} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    return j;
  } catch (e) {
    console.log(`[api] ${tag} FAIL ${e.name} ${String(e.message).slice(0, 80)}`);
    return null;
  }
};

const fmtDur = (sec) => (sec >= 3600 ? `${(sec / 3600).toFixed(1)}h` : sec >= 60 ? `${Math.round(sec / 60)}m` : `${sec}s`);

// ---------- 1. 抓数据 ----------
const ranking = await api('https://api.bilibili.com/x/web-interface/ranking/v2?rid=0&type=all', 'ranking');
const popular = await api('https://api.bilibili.com/x/web-interface/popular?ps=50&pn=1', 'popular');
const KEYWORDS = (getOpt('--keywords', '') || '中英双语,英语教程,科普,AI 教程,纪录片 中字')
  .split(',').map((s) => s.trim()).filter(Boolean);
const searches = [];
for (const kw of KEYWORDS) {
  const j = await api(`https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=${encodeURIComponent(kw)}&page=1`, `search:${kw}`);
  if (j?.data?.result) {
    searches.push({
      keyword: kw, num_results: j.data.numResults, pages: j.data.numPages,
      top: j.data.result.slice(0, 8).map((v) => ({
        bvid: v.bvid, title: String(v.title || '').replace(/<[^>]+>/g, ''),
        author: v.author, play: v.play, danmaku: v.video_review, favorite: v.favorites,
        duration: v.duration, pubdate: v.pubdate, tag: v.tag,
      })),
    });
  }
}

const pick = (v) => ({
  bvid: v.bvid, aid: v.aid,
  title: String(v.title || '').replace(/<[^>]+>/g, ''),
  desc: String(v.desc || '').slice(0, 160),
  zone: v.tname || v.type_name || '',
  owner: v.owner?.name || v.author || '',
  duration_s: Number(v.duration) || 0,
  view: Number(v.stat?.view ?? v.play ?? 0),
  like: Number(v.stat?.like ?? 0),
  favorite: Number(v.stat?.favorite ?? v.favorites ?? 0),
  reply: Number(v.stat?.reply ?? v.video_review ?? 0),
  danmaku: Number(v.stat?.danmaku ?? 0),
  pubdate: Number(v.pubdate) || 0,
  url: v.bvid ? `https://www.bilibili.com/video/${v.bvid}` : '',
});
const pool = [...((ranking?.data?.list) || []).map(pick), ...((popular?.data?.list) || []).map(pick)];
const seen = new Set();
const uniq = pool.filter((v) => v.bvid && !seen.has(v.bvid) && seen.add(v.bvid));

// ---------- 2. 能力匹配打分 ----------
const KNOWLEDGE_ZONES = ['知识', '科技', '教育', '职场', '科学科普', '软件应用', '设计·创意', '纪录片', '数码'];
const BILINGUAL_HINT = /英[语文]|双语|中字|字幕|搬运|外[国网]|youtube|考研|托福|雅思|编程|代码|教程|AI|机器学习|深度学习|设计|剪辑|摄影|钢琴|吉他|演讲|TED|纪录片/i;
const HARD_HINT = /游戏|解说|直播|鬼畜|舞蹈|音乐|翻唱|影视剪辑|混剪|综艺|明星|剧情|恋爱|手工|美食|旅行|vlog/i;

function scoreOf(v) {
  const text = `${v.title} ${v.desc} ${v.zone}`;
  const zoneHit = KNOWLEDGE_ZONES.some((z) => v.zone.includes(z));
  const bilingual = BILINGUAL_HINT.test(text);
  const hard = HARD_HINT.test(text);
  const dur = v.duration_s;
  // 时长成本：≤10min 当天可交付；10–30min 一天；>30min 走长片流程（两次渲染 + 术语/回写）
  const durScore = dur === 0 ? 0.4 : dur <= 600 ? 1 : dur <= 1800 ? 0.65 : 0.35;
  // 数据表现：点赞率 + 收藏率 + 评论率（都做平滑，避免小样本爆表）
  const likeRate = v.view > 0 ? v.like / v.view : 0;
  const favRate = v.view > 0 ? v.favorite / v.view : 0;
  const replyRate = v.view > 0 ? v.reply / v.view : 0;
  const heat = Math.min(1, Math.log10(Math.max(10, v.view)) / 7);          // 播放量对数
  const engage = Math.min(1, (likeRate * 6 + favRate * 4 + replyRate * 8)); // 互动强度
  const fit = (zoneHit ? 0.5 : 0) + (bilingual ? 0.35 : 0) - (hard ? 0.3 : 0) + durScore * 0.15;
  const total = 0.45 * Math.max(0, Math.min(1, fit)) + 0.30 * heat + 0.25 * engage;
  return {
    total: Number(total.toFixed(3)), zone_fit: zoneHit, bilingual_hint: bilingual, hard_exclude: hard,
    duration_score: durScore, heat: Number(heat.toFixed(2)), engage: Number(engage.toFixed(3)),
    like_rate: Number(likeRate.toFixed(4)), fav_rate: Number(favRate.toFixed(4)), reply_rate: Number(replyRate.toFixed(4)),
    effort: dur <= 600 ? '当天（≤10min）' : dur <= 1800 ? '约一天（10–30min）' : '长片流程（>30min，需两次渲染+校对）',
  };
}
const ranked = uniq.map((v) => ({ ...v, ...scoreOf(v) })).sort((a, b) => b.total - a.total);

// ---------- 3. 市场结构统计 ----------
const zoneCount = {};
for (const v of uniq) zoneCount[v.zone] = (zoneCount[v.zone] || 0) + 1;
const durBuckets = { '≤1min': 0, '1–5min': 0, '5–10min': 0, '10–30min': 0, '>30min': 0 };
for (const v of uniq) {
  const d = v.duration_s;
  if (d <= 60) durBuckets['≤1min']++;
  else if (d <= 300) durBuckets['1–5min']++;
  else if (d <= 600) durBuckets['5–10min']++;
  else if (d <= 1800) durBuckets['10–30min']++;
  else durBuckets['>30min']++;
}

const out = {
  generated_at: new Date().toISOString(),
  source: { ranking: !!ranking?.data?.list, popular: !!popular?.data?.list, searches: searches.length },
  pool_size: uniq.length,
  zones: zoneCount,
  duration_buckets: durBuckets,
  keyword_markets: searches.map((s) => ({
    keyword: s.keyword, num_results: s.num_results,
    top_play: s.top.reduce((a, v) => a + (Number(v.play) || 0), 0),
    top_examples: s.top.slice(0, 3),
  })),
  candidates: ranked.slice(0, TOP),
};
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'market_raw.json'), JSON.stringify(out, null, 2));

// ---------- 4. 人可读报告 ----------
const pct = (v) => `${(v * 100).toFixed(2)}%`;
const L = [];
L.push('# 市场侦查报告（B 站公开数据）\n');
L.push(`> 生成时间：${new Date().toISOString()}　数据源：ranking/v2 + popular + 6 个关键词搜索　样本：**${uniq.length}** 条（去重后）\n`);
L.push('## 市场结构（采样）\n');
L.push('| 分区 | 条数 |');
L.push('| --- | --- |');
for (const [z, n] of Object.entries(zoneCount).sort((a, b) => b[1] - a[1]).slice(0, 10)) L.push(`| ${z || '（未标注）'} | ${n} |`);
L.push('');
L.push('| 时长 | 条数 |');
L.push('| --- | --- |');
for (const [k, n] of Object.entries(durBuckets)) L.push(`| ${k} | ${n} |`);
L.push('');
L.push('## 关键词市场（每个词取搜索结果前 8 条聚合）\n');
L.push('| 关键词 | 命中量 | 前 8 条播放合计 | 代表作品 |');
L.push('| --- | --- | --- | --- |');
for (const s of out.keyword_markets) {
  const ex = (s.top_examples || []).slice(0, 2).map((t) => `${t.title}（${fmtDur(String(t.duration).split(':').reduce((a, b) => a * 60 + Number(b), 0))}）`).join('；');
  L.push(`| ${s.keyword} | ${s.num_results} | ${(s.top_play / 10000).toFixed(1)}万 | ${ex} |`);
}
L.push('');
L.push('## 候选选题（按"能力匹配 × 热度 × 互动"排序，前 15）\n');
L.push('| # | 标题 | 分区 | 时长 | 播放 | 点赞率 | 收藏率 | 匹配分 | 交付成本 |');
L.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
ranked.slice(0, 15).forEach((v, i) => {
  L.push(`| ${i + 1} | ${v.title.slice(0, 42).replace(/\|/g, '/')} | ${v.zone} | ${fmtDur(v.duration_s)} | ${(v.view / 10000).toFixed(1)}万 | ${pct(v.like_rate)} | ${pct(v.fav_rate)} | **${v.total}** | ${v.effort} |`);
});
L.push('');
L.push('## 分数怎么算的（可复现）\n');
L.push('```text');
L.push('total = 0.45 × minmax(题材匹配) + 0.30 × minmax(log10(播放/10)/7) + 0.25 × minmax(互动强度)');
L.push('题材匹配 = 知识分区(+0.5) + 双语/翻译信号(+0.35) − 强视频/娱乐类(−0.3) + 时长分×0.15');
L.push('互动强度 = 点赞率×6 + 收藏率×4 + 评论率×8');
L.push('```');
L.push('');
L.push('> 说明：这是**采样**而不是全站统计；分区/时长/关键词只代表"今天这一刻的榜单"。它的用途是选方向，不是给市场下结论。');
fs.writeFileSync(path.join(OUT, 'market_report.md'), L.join('\n') + '\n', 'utf8');

console.log(`\n[recon] 样本 ${uniq.length} 条｜分区前 3: ${Object.entries(zoneCount).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([z, n]) => `${z}×${n}`).join(' ')}`);
console.log(`[recon] 时长分布: ${Object.entries(durBuckets).map(([k, n]) => `${k}=${n}`).join(' ')}`);
console.log('[recon] 候选前 5：');
for (const v of ranked.slice(0, 5)) console.log(`  ${v.total.toFixed(3)}  ${fmtDur(v.duration_s).padStart(5)}  ${String(v.view / 10000).padStart(6)}万  ${v.zone.padEnd(6)}  ${v.title.slice(0, 40)}`);
console.log(`[recon] -> ${path.relative(ROOT, OUT)}/market_report.md`);
