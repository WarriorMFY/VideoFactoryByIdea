#!/usr/bin/env node
// season.mjs —— B 站合集（season）管理：列表 / 创建 / 加视频 / 校验
//
//   node Tool/ops/season.mjs list
//   node Tool/ops/season.mjs create --title "AI 大佬 TED 演讲·双语精译" --desc "..." --cover Prototype/xxx/cover.jpg
//   node Tool/ops/season.mjs add --season <id> --bvid BV1xxx [--bvid BV1yyy ...] [--title-file 映射.json]
//   node Tool/ops/season.mjs verify --season <id>
//
// 接口（见 bilibili-API-collect）：
//   GET  /x2/creative/web/seasons
//   POST /x2/creative/web/season/add                     （form: title/desc/cover/season_price/csrf）
//   POST /x2/creative/web/season/section/episodes/add     （?csrf=，JSON: {sectionId, episodes:[{title,aid,cid,charging_pay:0}]}）
//   封面上传 POST /x/vu/web/cover/up                     （multipart: cover=@file, csrf）
// 注意：创建/编辑会进人工审核（state=-6），审核通过前空间页可能看不到。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchProfile } from '../lib/pw.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const cmd = argv[0] || 'list';
const getOpt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const getAll = (k) => argv.reduce((a, v, i) => (v === k && argv[i + 1] ? [...a, argv[i + 1]] : a), []);
const MEMBER = 'https://member.bilibili.com';
const HDR = { referer: 'https://member.bilibili.com/platform/upload-manager/season', origin: MEMBER };

function csrfFromCookies(cookies) {
  const c = cookies.find((x) => x.name === 'bili_jct');
  if (!c) throw new Error('cookie 里没有 bili_jct，登录态可能已失效');
  return c.value;
}

async function main() {
  const { ctx } = await launchProfile({ headless: true });
  const request = ctx.request;
  const cookies = await ctx.cookies('https://member.bilibili.com');
  const csrf = csrfFromCookies(cookies);

  if (cmd === 'list') {
    const r = await request.get(`${MEMBER}/x2/creative/web/seasons?pn=1&ps=30&order=ctime&sort=desc`, { headers: HDR });
    const j = await r.json();
    if (j.code !== 0) throw new Error(`list 失败 code=${j.code} ${j.message}`);
    const ss = j.data?.seasons || [];
    console.log(`共 ${ss.length} 个合集`);
    for (const s of ss) {
      const sec = (s.sections?.sections || [])[0];
      console.log(`  ${s.id} ｜${s.title}｜${s.ep_num} 集｜state=${s.state}${sec ? `｜section ${sec.id}（${sec.epCount} 集）` : ''}`);
    }
  }

  if (cmd === 'create') {
    const title = getOpt('--title');
    const desc = getOpt('--desc', '');
    let coverUrl = getOpt('--cover-url', '');
    const coverFile = getOpt('--cover');
    if (!title || (!coverFile && !coverUrl)) throw new Error('create 需要 --title 与 --cover（文件）或 --cover-url');
    if (!coverUrl) {
      const abs = path.resolve(ROOT, coverFile);
      const up = await request.post(`${MEMBER}/x/vu/web/cover/up`, {
        headers: { ...HDR, referer: 'https://member.bilibili.com/platform/upload/video/frame' },
        multipart: {
          cover: { name: 'cover.jpg', mimeType: 'image/jpeg', buffer: fs.readFileSync(abs) },
          csrf,
        },
      });
      const uj = await up.json();
      console.log('[cover]', JSON.stringify(uj).slice(0, 200));
      coverUrl = uj?.data?.url;
      if (!coverUrl) throw new Error('封面上传失败（cover/up）；可用 --cover-url 直接传 bfs 图片地址');
    }

    const form = new URLSearchParams({ title, desc, cover: coverUrl, season_price: '0', csrf });
    const r = await request.post(`${MEMBER}/x2/creative/web/season/add`, {
      headers: { ...HDR, 'content-type': 'application/x-www-form-urlencoded' },
      data: form.toString(),
    });
    const j = await r.json();
    console.log('[season/add]', JSON.stringify(j));
    if (j.code !== 0) throw new Error(`创建失败 code=${j.code} ${j.message}`);
    console.log(`合集已创建 id=${j.data}（审核中 state=-6，稍后 verify 查）`);
  }

  if (cmd === 'add') {
    const season = getOpt('--season');
    const bvids = getAll('--bvid');
    if (!season || !bvids.length) throw new Error('add 需要 --season 与至少一个 --bvid');

    // 取 section id
    const lr = await request.get(`${MEMBER}/x2/creative/web/seasons?pn=1&ps=30`, { headers: HDR });
    const lj = await lr.json();
    const s = (lj.data?.seasons || []).find((x) => String(x.id) === String(season));
    if (!s) throw new Error(`找不到合集 ${season}`);
    const sectionId = s.sections?.sections?.[0]?.id;
    if (!sectionId) throw new Error('合集没有默认小节');

    // aid / cid / title
    const episodes = [];
    for (const bvid of bvids) {
      const vr = await request.get(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, { headers: { referer: 'https://www.bilibili.com/' } });
      const vj = await vr.json();
      if (vj.code !== 0) { console.error(`  ${bvid} view 失败 ${vj.code}`); continue; }
      episodes.push({ title: vj.data.title, aid: vj.data.aid, cid: vj.data.pages?.[0]?.cid, charging_pay: 0 });
      await new Promise((r) => setTimeout(r, 600));
    }
    if (!episodes.length) throw new Error('没有可取到 aid/cid 的视频');
    console.log(`[add] 准备加入 ${episodes.length} 集到 section ${sectionId}`);
    const r = await request.post(`${MEMBER}/x2/creative/web/season/section/episodes/add?csrf=${csrf}`, {
      headers: { ...HDR, 'content-type': 'application/json' },
      data: JSON.stringify({ sectionId, episodes }),
    });
    const j = await r.json();
    console.log('[episodes/add]', JSON.stringify(j));
    if (j.code !== 0) throw new Error(`加视频失败 code=${j.code} ${j.message}`);
  }

  if (cmd === 'verify') {
    const season = getOpt('--season');
    const r = await request.get(`${MEMBER}/x2/creative/web/seasons?pn=1&ps=30`, { headers: HDR });
    const j = await r.json();
    const s = (j.data?.seasons || []).find((x) => String(x.id) === String(season));
    if (!s) { console.log('未找到该合集（可能仍在审核或 id 有误）'); }
    else {
      const eps = s.sections?.sections?.flatMap((x) => x.episodes || []) || [];
      console.log(`合集 ${s.id}｜${s.title}｜state=${s.state}｜${s.ep_num} 集`);
      for (const e of eps) console.log(`  - ${e.bvid || e.aid}｜${e.title}`);
    }
  }

  await ctx.close();
}

main().catch((e) => { console.error('[season] 失败:', e.message); process.exit(1); });
