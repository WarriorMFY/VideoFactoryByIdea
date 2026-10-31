#!/usr/bin/env node
/**
 * lib/bili.mjs — B 站网页端接口的公共层（登录态 / 请求包装 / WBI 签名 / 风控识别）
 *
 * 为什么要有这一层：B 站没有给个人开发者公开投稿 API（open.bilibili.com 需要资质），
 * 自动发布只能走网页端接口。这类接口有三个必须统一处理的东西：
 *   1. 登录态：Cookie 里的 SESSDATA + bili_jct(csrf) + DedeUserID；
 *   2. WBI 签名：`/x/space/wbi/*`、部分 `member.bilibili.com/x/*` 端点会校验 `w_rid`+`wts`，
 *      不签名直接 412（实测：无签名请求 WBI 端点返回 412）；
 *   3. 风控：返回 HTML（不是 JSON）或 code=-352/-412/-509 时，**必须停下报告，不能重试绕过**。
 *
 * 安全约定（重要，别放松）：
 *   · 凭据只从 `Workspace/secrets/bili.cookie.json` 或环境变量读，**只存在于内存与本机临时文件**；
 *   · 任何日志/报错**不打印**凭据值（只打印长度与 mid）；
 *   · 本文件永不写入仓库（Workspace/ 已在 .gitignore 内）。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const ROOT = path.resolve(import.meta.dirname, '..', '..');
export const SECRET_FILE = path.join(ROOT, 'Workspace', 'secrets', 'bili.cookie.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/** 读凭据：文件优先，其次环境变量。返回 { sessdata, bili_jct, dede_user_id, source } */
export function loadCred() {
  if (fs.existsSync(SECRET_FILE)) {
    let j;
    try { j = JSON.parse(fs.readFileSync(SECRET_FILE, 'utf8')); } catch (e) { throw new Error(`凭据文件不是合法 JSON：${SECRET_FILE}`); }
    const sessdata = String(j.SESSDATA || j.sessdata || '').trim();
    const bili_jct = String(j.bili_jct || j.BILI_JCT || j.csrf || '').trim();
    const dede_user_id = String(j.DedeUserID || j.dede_user_id || j.mid || '').trim();
    // 模板文件是空值：视为"还没配"，交给调用方给填写指引（不要抛栈让人以为是 bug）
    if (!sessdata && !bili_jct && !dede_user_id) return null;
    if (!sessdata || !bili_jct) throw new Error('凭据文件缺少 SESSDATA 或 bili_jct');
    return { sessdata, bili_jct, dede_user_id, source: path.relative(ROOT, SECRET_FILE) };
  }
  const sessdata = (process.env.BILI_SESSDATA || '').trim();
  const bili_jct = (process.env.BILI_JCT || '').trim();
  const dede_user_id = (process.env.BILI_DEDEUSERID || '').trim();
  if (sessdata && bili_jct) return { sessdata, bili_jct, dede_user_id, source: '环境变量' };
  return null;
}

export function cookieHeader(cred) {
  const parts = [`SESSDATA=${cred.sessdata}`];
  if (cred.bili_jct) parts.push(`bili_jct=${cred.bili_jct}`);
  if (cred.dede_user_id) parts.push(`DedeUserID=${cred.dede_user_id}`);
  return parts.join('; ');
}

/** 不带凭据的摘要（用于日志/报告，绝不泄露值） */
export function credSummary(cred) {
  if (!cred) return '未配置凭据';
  return `来源=${cred.source}　SESSDATA=${cred.sessdata.length}字符　bili_jct=${cred.bili_jct.length}字符　mid=${cred.dede_user_id || '(未知)'}`;
}

const JSON_HEADERS = (cred) => ({
  'User-Agent': UA,
  Referer: 'https://member.bilibili.com/platform/home',
  Origin: 'https://member.bilibili.com',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9',
  ...(cred ? { Cookie: cookieHeader(cred) } : {}),
});

/** 统一请求：返回 { ok, status, json, text, risk } —— risk=true 表示遇到风控/非 JSON，调用方应停下 */
export async function biliGet(url, { cred = null, timeoutMs = 25000, extraHeaders = {} } = {}) {
  const t0 = Date.now();
  let r;
  try {
    r = await fetch(url, { headers: { ...JSON_HEADERS(cred), ...extraHeaders }, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    return { ok: false, status: 0, ms: Date.now() - t0, error: `${e.name}: ${String(e.message).slice(0, 80)}`, risk: false };
  }
  const ct = r.headers.get('content-type') || '';
  const text = await r.text();
  const ms = Date.now() - t0;
  if (!/json/i.test(ct)) {
    // 返回 HTML：多半是风控页或接口改版；不做重试绕过
    return { ok: false, status: r.status, ms, text, risk: true, error: `非 JSON 响应（${ct || '无 content-type'}，${text.length}B）` };
  }
  let json = null;
  try { json = JSON.parse(text); } catch { return { ok: false, status: r.status, ms, text, risk: true, error: 'JSON 解析失败' }; }
  const code = json?.code;
  const RISK_CODES = new Set([-352, -401, -412, -509, -799]);
  return {
    ok: r.ok && code === 0, status: r.status, ms, json, text,
    code, message: json?.message || '',
    risk: RISK_CODES.has(code),
  };
}

// ---------------- WBI 签名 ----------------
// 算法来源：B 站 web 端公开实现（img_key+sub_key 按固定置换表重排取前 32 位作 mixin_key，
// 参数按字典序拼接后 md5(query + mixin_key)）。只用于让请求通过校验，不做任何绕过。
const MIXIN_TAB = [46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52];

let _wbiCache = null; // { mixinKey, at }
export async function getMixinKey(cred) {
  if (_wbiCache && Date.now() - _wbiCache.at < 30 * 60 * 1000) return _wbiCache.mixinKey;
  const r = await biliGet('https://api.bilibili.com/x/web-interface/nav', { cred });
  if (!r.json?.data?.wbi_img) throw new Error(`拿不到 WBI keys（code=${r.code} ${r.message}）`);
  const img = String(r.json.data.wbi_img.img_url).split('/').pop().split('.')[0];
  const sub = String(r.json.data.wbi_img.sub_url).split('/').pop().split('.')[0];
  const raw = img + sub;
  const mixinKey = MIXIN_TAB.map((i) => raw[i] || '').join('').slice(0, 32);
  _wbiCache = { mixinKey, at: Date.now() };
  return mixinKey;
}

/** 给参数加 wts 与 w_rid，返回可直接拼到 URL 的查询串 */
export async function signWbi(params, cred) {
  const mixinKey = await getMixinKey(cred);
  const p = { ...params, wts: Math.floor(Date.now() / 1000) };
  const query = Object.keys(p).sort()
    .map((k) => {
      const v = String(p[k]).replace(/[!'()*]/g, '');
      return `${encodeURIComponent(k)}=${encodeURIComponent(v)}`;
    })
    .join('&');
  const w_rid = crypto.createHash('md5').update(query + mixinKey).digest('hex');
  return `${query}&w_rid=${w_rid}`;
}

/** 登录态：返回 { loggedIn, mid, uname, level, wbiReady } */
export async function checkLogin(cred) {
  const r = await biliGet('https://api.bilibili.com/x/web-interface/nav', { cred });
  const d = r.json?.data;
  return {
    reachable: r.status > 0 && !!r.json,
    loggedIn: !!d?.isLogin,
    code: r.code ?? null,
    mid: d?.mid ?? null,
    uname: d?.uname ?? null,
    level: d?.level_info?.current_level ?? null,
    wbiReady: !!d?.wbi_img,
    risk: r.risk,
    error: r.error,
    ms: r.ms,
  };
}
