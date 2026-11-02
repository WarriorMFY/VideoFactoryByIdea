#!/usr/bin/env node
/**
 * post_dynamic.mjs — 用已登录 profile 发「图文动态」（image + text，B 站动态/opus）
 *
 * 为什么走 API：动态发布页是复杂编辑器，UI 自动化易碎；接口两步即可（先传图、再建动态），
 * 且与 publish_bilibili / bili_comment 共用同一登录态，无需额外扫码。
 *
 * 用法：
 *   node Tool/ops/post_dynamic.mjs post --text-file dyn.txt --image a.jpg --image b.jpg [--dry-run]
 *   node Tool/ops/post_dynamic.mjs verify --dyn-id 123456789 [--mid 3747573749779036]
 *
 * 产物：History/publish/bilibili/runs/<ts>_dynamic/receipt.json
 *
 * 接口事实（2026-11 实测）：
 *   POST https://api.bilibili.com/x/dynamic/feed/draw/upload_bfs   multipart: file_up / category=daily / biz=new_dyn / csrf
 *   POST https://api.bilibili.com/x/dynamic/feed/create/dyn?platform=web&csrf=...   JSON: { dyn_req: {...} }
 *        scene=1 纯文本、scene=2 带图；pics[].img_src 必填；upload_id = mid_秒级时间戳_4位随机
 */
import fs from 'node:fs';
import path from 'node:path';
import { launchProfile, loginState } from '../lib/pw.mjs';

const ROOT = process.cwd().includes('Tool') ? path.resolve(process.cwd(), '..', '..') : process.cwd();
const RUNS = path.join(ROOT, 'History', 'publish', 'bilibili', 'runs');

const args = process.argv.slice(2);
const CMD = args[0];
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const getAll = (k) => args.reduce((a, v, i) => (v === k ? [...a, args[i + 1]] : a), []);
const flag = (k) => args.includes(k);

const MIME = (f) => (f.endsWith('.png') ? 'image/png' : f.endsWith('.gif') ? 'image/gif' : 'image/jpeg');

async function main() {
  if (!CMD) { console.log('用法: post --text-file f [--image a --image b] [--dry-run] | verify --dyn-id N'); process.exit(2); }
  const { ctx } = await launchProfile({ headless: true });
  try {
    const st = await loginState(ctx);
    if (!st.loggedIn) throw new Error('未登录（先跑 publish_bilibili.mjs login）');
    const cookies = await ctx.cookies('https://www.bilibili.com');
    const csrf = cookies.find((c) => c.name === 'bili_jct')?.value;
    if (!csrf) throw new Error('cookies 里没有 bili_jct（csrf）');

    const dir = path.join(RUNS, `${new Date().toISOString().replace(/[:.]/g, '-')}_dynamic`);
    fs.mkdirSync(dir, { recursive: true });

    if (CMD === 'verify') {
      const dynId = getOpt('--dyn-id', '');
      const mid = getOpt('--mid', String(st.uid));
      const r = await ctx.request.get(
        `https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space?host_mid=${mid}&offset=&timezone_offset=-480&features=itemOpusStyle`,
        { headers: { referer: `https://space.bilibili.com/${mid}/dynamic` } });
      const j = await r.json();
      const items = j?.data?.items || [];
      const hit = items.find((x) => String(x.id_str) === String(dynId));
      console.log(`[dynamic] 空间动态 ${items.length} 条，目标 ${dynId} ${hit ? '已上线' : '未找到'}`);
      if (hit) {
        const txt = hit.modules?.module_dynamic?.desc?.text || hit.modules?.module_dynamic?.major?.opus?.summary?.text || '';
        const pics = hit.modules?.module_dynamic?.major?.opus?.pics?.length || 0;
        console.log(`[dynamic] 文本 ${txt.length} 字 / 图片 ${pics} 张｜${new Date(hit.modules?.module_author?.pub_ts * 1000).toLocaleString('zh-CN')}`);
      }
      fs.writeFileSync(path.join(dir, 'verify.json'), JSON.stringify({ dynId, found: !!hit, items: items.length }, null, 2));
      return;
    }

    // ---- post ----
    const textFile = getOpt('--text-file', '');
    if (!textFile) throw new Error('缺 --text-file');
    const text = fs.readFileSync(path.resolve(ROOT, textFile), 'utf8').trim();
    const images = getAll('--image').map((p) => path.resolve(ROOT, p));
    if (!images.length) throw new Error('缺 --image（至少 1 张）');
    if (images.length > 9) throw new Error('图片最多 9 张');
    images.forEach((p) => { if (!fs.existsSync(p)) throw new Error(`图片不存在: ${p}`); });

    const receipt = { cmd: 'post', at: new Date().toISOString(), uid: st.uid, textLen: text.length, images: [] };
    console.log(`[dynamic] 文本 ${text.length} 字｜图片 ${images.length} 张`);

    // 1) 上传图片
    const pics = [];
    for (const img of images) {
      const buf = fs.readFileSync(img);
      const r = await ctx.request.post(`https://api.bilibili.com/x/dynamic/feed/draw/upload_bfs?csrf=${csrf}`, {
        multipart: {
          file_up: { name: path.basename(img), mimeType: MIME(img), buffer: buf },
          category: 'daily',
          biz: 'new_dyn',
          csrf,
        },
        headers: { referer: 'https://t.bilibili.com/' },
      });
      const j = await r.json();
      if (j.code !== 0) throw new Error(`上传失败 ${path.basename(img)}: ${j.code} ${j.message}`);
      const d = j.data;
      pics.push({ img_src: d.image_url, img_width: d.image_width, img_height: d.image_height, img_size: d.img_size });
      receipt.images.push({ file: path.basename(img), w: d.image_width, h: d.image_height, kb: d.img_size, url: d.image_url });
      console.log(`[dynamic] 上传 ${path.basename(img)} → ${d.image_width}×${d.image_height} ${d.img_size}KB`);
    }

    const uploadId = `${st.uid}_${Math.round(Date.now() / 1000)}_${Math.floor(1000 + Math.random() * 9000)}`;
    const dynReq = {
      content: { contents: [{ raw_text: text, type: 1 }] },
      scene: 2,
      pics,
      upload_id: uploadId,
      meta: { app_meta: { from: 'create.dynamic.web', mobi_app: 'web' } },
    };
    receipt.dynReq = { scene: 2, pics: pics.length, upload_id: uploadId, text_head: text.slice(0, 60) };

    if (flag('--dry-run')) {
      console.log('[dynamic] dry-run：已传图但未提交');
      fs.writeFileSync(path.join(dir, 'receipt.json'), JSON.stringify(receipt, null, 2));
      return;
    }

    // 2) 建动态
    const r = await ctx.request.post(`https://api.bilibili.com/x/dynamic/feed/create/dyn?platform=web&csrf=${csrf}`, {
      data: { dyn_req: dynReq },
      headers: { referer: 'https://t.bilibili.com/', 'content-type': 'application/json' },
    });
    const j = await r.json();
    receipt.create = { code: j.code, message: j.message, data: j.data };
    if (j.code !== 0) throw new Error(`发布失败: ${j.code} ${j.message}`);
    const dynId = j.data?.dyn_id_str || String(j.data?.dyn_id || '');
    receipt.dyn_id = dynId;
    console.log(`[dynamic] 已发布 dyn_id=${dynId}`);

    // 3) 立刻回读（列表可能有延迟，只做一次轻校验）
    await new Promise((s) => setTimeout(s, 2500));
    const v = await ctx.request.get(
      `https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space?host_mid=${st.uid}&offset=&timezone_offset=-480&features=itemOpusStyle`,
      { headers: { referer: `https://space.bilibili.com/${st.uid}/dynamic` } });
    const vj = await v.json();
    const hit = (vj?.data?.items || []).find((x) => String(x.id_str) === String(dynId));
    receipt.verify = { found: !!hit, items: (vj?.data?.items || []).length };
    console.log(`[dynamic] 回读：${hit ? '空间动态已可见' : '暂未在列表查到（可能有延迟）'}`);
    console.log(`[dynamic] 链接 https://t.bilibili.com/${dynId}`);
    fs.writeFileSync(path.join(dir, 'receipt.json'), JSON.stringify(receipt, null, 2));
    console.log(`[dynamic] 回执 ${path.relative(ROOT, path.join(dir, 'receipt.json'))}`);
  } finally {
    await ctx.close();
  }
}

main().catch((e) => { console.error('[dynamic] 失败:', e.message); process.exit(1); });
