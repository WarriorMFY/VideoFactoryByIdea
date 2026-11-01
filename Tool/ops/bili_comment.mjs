#!/usr/bin/env node
/**
 * bili_comment.mjs — 用已登录的 B 站 profile 发评论 / 置顶评论（loop14 WP4.7 新增）
 *
 * 为什么需要：快速导航通道的「原片 → 摘要」方向，靠在原片稿件下挂一条置顶评论实现。
 * 走 API（ctx.request 共享登录 cookie），不开网页 UI，风险低于表单自动化。
 *
 * 用法：
 *   node Tool/ops/bili_comment.mjs add --bvid BV1xxx --text "..." [--text-file f] [--pin]
 *   node Tool/ops/bili_comment.mjs pin --bvid BV1xxx --rpid 12345
 *
 * 产物：History/publish/bilibili/runs/<ts>_comment/receipt.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { launchProfile, loginState, sleep } from '../lib/pw.mjs';

const ROOT = process.cwd().includes('Tool') ? path.resolve(process.cwd(), '..', '..') : process.cwd();
const RUNS = path.join(ROOT, 'History', 'publish', 'bilibili', 'runs');

const args = process.argv.slice(2);
const CMD = args[0];
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const flag = (k) => args.includes(k);

async function main() {
  const bvid = getOpt('--bvid', '');
  if (!CMD || !bvid) { console.log('用法: add --bvid BV --text "..." [--pin] | pin --bvid BV --rpid N'); process.exit(2); }
  const dir = path.join(RUNS, `${new Date().toISOString().replace(/[:.]/g, '-')}_comment`);
  fs.mkdirSync(dir, { recursive: true });
  const receipt = { cmd: CMD, bvid, at: new Date().toISOString() };

  const { ctx, info } = await launchProfile({ headless: true });
  try {
    const st = await loginState(ctx);
    if (!st.loggedIn) throw new Error('未登录（先跑 publish_bilibili.mjs login）');
    receipt.uid = st.uid;

    const rq = ctx.request;
    const view = await (await rq.get(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`)).json();
    if (view.code !== 0) throw new Error(`view 接口失败: ${view.code} ${view.message}`);
    const aid = view.data.aid;
    receipt.aid = aid;
    receipt.title = view.data.title;

    const cookies = await ctx.cookies('https://www.bilibili.com');
    const csrf = cookies.find((c) => c.name === 'bili_jct')?.value;
    if (!csrf) throw new Error('cookies 里没有 bili_jct（csrf）');

    if (CMD === 'add') {
      let text = getOpt('--text', '');
      const tf = getOpt('--text-file', '');
      if (tf) text = fs.readFileSync(path.resolve(ROOT, tf), 'utf8');
      if (!text) throw new Error('缺少 --text / --text-file');
      receipt.text_head = text.slice(0, 60);
      const r = await (await rq.post('https://api.bilibili.com/x/v2/reply/add', {
        form: { oid: String(aid), type: '1', message: text, csrf, csrf_token: csrf },
      })).json();
      receipt.add = { code: r.code, message: r.message };
      if (r.code !== 0) throw new Error(`评论失败: ${r.code} ${r.message}`);
      const rpid = r.data?.rpid;
      receipt.rpid = rpid;
      console.log(`[comment] 已发评论 rpid=${rpid} → ${bvid}`);

      if (flag('--pin')) {
        await sleep(1200);
        const p = await (await rq.post('https://api.bilibili.com/x/v2/reply/top', {
          form: { oid: String(aid), type: '1', rpid: String(rpid), action: '1', csrf, csrf_token: csrf },
        })).json();
        receipt.pin = { code: p.code, message: p.message };
        if (p.code !== 0) console.error(`[comment] 置顶失败: ${p.code} ${p.message}（评论已发，可手动置顶）`);
        else console.log(`[comment] 已置顶`);
      }
    } else if (CMD === 'del') {
      const rpid = getOpt('--rpid', '');
      if (!rpid) throw new Error('缺 --rpid');
      const d = await (await rq.post('https://api.bilibili.com/x/v2/reply/del', {
        form: { oid: String(aid), type: '1', rpid: String(rpid), csrf, csrf_token: csrf },
      })).json();
      receipt.del = { code: d.code, message: d.message, rpid };
      if (d.code !== 0) throw new Error(`删评论失败: ${d.code} ${d.message}`);
      console.log(`[comment] 已删除评论 rpid=${rpid} @ ${bvid}`);
    } else if (CMD === 'list') {
      const page = Number(getOpt('--page', '1'));
      const r = await (await rq.get(`https://api.bilibili.com/x/v2/reply/main?oid=${aid}&type=1&mode=3&next=${page}`)).json();
      const replies = r.data?.replies || [];
      for (const x of replies) console.log(`${x.rpid}  pin=${x.is_up_top ? 1 : 0}  ${x.content.message.slice(0, 50).replace(/\n/g, ' ')}`);
      receipt.list = replies.map((x) => ({ rpid: x.rpid, top: !!x.is_up_top, head: x.content.message.slice(0, 40) }));
      if (!replies.length) console.log('[comment]（第一页无评论）');
    } else if (CMD === 'pin') {
      const rpid = getOpt('--rpid', '');
      const p = await (await rq.post('https://api.bilibili.com/x/v2/reply/top', {
        form: { oid: String(aid), type: '1', rpid: String(rpid), action: '1', csrf, csrf_token: csrf },
      })).json();
      receipt.pin = { code: p.code, message: p.message, rpid };
      if (p.code !== 0) throw new Error(`置顶失败: ${p.code} ${p.message}`);
      console.log(`[comment] 已置顶 rpid=${rpid}`);
    }

    fs.writeFileSync(path.join(dir, 'receipt.json'), JSON.stringify(receipt, null, 2));
    console.log(`[comment] 回执 ${path.join(dir, 'receipt.json')}`);
  } finally {
    await ctx.close().catch(() => {});
  }
}
main().catch((e) => { console.error('[comment] FATAL', e.message); process.exit(1); });
