#!/usr/bin/env node
/**
 * fetch_samples.mjs — loop19 采样：B站同赛道（TED/演讲类知识内容）视频元数据 + 热评
 * 只读公开接口；输出 History/loops/loop19/{search_raw.json,samples.json}
 */
import fs from 'node:fs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const H = { 'User-Agent': UA, Referer: 'https://www.bilibili.com/', Cookie: 'buvid3=infoc' };
const OUT = new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function api(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: H });
      const j = await r.json();
      if (j.code === 0) return j.data;
      if (j.code === -412) { await sleep(3000 + i * 3000); continue; }
      throw new Error(`code ${j.code} ${j.message}`);
    } catch (e) { if (i === 2) throw e; await sleep(2000); }
  }
  return null;
}

const KEYWORDS = [
  'TED 演讲 双语字幕',
  'TED 演讲 解说',
  'TED 演讲 精讲',
  'TED 演讲 合集 必看',
  '名人演讲 英语 剪辑',
  'TED 演讲 中文配音',
];

// ---- 1. 搜索聚合 ----
const raw = {};
const pool = new Map();
for (const kw of KEYWORDS) {
  const d = await api(`https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=${encodeURIComponent(kw)}&page=1&order=totalrank`);
  raw[kw] = (d?.result || []).map(v => ({
    bvid: v.bvid, aid: v.aid, title: v.title.replace(/<[^>]+>/g, ''),
    play: v.play, review: v.video_review, favorite: v.favorites,
    up: v.author, mid: v.mid, duration_s: v.duration.split(':').reduce((a, b) => a * 60 + +b, 0),
    pubdate: v.pubdate, desc: (v.description || '').slice(0, 120),
  }));
  for (const v of raw[kw]) if (!pool.has(v.bvid)) pool.set(v.bvid, { ...v, hit_keywords: [kw] });
  else pool.get(v.bvid).hit_keywords.push(kw);
  console.log(kw, '→', raw[kw].length, '条');
  await sleep(1500);
}
fs.writeFileSync(OUT + 'search_raw.json', JSON.stringify(raw, null, 1));

// ---- 2. 筛选：时长 3-40min、播放 ≥1 万，按播放取前 18 ----
const shortlist = [...pool.values()]
  .filter(v => v.duration_s >= 180 && v.duration_s <= 2400 && v.play >= 10000)
  .sort((a, b) => b.play - a.play).slice(0, 18);

// ---- 3. 详情 + 热评 ----
const samples = [];
for (const v of shortlist) {
  const view = await api(`https://api.bilibili.com/x/web-interface/view?bvid=${v.bvid}`);
  await sleep(1200);
  let hotReplies = [];
  if (view?.aid) {
    const rp = await api(`https://api.bilibili.com/x/v2/reply?type=1&oid=${view.aid}&sort=2`);
    hotReplies = (rp?.replies || []).slice(0, 20).map(r => ({
      like: r.like, text: r.content.message.slice(0, 150),
    }));
    await sleep(1200);
  }
  samples.push({
    ...v, title_full: view?.title, desc_full: (view?.desc || '').slice(0, 300),
    cid: view?.cid,     coin: view?.stat?.coin, like: view?.stat?.like, share: view?.stat?.share,
    hotReplies,
  });
  console.log(v.bvid, v.play, v.up, '热评', hotReplies.length);
}
fs.writeFileSync(OUT + 'samples.json', JSON.stringify(samples, null, 1));
console.log('DONE', samples.length, '条样本');
