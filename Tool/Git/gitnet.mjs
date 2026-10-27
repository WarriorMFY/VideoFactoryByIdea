#!/usr/bin/env node
/**
 * Tool/Git/gitnet.mjs — 让 git 网络操作「短失败 + 自动换端点」，不再长时间卡住
 *
 * 为什么需要它（2026-10-27 实测，详见 Tool/Git/Git.md）：
 *   - 本机 `github.com` 的 443 端口能建 TCP 连接（Node net.connect 145ms 成功），
 *     但真实 git 协议会半途被掐：`git pull` 直连要 **21.5s / 56.1s** 才失败
 *     （`Failed to connect ... after 21040 ms` 或 `OpenSSL SSL_read: ... errno 10053`）。
 *   - 镜像 `ghproxy.net` 可用但首字节很慢（ls-remote 26–34s），所以也不能用"短预探测"判死。
 *   - 结论：**TCP/HTTP 探测都不可信**，只能靠 (a) 记住上次成功的端点 (b) 给每次尝试
 *     "无进展看门狗" + 硬超时。这就是本脚本的全部设计。
 *
 * 机制：
 *   1. **端点学习**：成功/失败写入 Workspace/cache/gitnet/state.json。
 *      连续失败 ≥2 次的端点会被降级 24h（下次先走别家）；成功过的端点优先。
 *   2. **无进展看门狗**：git 输出（--progress）落到文件，1s 轮询文件大小；
 *      连续 stallMs（默认 45s）无增长或超过硬超时 → 杀整个进程树，换下一个端点。
 *      所以最坏等待是「45s × 端点数」，不会是几分钟。
 *   3. **不会挂起在凭据提示**：GIT_TERMINAL_PROMPT=0 / GCM_INTERACTIVE=never。
 *   4. **不污染仓库配置**：镜像只用于传输，clone 成功后 origin 改回规范地址。
 *   5. 子进程绝不用管道 stdio（本沙箱 spawnSync 默认 'pipe' 会 EPERM，见 Tool/env.md §二）。
 *
 * 铁律：只操作本地仓库；push 只在人明确要求时用。
 */
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const CACHE = path.join(ROOT, 'Workspace', 'cache', 'gitnet');
const STATE_FILE = path.join(CACHE, 'state.json');
const GIT = process.env.GITNET_GIT || 'git';
const DEFAULT_REPO = 'WarriorMFY/VideoFactoryByIdea';

// 内置端点：id / 供 probe 显示的主机 / 把规范 URL 包装成该端点可用的 URL
const ENDPOINTS = [
  { id: 'direct', probeHost: 'github.com', wrap: (u) => u },
  { id: 'ghproxy', probeHost: 'ghproxy.net', wrap: (u) => `https://ghproxy.net/${u}` },
];

const O = {
  stallMs: 45000, // 无输出增长多久判定卡死（镜像首字节可慢到 34s，故留 45s）
  fetchMs: 300000, // 单次 fetch 硬超时
  cloneMs: 900000, // 单次 clone 硬超时（30MB 仓库实测约 2 分钟）
  pushMs: 120000,
  lsRemoteMs: 90000,
  deadAfterFails: 2, // 连续失败几次后降级
  demoteBaseMs: 5 * 60000, // 降级基数：5 分钟起，按失败次数翻倍
  demoteMaxMs: 60 * 60000,
};

/** 降级窗口：网络时好时坏（实测 direct 21s 失败与 1.2s 成功会交替出现），
 *  所以不做"永久拉黑"，只做短退避：5/10/20/40/60 分钟。 */
function demoteWindowMs(streak) {
  const n = Math.max(0, (streak || 0) - O.deadAfterFails);
  return Math.min(O.demoteMaxMs, O.demoteBaseMs * 2 ** n);
}

// ---------------------------------------------------------------- 基础工具

const say = (s = '') => process.stdout.write(s + '\n');
const human = (ms) => (ms < 1000 ? `${Math.round(ms)}ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.floor(ms / 60000)}m${Math.round((ms % 60000) / 1000)}s`);
const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);

function normalizeRepoUrl(arg) {
  if (!arg) return null;
  if (/^https?:\/\//i.test(arg)) return arg;
  if (/^git@/i.test(arg)) return arg;
  if (/^[\w.-]+\/[\w.-]+(\.git)?$/.test(arg)) return `https://github.com/${arg.replace(/\.git$/, '')}.git`;
  return null;
}

function stripMirrorPrefix(u) {
  return String(u || '').replace(/^https:\/\/ghproxy\.net\//, '');
}

function tailErr(text, n = 170) {
  const lines = String(text || '').split('\n').map((s) => s.trim()).filter(Boolean);
  const bad = lines.filter((s) => /fatal|error|denied|timeout|abort|failed|refused/i.test(s));
  const pick = bad.length ? bad[bad.length - 1] : lines[lines.length - 1] || '';
  return pick.slice(0, n);
}

// ---------------------------------------------------------------- 端点状态

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return { endpoints: {} }; }
}
function saveState(st) {
  try {
    fs.mkdirSync(CACHE, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(st, null, 2));
  } catch { /* 状态只影响择优，写不了不致命 */ }
}
function markOk(st, id, ms) {
  const e = (st.endpoints[id] = st.endpoints[id] || {});
  e.lastOkAt = Date.now(); e.lastOkMs = ms; e.failStreak = 0; e.lastErr = null;
  saveState(st);
}
function markFail(st, id, err) {
  const e = (st.endpoints[id] = st.endpoints[id] || {});
  e.failStreak = (e.failStreak || 0) + 1; e.lastFailAt = Date.now(); e.lastErr = String(err || '').slice(0, 160);
  saveState(st);
}

/** 端点排序：未被降级的优先；同组内"最近成功过的"优先 */
function orderEndpoints(eps, { forced, state }) {
  if (forced) {
    const hit = eps.filter((e) => e.id === forced);
    if (!hit.length) throw new Error(`未知端点 ${forced}（可选：${eps.map((e) => e.id).join(', ')}）`);
    return hit;
  }
  const isDemoted = (ep, state2 = state) => {
    const s = state2.endpoints[ep.id] || {};
    return (s.failStreak || 0) >= O.deadAfterFails && !!s.lastFailAt && Date.now() - s.lastFailAt < demoteWindowMs(s.failStreak);
  };
  const rank = (ep) => {
    const s = state.endpoints[ep.id] || {};
    return [isDemoted(ep) ? 1 : 0, -(s.lastOkAt || 0), eps.indexOf(ep)];
  };
  return [...eps].sort((a, b) => {
    const ra = rank(a); const rb = rank(b);
    return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2];
  });
}

function describeOrder(eps, state) {
  return eps.map((e) => {
    const s = state.endpoints[e.id] || {};
    const tags = [];
    if (s.lastOkAt && Date.now() - s.lastOkAt < O.demoteMaxMs) tags.push('曾成功');
    if ((s.failStreak || 0) >= O.deadAfterFails && s.lastFailAt && Date.now() - s.lastFailAt < demoteWindowMs(s.failStreak)) {
      tags.push(`连败${s.failStreak}→降级${Math.round(demoteWindowMs(s.failStreak) / 60000)}min`);
    }
    return tags.length ? `${e.id}(${tags.join(',')})` : e.id;
  }).join(' → ');
}

// ---------------------------------------------------------------- git 执行器

let _cfgArgs = null;
/** 固定一组传输配置；sslBackend=openssl 见 Tool/env.md §〇（Schannel 会 SEC_E_NO_CREDENTIALS） */
function baseGitConfig() {
  if (_cfgArgs) return _cfgArgs;
  const has = git(['config', '--get', 'http.sslBackend'], { hardMs: 8000, tag: 'cfg' });
  // lowSpeedTime 必须给足：ghproxy 首字节可慢到 34s，卡 20s 会把"能用的镜像"误杀（实测踩过）。
  const args = ['-c', 'http.lowSpeedLimit=1024', '-c', 'http.lowSpeedTime=90', '-c', 'http.version=HTTP/1.1'];
  if (process.platform === 'win32' && !has.ok) args.push('-c', 'http.sslBackend=openssl');
  _cfgArgs = args;
  return args;
}

/** 实测（History/probe/gitnet_killtest.log）：本沙箱下 `taskkill /T /F` 退出码 1（被拒），
 *  而 `child.kill('SIGKILL')` 3ms 内生效 → 顺序必须是先 kill 主进程，再尽力清孙子进程。 */
function killTree(child) {
  if (!child || child.exitCode !== null) return;
  try { child.kill('SIGKILL'); } catch { /* 已退出 */ }
  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
        .on('error', () => { /* 沙箱可能拒绝，忽略 */ });
    } catch { /* ignore */ }
  }
}

/**
 * 执行 git：stdout/stderr 落文件（禁管道），带「硬超时 + 无进展看门狗」。
 * @returns Promise<{ok,status,ms,text,reason:'ok'|'exit'|'timeout'|'stall',error}>
 */
function git(args, { hardMs = 60000, stallMs = 0, tag = 'git', cwd = process.cwd(), echo = false, extraEnv = null } = {}) {
  fs.mkdirSync(CACHE, { recursive: true });
  const outFile = path.join(CACHE, `${process.pid}_${String(tag).replace(/[^\w.-]+/g, '_').slice(0, 40)}.log`);
  const fd = fs.openSync(outFile, 'w');
  const t0 = Date.now();
  const child = spawn(GIT, args, {
    cwd,
    stdio: ['ignore', fd, fd],
    windowsHide: true,
    env: {
      ...process.env,
      ...(extraEnv || {}),
      GIT_TERMINAL_PROMPT: '0', // 凭据缺失 → 立刻失败，绝不挂起等输入
      GCM_INTERACTIVE: 'never',
      LC_ALL: 'C',
      GIT_PAGER: 'cat',
    },
  });
  return new Promise((resolve) => {
    let killedBy = null;
    let size = 0;
    let lastGrow = Date.now();
    const requestKill = (why) => {
      if (killedBy) return;
      killedBy = why;
      killTree(child);
    };
    const tick = setInterval(() => {
      let s = 0;
      try { s = fs.statSync(outFile).size; } catch { /* ignore */ }
      if (s > size) { size = s; lastGrow = Date.now(); }
      const now = Date.now();
      if (now - t0 > hardMs) requestKill('timeout');
      else if (stallMs && now - lastGrow > stallMs) requestKill('stall');
    }, 1000);
    const finish = (status, err) => {
      clearInterval(tick);
      let text = '';
      try { text = fs.readFileSync(outFile, 'utf8').replace(/\r/g, ''); } catch { /* ignore */ }
      try { fs.closeSync(fd); } catch { /* ignore */ }
      try { fs.unlinkSync(outFile); } catch { /* ignore */ }
      if (echo) process.stdout.write(text);
      resolve({
        ok: !killedBy && status === 0,
        status,
        ms: Date.now() - t0,
        text,
        reason: killedBy ? killedBy : status === 0 ? 'ok' : 'exit',
        error: err ? `${err.code || ''} ${err.message || ''}`.trim() : null,
      });
    };
    child.on('error', (e) => finish(null, e));
    child.on('exit', (code) => finish(code, null));
  });
}

const verdict = (r) => (r.reason === 'timeout' ? '硬超时，已杀进程树' : r.reason === 'stall' ? '无进展，已杀进程树' : tailErr(r.text) || `退出码 ${r.status}`);

/** 清掉 6 小时前的临时日志（被杀的子进程可能还占着句柄导致删不掉，删不掉就下次再说；state.json 永不删） */
function pruneCache() {
  try {
    const cut = Date.now() - 6 * 3600e3;
    for (const f of fs.readdirSync(CACHE)) {
      if (f === 'state.json') continue;
      const p = path.join(CACHE, f);
      try { if (fs.statSync(p).mtimeMs < cut) fs.unlinkSync(p); } catch { /* ignore */ }
    }
  } catch { /* 目录还不存在 */ }
}

// ---------------------------------------------------------------- 参数

function flagValue(args, name) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null;
}
function has(args, name) { return args.includes(name); }
function seconds(args, name = '--timeout') {
  const n = Number(flagValue(args, name));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1000) : 0;
}
function positionals(args) {
  const takesValue = new Set(['--endpoint', '--timeout', '--repo', '--mirror', '--stall', '--helper']);
  const out = [];
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a === '--') break;
    if (takesValue.has(a)) { i++; continue; }
    if (a.startsWith('--')) continue;
    out.push(a);
  }
  return out;
}
function buildEndpoints(args) {
  const eps = [...ENDPOINTS];
  for (let i = 1; i < args.length; i++) {
    if (args[i] !== '--mirror' || !args[i + 1]) continue;
    const base = args[i + 1].endsWith('/') ? args[i + 1] : `${args[i + 1]}/`;
    let host = '';
    try { host = new URL(base).hostname; } catch { continue; }
    eps.push({ id: `mirror:${host}`, probeHost: host, wrap: (u) => `${base}${u}` });
  }
  return eps;
}

// ---------------------------------------------------------------- 单端点尝试模板

/**
 * 依次尝试端点执行 fn(epUrl)，成功即返回；失败换下一个。
 * 每个端点都受 hardMs/stallMs 约束，所以总等待有上界。
 */
async function tryEachEndpoint({ args, url, hardMs, stallMs, tag, run, endpointFilter = null }) {
  const state = loadState();
  const list = endpointFilter ? buildEndpoints(args).filter(endpointFilter) : buildEndpoints(args);
  const eps = orderEndpoints(list, { forced: flagValue(args, '--endpoint'), state });
  say(`端点顺序：${describeOrder(eps, state)}`);
  for (const ep of eps) {
    const epUrl = ep.wrap(url);
    say(`→ ${pad(ep.id, 8)} ${epUrl === url ? '直连' : '经镜像 ' + epUrl.replace(url, '…' + url.slice(-42))}`);
    const r = await run(epUrl, { hardMs, stallMs, tag: `${tag}_${ep.id}` });
    if (r.ok) {
      markOk(state, ep.id, r.ms);
      say(`  OK  ${human(r.ms)}`);
      return { ep, r, epUrl, ok: true };
    }
    markFail(state, ep.id, verdict(r));
    say(`  FAIL ${human(r.ms)}  ${verdict(r)}`);
  }
  return { ok: false };
}

// ---------------------------------------------------------------- probe

function tcpProbe(host, port = 443, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let done = false;
    const sock = net.connect({ host, port });
    const finish = (ok, err) => {
      if (done) return;
      done = true;
      try { sock.destroy(); } catch { /* ignore */ }
      resolve({ host, port, ok, ms: Date.now() - t0, err: err || null });
    };
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => finish(true));
    sock.once('timeout', () => finish(false, 'TCP_TIMEOUT'));
    sock.once('error', (e) => finish(false, e.code || e.message));
  });
}

async function cmdProbe(args) {
  const eps = buildEndpoints(args);
  const repoUrl = normalizeRepoUrl(flagValue(args, '--repo') || DEFAULT_REPO);
  say('第 1 层：TCP 443 能否建连（2.5s 超时）——注意：能建连不代表 git 能跑，见下');
  for (const ep of eps) {
    const p = await tcpProbe(ep.probeHost);
    say(`  ${p.ok ? 'OK  ' : 'FAIL'}  ${pad(ep.id, 8)} ${pad(p.host, 18)} ${padL(human(p.ms), 7)}  ${p.err || ''}`);
  }
  say('');
  if (!has(args, '--deep')) {
    say('第 2 层（真实协议）没有跑。加上 --deep 才会用 git ls-remote 实测（慢，每个端点最多 90s）。');
    say('实测教训：github.com:443 TCP 通，但 git 协议会半途被掐（errno 10053 / connect 21s 超时）→ 必须以 --deep 为准。');
    return 0;
  }
  say(`第 2 层：git ls-remote 真实请求（每端点最多 ${human(seconds(args) || O.lsRemoteMs)}）`);
  const state = loadState();
  for (const ep of orderEndpoints(eps, { forced: flagValue(args, '--endpoint'), state })) {
    const r = await git([...baseGitConfig(), 'ls-remote', '--heads', ep.wrap(repoUrl)], {
      hardMs: seconds(args) || O.lsRemoteMs,
      tag: `lsr_${ep.id}`,
    });
    if (r.ok) markOk(state, ep.id, r.ms); else markFail(state, ep.id, verdict(r));
    const heads = String(r.text).split('\n').filter(Boolean).length;
    say(`  ${r.ok ? 'OK  ' : 'FAIL'}  ${pad(ep.id, 8)} ${padL(human(r.ms), 7)}  ${r.ok ? `${heads} 个分支` : verdict(r)}`);
  }
  say(`\n端点状态文件：${STATE_FILE}`);
  return 0;
}

// ---------------------------------------------------------------- clone

async function cmdClone(args) {
  const positional = positionals(args);
  const url = normalizeRepoUrl(positional[0]);
  if (!url) { say('用法：node Tool/Git/gitnet.mjs clone <owner/repo|URL> [目录] [--endpoint <id>] [--timeout 秒]'); return 2; }
  const dest = path.resolve(positional[1] || url.replace(/\.git$/, '').split('/').pop());
  if (fs.existsSync(dest) && fs.readdirSync(dest).length) { say(`目标目录非空，不覆盖：${dest}`); return 2; }
  const created = !fs.existsSync(dest);

  const res = await tryEachEndpoint({
    args, url,
    hardMs: seconds(args) || O.cloneMs,
    stallMs: seconds(args, '--stall') || O.stallMs,
    tag: 'clone',
    run: async (epUrl, opt) => {
      if (created) fs.rmSync(dest, { recursive: true, force: true }); // 清掉上一轮半成品
      return git([...baseGitConfig(), 'clone', '--progress', epUrl, dest], opt);
    },
  });

  if (!res.ok) {
    if (created) fs.rmSync(dest, { recursive: true, force: true });
    say('\n全部端点失败。排查：① `probe --deep` ② `--mirror <其它镜像前缀/>` ③ 见 Tool/Git/Git.md §5');
    return 1;
  }
  const fix = await git(['-C', dest, 'remote', 'set-url', 'origin', stripMirrorPrefix(url)], { hardMs: 10000, tag: 'seturl' });
  say(fix.ok ? `origin 已置为规范地址：${stripMirrorPrefix(url)}` : `origin 置回失败：${tailErr(fix.text)}`);
  const head = await git(['-C', dest, 'log', '-1', '--format=%h %ad %s', '--date=iso'], { hardMs: 10000, tag: 'head' });
  say(`HEAD ${String(head.text).trim() || '?'}\n位置 ${dest}`);
  return 0;
}

// ---------------------------------------------------------------- 仓库上下文

async function repoCtx(args) {
  const rootR = await git(['rev-parse', '--show-toplevel'], { hardMs: 10000, tag: 'root' });
  if (!rootR.ok) { say('当前目录不在 git 仓库内'); return null; }
  const root = String(rootR.text).trim().split('\n')[0];
  const brR = await git(['-C', root, 'symbolic-ref', '--quiet', '--short', 'HEAD'], { hardMs: 10000, tag: 'branch' });
  if (!brR.ok) { say('HEAD 处于游离状态（detached），请先切到分支'); return null; }
  const branch = String(brR.text).trim().split('\n')[0];
  let url = normalizeRepoUrl(flagValue(args, '--repo'));
  if (!url) {
    const uR = await git(['-C', root, 'remote', 'get-url', 'origin'], { hardMs: 10000, tag: 'geturl' });
    url = uR.ok ? stripMirrorPrefix(String(uR.text).trim().split('\n')[0]) : null;
  }
  if (!url) { say('找不到 origin 远端地址（可用 --repo 指定）'); return null; }
  return { root, branch, url };
}

// ---------------------------------------------------------------- pull / fetch

async function cmdPull(args) {
  const ctx = await repoCtx(args);
  if (!ctx) return 2;
  const { root, branch, url } = ctx;
  say(`仓库 ${root}\n分支 ${branch}  远端 ${url}`);

  const res = await tryEachEndpoint({
    args, url,
    hardMs: seconds(args) || O.fetchMs,
    stallMs: seconds(args, '--stall') || O.stallMs,
    tag: 'fetch',
    run: (epUrl, opt) => git(
      [...baseGitConfig(), '-C', root, 'fetch', '--progress', '--prune', epUrl, `+refs/heads/*:refs/remotes/origin/*`],
      opt,
    ),
  });
  if (!res.ok) { say('\n全部端点 fetch 失败，本地分支未改动。'); return 1; }

  const count = async (rev) => {
    const r = await git(['-C', root, 'rev-list', '--count', rev], { hardMs: 20000, tag: 'count' });
    return Number(String(r.text).trim()) || 0;
  };
  const nBehind = await count(`HEAD..origin/${branch}`);
  const nAhead = await count(`origin/${branch}..HEAD`);
  say(`落后 ${nBehind} 个提交 · 领先 ${nAhead} 个提交`);
  if (has(args, '--check')) { say('（--check：只看差距，不合并）'); return 0; }
  if (nBehind === 0) { say('已是最新。'); return 0; }
  if (nAhead > 0) {
    say('本地与远端已分叉：脚本不自动 merge/rebase。先 `git log --oneline --graph --all` 看清楚再手动处理。');
    return 3;
  }
  const merge = await git(['-C', root, 'merge', '--ff-only', `origin/${branch}`], { hardMs: 60000, tag: 'merge' });
  say(merge.ok ? `已快进到 ${String(merge.text).trim().split('\n')[0]}` : `快进合并失败：${tailErr(merge.text)}`);
  return merge.ok ? 0 : 3;
}

// ---------------------------------------------------------------- push（仅人要求时）

/**
 * 凭据桥：本沙箱下 git 调 credential helper 会经过 sh.exe，创建管道被拒
 * （`sh.exe: *** fatal error - couldn't create signal pipe, Win32 error 5`）→
 * 必须**直接调用 helper 可执行文件**，stdin/stdout 一律用文件重定向。
 * 凭据只在内存中拼成 http.extraheader（经 GIT_CONFIG_* 环境变量传入，不进命令行、不落盘、不打印）。
 */
async function resolveHelper(spec) {
  if (/[\\/]/.test(spec)) return spec;
  const base = spec.startsWith('git-credential-') ? spec : `git-credential-${spec}`;
  const file = base.endsWith('.exe') ? base : `${base}.exe`;
  const ep = await git(['--exec-path'], { hardMs: 8000, tag: 'execpath' });
  const dir = ep.ok ? String(ep.text).trim().split('\n')[0] : '';
  if (dir) {
    const p = path.join(dir, file);
    if (fs.existsSync(p)) return p;
  }
  return file; // 退化为按 PATH 查找
}

function readCredential(helperPath, host = 'github.com') {
  fs.mkdirSync(CACHE, { recursive: true });
  const stamp = `${process.pid}_${Date.now()}`;
  const inF = path.join(CACHE, `${stamp}_cred_in.txt`);
  const outF = path.join(CACHE, `${stamp}_cred_out.txt`);
  const errF = path.join(CACHE, `${stamp}_cred_err.txt`);
  fs.writeFileSync(inF, `protocol=https\nhost=${host}\n\n`);
  const fds = [fs.openSync(inF, 'r'), fs.openSync(outF, 'w'), fs.openSync(errF, 'w')];
  let r;
  try {
    r = spawnSync(helperPath, ['get'], { stdio: fds, timeout: 30000, killSignal: 'SIGKILL', windowsHide: true });
  } finally {
    for (const fd of fds) { try { fs.closeSync(fd); } catch { /* ignore */ } }
  }
  const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };
  const out = read(outF);
  const err = read(errF);
  for (const p of [inF, outF, errF]) { try { fs.unlinkSync(p); } catch { /* ignore */ } }
  const kv = {};
  for (const line of out.split('\n')) {
    const i = line.indexOf('=');
    if (i > 0) kv[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return {
    ok: !!r && r.status === 0 && !!kv.password,
    username: kv.username || '',
    password: kv.password || '',
    err: (err || '').trim().slice(0, 160) || (r && r.status !== 0 ? `退出码 ${r.status}` : ''),
  };
}

async function cmdPush(args) {
  const ctx = await repoCtx(args);
  if (!ctx) return 2;
  const { root, branch, url } = ctx;
  const dry = has(args, '--dry-run');

  // 鉴权推送走公共镜像没有意义（镜像无法代我们鉴权），默认只打规范地址
  const explicit = has(args, '--endpoint') || has(args, '--mirror');
  const endpointFilter = explicit ? null : (ep) => ep.id === 'direct';

  let extraEnv = null;
  const helperSpec = flagValue(args, '--helper');
  if (helperSpec) {
    const helperPath = await resolveHelper(helperSpec);
    const cred = readCredential(helperPath, 'github.com');
    if (!cred.ok) {
      say(`凭据读取失败（${helperSpec} → ${helperPath}）：${cred.err || '没有 password 字段'}`);
      return 1;
    }
    const basic = Buffer.from(`${cred.username}:${cred.password}`).toString('base64');
    extraEnv = { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'http.extraheader', GIT_CONFIG_VALUE_0: `Authorization: Basic ${basic}` };
    say(`凭据来源 ${path.basename(helperPath)}：username=${cred.username}，password=<${cred.password.length} 字符，不打印>`);
  }

  say(`推送 ${branch} → ${url}${dry ? '（dry-run，不真推）' : ''}`);
  const res = await tryEachEndpoint({
    args, url, endpointFilter,
    hardMs: seconds(args) || O.pushMs,
    stallMs: seconds(args, '--stall') || O.stallMs,
    tag: 'push',
    run: (epUrl, opt) => git(
      [...baseGitConfig(), '-C', root, 'push', '--progress', epUrl, `HEAD:${branch}`, ...(dry ? ['--dry-run'] : [])],
      { ...opt, extraEnv: { ...(opt.extraEnv || {}), ...(extraEnv || {}) } },
    ),
  });
  if (!res.ok) {
    say('\n推送失败。凭据问题见 Tool/Git/Git.md §8（本沙箱必须 `--helper wincred`：git 经 sh.exe 调 helper 会被拒）；'
      + '本项目规则：只在人明确要求时推送。');
    return 1;
  }
  // 复核：远端 refs 的 sha 应与本地 HEAD 一致
  const head = await git(['-C', root, 'rev-parse', 'HEAD'], { hardMs: 10000, tag: 'headsha' });
  const localSha = String(head.text).trim().split('\n')[0];
  // 我们是按 URL 推送（不是按 remote 名），origin/<branch> 跟踪引用不会自动前进 → 手动对齐，
  // 否则 `git status -sb` 会一直显示 [ahead N]（误导人以为没推上去）。
  if (!dry && localSha) {
    const ur = await git(['-C', root, 'update-ref', `refs/remotes/origin/${branch}`, localSha], { hardMs: 10000, tag: 'updateref' });
    if (!ur.ok) say(`（本地跟踪引用 origin/${branch} 未能更新：${tailErr(ur.text)}）`);
  }
  const remote = await git([...baseGitConfig(), 'ls-remote', url, `refs/heads/${branch}`], {
    hardMs: 60000, tag: 'verify', extraEnv,
  });
  const remoteSha = String(remote.text).trim().split('\n')[0].split(/\s+/)[0] || '';
  if (!remote.ok) {
    say(`已推送，但远端复核失败（${tailErr(remote.text)}）→ 稍后用 git ls-remote origin 手动确认。`);
  } else if (remoteSha === localSha) {
    say(`远端已对齐：refs/heads/${branch} = ${localSha.slice(0, 8)}`);
  } else {
    say(`注意：远端 ${branch} = ${remoteSha.slice(0, 8)}，本地 HEAD = ${localSha.slice(0, 8)}（不一致，请核对）`);
  }
  const st = await git(['-C', root, 'status', '-sb'], { hardMs: 15000, tag: 'status' });
  say(String(st.text).trim().split('\n')[0] || '');
  return 0;
}

// ---------------------------------------------------------------- run / upgrade

async function cmdRun(args) {
  const i = args.indexOf('--');
  const gitArgs = i >= 0 ? args.slice(i + 1) : args.slice(1);
  if (!gitArgs.length) { say('用法：node Tool/Git/gitnet.mjs run -- <git 参数...>  [--timeout 秒] [--stall 秒]'); return 2; }
  say(`$ git ${gitArgs.join(' ')}`);
  const r = await git([...baseGitConfig(), ...gitArgs], {
    hardMs: seconds(args) || 120000,
    stallMs: seconds(args, '--stall') || 0, // 默认不启用看门狗：任意命令的输出节奏未知
    tag: 'run',
    echo: true,
  });
  say(`\n${r.ok ? 'OK' : 'FAIL'}  退出码 ${r.status}  用时 ${human(r.ms)}  ${r.reason === 'ok' ? '' : verdict(r)}`);
  return r.ok ? 0 : r.status || 1;
}

function cmdState(args) {
  const st = loadState();
  if (has(args, '--reset')) { saveState({ endpoints: {} }); say('已清空端点学习状态。'); return 0; }
  say(`状态文件：${STATE_FILE}`);
  const ids = new Set([...ENDPOINTS.map((e) => e.id), ...Object.keys(st.endpoints)]);
  for (const id of ids) {
    const s = st.endpoints[id] || {};
    const ago = (t) => (t ? human(Date.now() - t) + '前' : '-');
    say(`  ${pad(id, 14)} 连续失败 ${String(s.failStreak || 0).padEnd(2)} 最近成功 ${pad(ago(s.lastOkAt), 12)} 最近失败 ${pad(ago(s.lastFailAt), 12)} ${s.lastErr ? '「' + s.lastErr.slice(0, 60) + '」' : ''}`);
  }
  return 0;
}

// ---------------------------------------------------------------- 入口

const USAGE = `Tool/Git/gitnet.mjs — git 网络操作「短失败 + 自动换端点」

  node Tool/Git/gitnet.mjs probe [--deep] [--repo owner/repo]   # --deep 才做真实协议实测
  node Tool/Git/gitnet.mjs clone <owner/repo|URL> [目录]         # 逐端点克隆，成功后 origin 置回规范地址
  node Tool/Git/gitnet.mjs pull  [--check]                       # fetch + 快进合并（分叉则不动手）
  node Tool/Git/gitnet.mjs push  [--dry-run] [--helper wincred]  # 只在人明确要求时用；本沙箱要 --helper
  node Tool/Git/gitnet.mjs state [--reset]                       # 看/清端点学习结果
  node Tool/Git/gitnet.mjs run -- <git 参数...>                   # 带硬超时地跑任意 git 命令

通用参数：--endpoint <direct|ghproxy|mirror:host>  --mirror <https://镜像前缀/>
          --timeout <秒>（单端点硬超时）  --stall <秒>（无进展判定，默认 45s）

推送注意：git 经 sh.exe 调 credential helper 在本沙箱会被拒（Win32 error 5），
必须用 --helper wincred 让脚本直接调 helper 可执行文件取凭据（凭据不打印、不落盘）。

设计前提（实测）：TCP 通不代表 git 能跑；镜像首字节可慢到 34s。
所以不做"短预探测判死"，改为：端点学习 + 无进展看门狗 + 硬超时。`;

async function main(argv) {
  pruneCache();
  const cmd = argv[0];
  if (!cmd || cmd === '-h' || cmd === '--help') { say(USAGE); return 0; }
  const map = { probe: cmdProbe, clone: cmdClone, pull: cmdPull, push: cmdPush, state: cmdState, run: cmdRun };  if (!map[cmd]) { say(`未知子命令：${cmd}\n\n${USAGE}`); return 2; }
  const t0 = Date.now();
  let code = 1;
  try { code = await map[cmd](argv); } catch (e) { say(`异常：${e && e.message ? e.message : e}`); code = 1; }
  say(`\n总用时 ${human(Date.now() - t0)}`);
  return code;
}

main(process.argv.slice(2)).then((c) => process.exit(c));
