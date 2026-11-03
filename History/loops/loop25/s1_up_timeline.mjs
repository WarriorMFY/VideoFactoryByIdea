#!/usr/bin/env node
/**
 * s1_up_timeline.mjs — loop25 S1/S2：剪辑强UP主选种 + 全量投稿时间线
 * ⚠ 已于小循环 25 升格为 Tool/ops/bili_up_timeline.mjs 并参数化；本文件冻结为快照，只作复现留档，不再维护。
 *
 * 选种（跨 5 域，剪辑是主技术）：
 *   影视飓风(影视技术流) 半佛仙人(知识区表情包快切) 老番茄(游戏区叙事剪辑)
 *   李子柒(氛围化长镜头) 伊丽莎白鼠(鬼畜音画对位)
 *
 * 方法：search bili_user 定位 mid → wbi 签名拉 x/space/wbi/arc/search（分页全量）
 *       → 年度聚合（投稿数/时长/播放）+ 播放爬坡点（相对前10条均值突增）
 * 输出：History/loops/loop25/{up_resolved.json, timeline_<mid>.json, up_timeline_summary.md}
 *
 * 纪律：只读公开接口；-412 退避；不采信营销号数字。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { launchProfile } from '../../../Tool/lib/pw.mjs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const H = { 'User-Agent': UA, Referer: 'https://www.bilibili.com/' };
const OUT = new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 用已登录的浏览器 profile 发请求（游客 cookie 过不了空间接口的 -352 风控）
const { ctx } = await launchProfile({ headless: true, profile: new URL('../../../Workspace/run/bili_profile', import.meta.url).pathname.replace(/^\/(\w:)/, '$1') });

async function api(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await ctx.request.get(url, { headers: H });
      const j = await r.json();
      if (j.code === 0) return j.data;
      if (j.code === -412 || j.code === -352) { console.log(`  风控 ${j.code}，退避 ${4 + i * 4}s`); await sleep((4 + i * 4) * 1000); continue; }
      throw new Error(`code ${j.code} ${j.message}`);
    } catch (e) {
      if (String(e).includes('code -412') || String(e).includes('code -352')) continue;
      if (i === tries - 1) throw e;
      await sleep(2500);
    }
  }
  return null;
}

// ---------- wbi 签名 ----------
const TAB = [46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52];
let MIXIN = null;
async function wbi(params) {
  if (!MIXIN) {
    // 游客 nav 返回 code -101，但 wbi_img 仍在 data 里——不能按 code===0 判
    const r = await fetch('https://api.bilibili.com/x/web-interface/nav', { headers: H });
    const j = await r.json();
    const img0 = j?.data?.wbi_img?.img_url, sub0 = j?.data?.wbi_img?.sub_url;
    if (!img0 || !sub0) throw new Error(`nav 拿不到 wbi_img (code ${j.code})`);
    const k = (u) => path.basename(new URL(u).pathname).replace(/\..*$/, '');
    MIXIN = TAB.map((i) => (k(img0) + k(sub0))[i]).join('').slice(0, 32);
  }
  const p = { ...params, wts: Math.floor(Date.now() / 1000) };
  const qs = Object.keys(p).sort().map((k2) => `${encodeURIComponent(k2)}=${encodeURIComponent(String(p[k2]).replace(/[!'()*]/g, ''))}`).join('&');
  const w_rid = crypto.createHash('md5').update(qs + MIXIN).digest('hex');
  return `${qs}&w_rid=${w_rid}`;
}

// ---------- S1 选种：定位 mid ----------
const CANDIDATES = ['影视飓风', '硬核的半佛仙人', '老番茄', '李子柒', '伊丽莎白鼠'];
const resolved = {};
for (const name of CANDIDATES) {
  const d = await api(`https://api.bilibili.com/x/web-interface/search/type?search_type=bili_user&keyword=${encodeURIComponent(name)}`);
  const hit = (d?.result || []).find((u) => u.uname === name) || (d?.result || [])[0];
  resolved[name] = hit ? { mid: hit.mid, uname: hit.uname, fans: hit.fans, sign: (hit.usign || '').slice(0, 60) } : null;
  console.log(name, '→', hit ? `mid=${hit.mid} fans=${(hit.fans / 1e4).toFixed(0)}w` : '未找到');
  await sleep(1800);
}
fs.writeFileSync(path.join(OUT, 'up_resolved.json'), JSON.stringify(resolved, null, 1));

// ---------- S2 时间线：全量投稿分页拉取 ----------
const summary = [];
for (const [name, info] of Object.entries(resolved)) {
  if (!info) { summary.push({ name, error: '未解析到 mid' }); continue; }
  const tlPath = path.join(OUT, `timeline_${info.mid}.json`);
  if (fs.existsSync(tlPath)) {   // 已拉过的直接复用，避免重复请求触发风控
    const j = JSON.parse(fs.readFileSync(tlPath, 'utf8'));
    summary.push({ name, mid: info.mid, total: j.total, span: `${new Date(j.all[0].created * 1000).toISOString().slice(0, 10)} → ${new Date(j.all.at(-1).created * 1000).toISOString().slice(0, 10)}`, years: j.years, spikes: j.spikes });
    console.log(`${name} 已有缓存，跳过`);
    continue;
  }
  const all = [];
  let pn = 1;
  while (true) {
    const q = await wbi({ mid: info.mid, pn, ps: 50, order: 'pubdate' });
    const d = await api(`https://api.bilibili.com/x/space/wbi/arc/search?${q}`);
    const vs = d?.list?.vlist || [];
    if (!vs.length) break;
    for (const v of vs) all.push({
      bvid: v.bvid, aid: v.aid, title: v.title, created: v.created,
      length_s: v.length.split(':').reduce((a, b) => a * 60 + +b, 0),
      play: v.play, video_review: v.video_review,
    });
    const total = Math.ceil((d?.page?.count || 0) / 50);
    console.log(`${name} p${pn}/${total} +${vs.length}`);
    if (pn >= Math.min(total, 40)) break;   // 上限 2000 条，防失控
    pn++;
    await sleep(1300);
  }
  if (!all.length) { summary.push({ name, mid: info.mid, error: '时间线为空（可能被风控）' }); continue; }
  all.sort((a, b) => a.created - b.created);
  // 年度聚合
  const years = {};
  for (const v of all) {
    const y = new Date(v.created * 1000).getFullYear();
    const t = years[y] || (years[y] = { n: 0, play_sum: 0, len_sum: 0 });
    t.n++; t.play_sum += v.play; t.len_sum += v.length_s;
  }
  // 爬坡点：播放量 > 前 5 条播放均值的 8 倍且 ≥50w
  const spikes = all.map((v, i) => {
    const prev = all.slice(Math.max(0, i - 5), i);
    const base = prev.length ? prev.reduce((a, b) => a + b.play, 0) / prev.length : 0;
    return { ...v, base, ratio: base > 0 ? v.play / base : 0, date: new Date(v.created * 1000).toISOString().slice(0, 10) };
  }).filter((v) => v.ratio >= 8 && v.play >= 5e5).slice(0, 6);
  fs.writeFileSync(path.join(OUT, `timeline_${info.mid}.json`), JSON.stringify({ name, mid: info.mid, total: all.length, first: all[0], years, spikes, all }, null, 1));
  summary.push({ name, mid: info.mid, total: all.length, span: `${new Date(all[0].created * 1000).toISOString().slice(0, 10)} → ${new Date(all.at(-1).created * 1000).toISOString().slice(0, 10)}`, years, spikes: spikes.map((s) => ({ date: s.date, title: s.title, play: s.play, ratio: +s.ratio.toFixed(1), bvid: s.bvid })) });
  await sleep(2000);
}
await ctx.close().catch(() => {});
fs.writeFileSync(path.join(OUT, 'up_timeline_summary.json'), JSON.stringify(summary, null, 1));
console.log('完成 →', OUT);
