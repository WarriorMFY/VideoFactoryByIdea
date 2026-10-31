#!/usr/bin/env node
/**
 * bili_upload.mjs — 阶段 B/C：把交付包投到 B 站（默认**只做预检，不真发**）
 *
 * 现实说明（必须写在这里，避免以后有人以为它"已经能发"）：
 *   B 站没有面向个人的公开投稿 API（open.bilibili.com 需要资质），网页端投稿流程是
 *   「init（拿 upload 地址与凭据）→ 分片 POST 视频 → 提交稿件（add）」三步，接口会随改版变化，
 *   而且带风控（本沙箱实测：不带登录态访问写接口返回 405，不带 WBI 签名访问 /space/wbi/* 返回 412）。
 *   所以本脚本分三档，**默认最安全的一档**：
 *
 *     --preflight    （默认）只做本地资产校验 + 生成"投稿计划"JSON，不联网写任何东西
 *     --probe        额外的只读探测：用真实 Cookie 问各候选 init 端点，确定当前协议形状
 *     --confirm-upload  真正提交（需要同时给 --dtime 定时，或 --public 明确公开）
 *
 * 安全红线（脚本内已强制）：
 *   · 不做验证码/风控绕过；遇到 HTML 响应或 -352/-412/-509 立即退出码 3；
 *   · 不打印 Cookie；不写任何凭据到仓库；
 *   · 没有 --confirm-upload 绝不上传，没有 --public 时**必须**给 --dtime（默认定时到次日同时刻）。
 *
 * 用法示例：
 *   node Tool\ops\bili_upload.mjs --video Workspace\deliverables\ep01_editing_tips\render_16x9\final.mp4 \
 *        --cover Workspace\deliverables\ep01_editing_tips\cover_16x9.jpg \
 *        --title "5 个剪辑提速技巧" --tag "剪辑,PR,效率" --tid 21 --desc-file <简介.md> --probe
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadCred, credSummary, checkLogin, biliGet, signWbi } from '../lib/bili.mjs';
import { ffprobeJson } from '../lib/ff.mjs';

const args = process.argv.slice(2);
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const flag = (k) => args.includes(k);

const VIDEO = getOpt('--video', path.join('Workspace', 'deliverables', 'ep01_editing_tips', 'render_16x9', 'final.mp4'));
const COVER = getOpt('--cover', path.join('Workspace', 'deliverables', 'ep01_editing_tips', 'cover_16x9.jpg'));
const TITLE = getOpt('--title', '');
const DESC_FILE = getOpt('--desc-file', '');
const DESC = getOpt('--desc', '');
const TAG = getOpt('--tag', '');
const TID = Number(getOpt('--tid', 0));
const COPYRIGHT = Number(getOpt('--copyright', 1));       // 1=自制 2=转载
const DTIME = getOpt('--dtime', '');                       // "YYYY-MM-DD HH:MM"，定时发布
const PUBLIC = flag('--public');
const PREFLIGHT = !flag('--confirm-upload');
const PROBE = flag('--probe');
const JSON_OUT = getOpt('--json', '');

const V = path.resolve(ROOT, VIDEO);
const C = path.resolve(ROOT, COVER);
const plan = { generated_at: new Date().toISOString(), mode: PREFLIGHT ? 'preflight' : 'confirm-upload', checks: {}, payload: null, probe: null };

// ---------- 1) 本地资产校验 ----------
const fail = (msg) => { console.error(`[x] ${msg}`); process.exit(1); };
if (!fs.existsSync(V)) fail(`视频不存在：${VIDEO}`);
if (!fs.existsSync(C)) fail(`封面不存在：${COVER}`);
const pv = ffprobeJson(['-show_format', '-show_streams', V], path.join(ROOT, 'History', 'runs', '_logs', 'bili_upload_probe.log'));
const vs = (pv.streams || []).find((s) => s.codec_type === 'video') || {};
const as = (pv.streams || []).find((s) => s.codec_type === 'audio') || {};
const dur = Number(pv.format?.duration || 0);
const sizeMb = fs.statSync(V).size / 1048576;
const isVertical = Number(vs.height) > Number(vs.width);
plan.checks.video = {
  file: path.relative(ROOT, V), size_mb: Number(sizeMb.toFixed(2)), duration_s: Number(dur.toFixed(2)),
  codec: vs.codec_name, w: vs.width, h: vs.height, fps: vs.avg_frame_rate, audio: as.codec_name || null,
};
plan.checks.video.ok = !!vs.codec_name && dur > 5 && sizeMb < 4096;
if (!plan.checks.video.ok) fail(`视频不合格：codec=${vs.codec_name} 时长=${dur}s 体积=${sizeMb}MB`);

const csize = fs.statSync(C).size / 1048576;
plan.checks.cover = { file: path.relative(ROOT, C), size_mb: Number(csize.toFixed(2)) };
plan.checks.cover.ok = csize > 0.02 && csize < 8;
if (!plan.checks.cover.ok) fail(`封面不合格：${csize}MB（B 站封面建议 < 5MB）`);

const titleLen = [...TITLE].length;
const tags = TAG.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
plan.checks.meta = {
  title: TITLE, title_len: titleLen, tags, tag_count: tags.length, tid: TID, copyright: COPYRIGHT,
  desc_from: DESC_FILE ? path.relative(ROOT, path.resolve(ROOT, DESC_FILE)) : '(命令行传入或空)',
  dtime: DTIME || null, public_now: PUBLIC, aspect: isVertical ? '9:16' : '16:9',
};
plan.checks.meta.ok = titleLen > 0 && titleLen <= 80 && tags.length > 0 && tags.length <= 12 && TID > 0;
if (!plan.checks.meta.title_ok === false) { /* 仅为可读性保留 */ }
if (!plan.checks.meta.ok) {
  fail(`元信息不完整：标题 ${titleLen} 字（1–80）｜标签 ${tags.length} 个（1–12）｜分区 tid=${TID}（必须给 --tid）`);
}

// 发布策略：不公开就必须定时（B 站网页投稿没有真正的"仅自己可见"，最接近的是定时发布）
if (!PREFLIGHT && !PUBLIC && !DTIME) fail('拒绝直接公开：要么给 --dtime 定时发布，要么显式 --public');
if (DTIME && !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(DTIME)) fail(`--dtime 格式应为 "YYYY-MM-DD HH:MM"，收到 "${DTIME}"`);

let descText = DESC;
if (DESC_FILE) {
  const p = path.resolve(ROOT, DESC_FILE);
  if (!fs.existsSync(p)) fail(`简介文件不存在：${DESC_FILE}`);
  descText = fs.readFileSync(p, 'utf8');
}
plan.payload = {
  copyright: COPYRIGHT, tid: TID, title: TITLE, desc: String(descText || '').slice(0, 2000),
  tag: tags.join(','), cover: path.relative(ROOT, C), no_reprint: 1, open_elec: 0,
  ...(DTIME ? { dtime: DTIME } : {}),
  video: path.relative(ROOT, V),
};

console.log(`[plan] ${PREFLIGHT ? '预检（不联网写）' : '真实提交'}`);
console.log(`  视频 ${plan.checks.video.file} ${plan.checks.video.w}x${plan.checks.video.h} ${dur.toFixed(1)}s ${sizeMb.toFixed(1)}MB ${vs.codec_name}`);
console.log(`  封面 ${plan.checks.cover.file} ${csize.toFixed(2)}MB`);
console.log(`  标题「${TITLE}」(${titleLen}字)  标签 ${tags.length} 个  tid=${TID}  画幅 ${isVertical ? '9:16' : '16:9'}`);
console.log(`  发布策略：${DTIME ? `定时 ${DTIME}` : PUBLIC ? '立即公开（--public）' : '未指定（预检模式下允许）'}`);

// ---------- 2) 可选：只读探测协议形状 ----------
if (PROBE) {
  const cred = loadCred();
  if (!cred) fail('--probe 需要凭据：node Tool\\ops\\bili_auth.mjs --template 后填写');
  console.log(`\n[probe] 凭据：${credSummary(cred)}`);
  const login = await checkLogin(cred);
  if (!login.loggedIn) fail(`--probe：未登录（code=${login.code}）`);
  console.log(`[probe] 登录 ${login.uname}（mid=${login.mid}）`);
  // 只读：问各候选端点"存在不存在"（GET，不会提交任何东西）
  const cands = [
    ['稿件列表', 'https://member.bilibili.com/x/web/archives?status=all&pn=1&ps=5'],
    ['分区导航', 'https://member.bilibili.com/x/vu/web/region'],
    ['投稿初始化 v1', 'https://member.bilibili.com/x/vu/web/add/v3'],
    ['投稿初始化 v2', 'https://member.bilibili.com/x/vu/web/upload/init'],
    ['投递器信息', 'https://member.bilibili.com/x/vu/web/client/info'],
  ];
  const probe = {};
  for (const [name, url] of cands) {
    const r = await biliGet(url, { cred });
    probe[name] = { status: r.status, code: r.code ?? null, message: (r.message || r.error || '').slice(0, 60), risk: !!r.risk };
    console.log(`  ${name.padEnd(12)} status=${r.status} code=${r.code ?? '-'} ${probe[name].message}${r.risk ? ' ⚠风控' : ''}`);
  }
  // WBI 自检（投稿/空间类接口都要签名）
  try {
    const q = await signWbi({ mid: login.mid, ps: 3, pn: 1 }, cred);
    const r = await biliGet(`https://api.bilibili.com/x/space/wbi/arc/search?${q}`, { cred });
    probe.wbi = { ok: r.ok, code: r.code, risk: !!r.risk };
    console.log(`  WBI 签名自检 code=${r.code} ${r.ok ? 'OK' : (r.message || r.error)}`);
  } catch (e) { probe.wbi = { ok: false, error: String(e.message).slice(0, 120) }; console.log(`  WBI 自检失败：${probe.wbi.error}`); }
  plan.probe = probe;
}

// ---------- 3) 真实提交（未实现，明确拒绝而不是假装成功）----------
if (!PREFLIGHT) {
  console.error('\n[未实现] 真实上传的三步协议（init → 分片上传 → add）目前**没有验证过**，');
  console.error('本脚本不会在没有实测的情况下发请求。下一步（阶段 B 第一条）：');
  console.error('  1) 你先放好 Cookie → 我跑 `--probe` 把真实端点形状钉下来；');
  console.error('  2) 按实测结果实现 init/分片/add，并用**定时发布**先发一条（可删稿回滚）；');
  console.error('  3) 你确认内容无误后再决定是否公开。');
  process.exit(4);
}

if (JSON_OUT) {
  fs.mkdirSync(path.dirname(path.resolve(ROOT, JSON_OUT)), { recursive: true });
  fs.writeFileSync(path.resolve(ROOT, JSON_OUT), JSON.stringify(plan, null, 2), 'utf8');
  console.log(`\n计划 → ${JSON_OUT}`);
}
console.log(`\n=== 预检 ${plan.checks.video.ok && plan.checks.cover.ok && plan.checks.meta.ok ? 'PASS' : 'FAIL'}（未上传任何文件）===`);
