#!/usr/bin/env node
/**
 * loop21 S1 选种：按 edit-craft-scouting 三判据，检索"剪辑承载信息"的样本
 * 关键词偏混剪/卡点/花字，而非纯搬运；输出 loop21/s1_pool.json
 */
import fs from 'node:fs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36';
const H = { 'User-Agent': UA, Referer: 'https://www.bilibili.com/', Cookie: 'buvid3=infoc' };
const OK = new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function api(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const j = await (await fetch(url, { headers: H })).json();
      if (j.code === 0) return j.data;
      if (j.code === -412) { await sleep(3000); continue; }
      return null;
    } catch { await sleep(2000); }
  }
  return null;
}

const KW = [
  '演讲 混剪 高燃',
  '名人演讲 卡点',
  'TED 演讲 混剪',
  '演讲 三分钟 精华',
  '口播 花字 剪辑',
  '演讲 金句 大字',
];
const pool = new Map();
for (const kw of KW) {
  const d = await api(`https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=${encodeURIComponent(kw)}&order=totalrank`);
  for (const v of d?.result || []) {
    if (pool.has(v.bvid)) continue;
    pool.set(v.bvid, {
      bvid: v.bvid, title: v.title.replace(/<[^>]+>/g, ''), up: v.author, mid: v.mid,
      play: v.play, danmaku: v.video_review, dur: v.duration.split(':').reduce((a, b) => a * 60 + +b, 0),
      kw, pubdate: v.pubdate,
    });
  }
  console.log(kw, '→', (d?.result || []).length);
  await sleep(1500);
}
const arr = [...pool.values()].filter(v => v.dur >= 100 && v.dur <= 1800 && v.play >= 50000)
  .sort((a, b) => b.play - a.play);
fs.writeFileSync(OK + 's1_pool.json', JSON.stringify(arr, null, 1));
console.log('候选', arr.length);
for (const v of arr.slice(0, 14)) console.log(v.bvid, (v.play / 1e4).toFixed(0) + 'w', v.dur + 's', v.up, '|', v.title.slice(0, 34));
