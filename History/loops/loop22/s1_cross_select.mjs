#!/usr/bin/env node
/**
 * s1_cross_select.mjs — loop22 跨内容域选种
 * 按 8 个内容域各检索，域内取「头部（播放前 3）+ 腰部（5–50 万）」候选，
 * 输出 cross_samples.json（带 domain 字段）。只读公开接口。
 */
import fs from 'node:fs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const H = { 'User-Agent': UA, Referer: 'https://www.bilibili.com/', Cookie: 'buvid3=infoc' };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const OUT = 'History/loops/loop22/cross_samples.json';

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

// 每个内容域挑 1–2 组检索词：优先「剪辑/混剪/燃向/卡点」这类技术词，而不是内容词
const DOMAINS = {
  '影视解说混剪': ['电影 混剪 燃向', '影视解说 高能剪辑'],
  '游戏高能': ['游戏 高能集锦 剪辑', '游戏 燃向 踩点'],
  '科技纪录': ['科技 纪录片 剪辑 幕后', '影视飓风 拍摄 剪辑'],
  '综艺二创': ['综艺 二创 花字', '鬼畜 调音 剪辑'],
  'AMV/静止系MAD': ['AMV 剪辑 踩点', 'MAD 静止系 剪辑'],
  '运动极限': ['极限运动 混剪 燃', '滑雪 剪辑 速度'],
  '美食治愈Vlog': ['美食 vlog 治愈 剪辑', '沉浸式 做饭 声音'],
  '数码测评': ['数码测评 快剪', '手机 评测 分屏 对比'],
};

const parseDur = (s) => (s || '0:0').split(':').reduce((a, b) => a * 60 + +b, 0);
const raw = {};
const pool = new Map();

for (const [domain, kws] of Object.entries(DOMAINS)) {
  const list = [];
  for (const kw of kws) {
    const d = await api(`https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=${encodeURIComponent(kw)}&page=1&order=totalrank`);
    for (const v of d?.result || []) {
      list.push({
        bvid: v.bvid, title: v.title.replace(/<[^>]+>/g, ''), play: v.play,
        like: v.like, review: v.video_review, up: v.author, mid: v.mid,
        duration_s: parseDur(v.duration), pubdate: v.pubdate,
        desc: (v.description || '').replace(/<[^>]+>/g, '').slice(0, 100),
        domain, hit_kw: kw,
      });
    }
    await sleep(1200);
  }
  raw[domain] = list.length;
  for (const v of list) {
    if (!v.duration_s || v.duration_s < 45) continue;          // 太短没有剪辑结构可拆
    if (v.duration_s > 1500) continue;                          // 超 25 分钟下载/量化成本高
    if (!pool.has(v.bvid) || pool.get(v.bvid).play < v.play) pool.set(v.bvid, v);
  }
  console.log(domain, '检索', list.length, '累计池', pool.size);
}

// 域内分层：头部 top3 + 腰部（5–50w）按播放取 2
const byDomain = {};
for (const v of pool.values()) (byDomain[v.domain] ||= []).push(v);
const picked = [];
for (const [domain, arr] of Object.entries(byDomain)) {
  arr.sort((a, b) => b.play - a.play);
  const top = arr.slice(0, 3);
  const mid = arr.filter(v => v.play >= 50000 && v.play <= 500000 && !top.includes(v)).slice(0, 2);
  picked.push(...top.map(v => ({ ...v, tier: '头部' })), ...mid.map(v => ({ ...v, tier: '腰部' })));
}
picked.sort((a, b) => a.domain.localeCompare(b.domain) || b.play - a.play);
fs.writeFileSync(OUT, JSON.stringify({ fetchedAt: new Date().toISOString(), counts: raw, samples: picked }, null, 1));

for (const v of picked) {
  console.log(`${v.domain.padEnd(14)} ${v.tier} ${v.bvid} ${String(Math.round(v.duration_s / 60)).padStart(2)}min 播${(v.play / 10000).toFixed(0).padStart(4)}w ${v.up.slice(0, 10).padEnd(10)} ${v.title.slice(0, 34)}`);
}
console.log('总计候选', picked.length, '→', OUT);
