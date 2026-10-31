#!/usr/bin/env node
/**
 * bili_auth.mjs — 阶段 A 第一步：登录态自检（只读，不发任何写请求）
 *
 * 凭据从哪来（**不要把 Cookie 贴在聊天里**）：
 *   浏览器登录 B 站 → F12 → Application/Storage → Cookies → https://www.bilibili.com
 *   复制 SESSDATA / bili_jct / DedeUserID 三个值，写进：
 *     Workspace/secrets/bili.cookie.json
 *   形如：{ "SESSDATA": "...", "bili_jct": "...", "DedeUserID": "123456789" }
 *   （Workspace/ 已被 .gitignore 忽略，不会入库；用完可让我立刻删除）
 *
 * 用法：
 *   node Tool\ops\bili_auth.mjs                 # 自检：登录态 / WBI keys / 稿件列表可达性
 *   node Tool\ops\bili_auth.mjs --template      # 生成空白凭据模板文件（含填写说明）
 *   node Tool\ops\bili_auth.mjs --json out.json # 结果落盘
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, SECRET_FILE, loadCred, credSummary, checkLogin, biliGet, signWbi } from '../lib/bili.mjs';

const args = process.argv.slice(2);
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);

if (args.includes('--template')) {
  fs.mkdirSync(path.dirname(SECRET_FILE), { recursive: true });
  if (fs.existsSync(SECRET_FILE)) { console.log(`已存在：${path.relative(ROOT, SECRET_FILE)}（不覆盖）`); process.exit(0); }
  fs.writeFileSync(SECRET_FILE, `${JSON.stringify({
    _说明: '把浏览器 Cookie 里的三个值填进来；本文件在 Workspace/ 内，不入库；用完可删',
    SESSDATA: '',
    bili_jct: '',
    DedeUserID: '',
  }, null, 2)}\n`, 'utf8');
  console.log(`已生成模板：${path.relative(ROOT, SECRET_FILE)}`);
  process.exit(0);
}

let cred = null;
try { cred = loadCred(); } catch (e) {
  console.error(`凭据文件有问题：${String(e.message)}`);
  console.error(`请检查 ${path.relative(ROOT, SECRET_FILE)}（需要 SESSDATA 与 bili_jct 两个值）`);
  process.exit(2);
}
console.log(`凭据：${credSummary(cred)}`);
if (!cred) {
  console.error(`\n没有凭据。先跑：node Tool\\ops\\bili_auth.mjs --template`);
  console.error(`然后编辑 ${path.relative(ROOT, SECRET_FILE)} 填入 SESSDATA / bili_jct / DedeUserID`);
  process.exit(2);
}

const out = { checked_at: new Date().toISOString(), cred: credSummary(cred) };
console.log('\n== 1) 登录态（nav）');
const nav = await checkLogin(cred);
console.log(`  可达=${nav.reachable} 已登录=${nav.loggedIn} code=${nav.code} mid=${nav.mid ?? '-'} 昵称=${nav.uname ?? '-'} 等级=${nav.level ?? '-'} WBI=${nav.wbiReady}`);
out.nav = nav;
if (!nav.loggedIn) {
  console.error('  未登录：Cookie 可能已失效/复制不全（需要同时有 SESSDATA 与 bili_jct）');
  process.exit(1);
}

console.log('\n== 2) WBI 签名自检（用 mid 拉自己的投稿列表）');
try {
  const q = await signWbi({ mid: nav.mid, ps: 5, pn: 1, order: 'pubdate', platform: 'web' }, cred);
  const r = await biliGet(`https://api.bilibili.com/x/space/wbi/arc/search?${q}`, { cred });
  const n = r.json?.data?.list?.vlist?.length ?? null;
  console.log(`  code=${r.code} ${r.ok ? `取到 ${n} 条稿件` : `失败：${r.message || r.error}`}${r.risk ? '（疑似风控）' : ''}`);
  out.wbi = { ok: r.ok, code: r.code, items: n, risk: !!r.risk, error: r.error || null };
} catch (e) {
  console.log(`  签名失败：${String(e.message).slice(0, 100)}`);
  out.wbi = { ok: false, error: String(e.message).slice(0, 160) };
}

console.log('\n== 3) 创作中心稿件列表（/x/web/archives，需要登录态）');
const arch = await biliGet('https://member.bilibili.com/x/web/archives?status=all&pn=1&ps=5', { cred });
const items = arch.json?.data?.archives || arch.json?.data?.list || [];
console.log(`  code=${arch.code} ${arch.ok ? `取到 ${items.length} 条` : `失败：${arch.message || arch.error}`}${arch.risk ? '（疑似风控）' : ''}`);
out.archives = { ok: arch.ok, code: arch.code, items: items.length, risk: !!arch.risk, error: arch.error || null };

const jsonOut = getOpt('--json', '');
if (jsonOut) {
  fs.mkdirSync(path.dirname(path.resolve(ROOT, jsonOut)), { recursive: true });
  fs.writeFileSync(path.resolve(ROOT, jsonOut), JSON.stringify(out, null, 2), 'utf8');
  console.log(`\n结果 → ${jsonOut}`);
}
const allOk = nav.loggedIn && out.wbi?.ok && out.archives?.ok;
console.log(`\n=== 阶段 A 凭据自检：${allOk ? 'PASS' : 'FAIL'} ===`);
process.exit(allOk ? 0 : 1);
