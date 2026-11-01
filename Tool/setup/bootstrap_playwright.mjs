#!/usr/bin/env node
/**
 * bootstrap_playwright.mjs — 安装 playwright（只装 Node 包，不下载浏览器）
 *
 * 环境事实（2026-10-31 本机实测）：
 *   - 系统自带 Edge（C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe），可直接 channel=msedge 驱动；
 *   - playwright 的浏览器 CDN 在本机不可达，所以**永远不要**跑 `playwright install`；
 *   - `npm install` 直连官方源会 ECONNRESET，走 npmmirror 镜像 30 秒装完（playwright + playwright-core 约 25MB）。
 *
 * 落点：Workspace/deps/node_modules/（Workspace 在 .gitignore 内，可随时删掉重建）
 * 幂等：已能从 Workspace/deps 解析到 playwright 就跳过。
 *
 * 用法：node Tool/setup/bootstrap_playwright.mjs [--force]
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { ROOT } from '../lib/ff.mjs';

const DEPS = path.join(ROOT, 'Workspace', 'deps');
const NODE_MODULES = path.join(DEPS, 'node_modules');
const REGISTRY = 'https://registry.npmmirror.com';
const FORCE = process.argv.includes('--force');

const log = (m) => console.log(`[pw] ${m}`);

function resolvable() {
  try {
    createRequire(path.join(NODE_MODULES, '__probe__.cjs'))('playwright');
    return true;
  } catch {
    return false;
  }
}

function detectBrowser() {
  const cands = [
    ['msedge', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'],
    ['msedge', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'],
    ['chrome', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'],
    ['chrome', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'],
  ];
  for (const [channel, exe] of cands) if (fs.existsSync(exe)) return { channel, exe };
  return null;
}

if (!FORCE && resolvable()) {
  log(`已安装，跳过：${NODE_MODULES}`);
} else {
  fs.mkdirSync(DEPS, { recursive: true });
  const pkgJson = path.join(DEPS, 'package.json');
  if (!fs.existsSync(pkgJson)) {
    fs.writeFileSync(
      pkgJson,
      JSON.stringify({ name: 'videofactory-workspace', private: true, description: '工厂运行期依赖（可删）' }, null, 2)
    );
  }
  log(`npm install playwright @ ${REGISTRY}（不下载浏览器）`);
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const r = spawnSync(
    npm,
    ['install', 'playwright', '--prefix', DEPS, `--registry=${REGISTRY}`, '--no-audit', '--no-fund', '--loglevel=error'],
    {
      stdio: 'inherit',
      cwd: DEPS,
      shell: process.platform === 'win32',
      env: { ...process.env, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1', npm_config_registry: REGISTRY },
    }
  );
  if (r.status !== 0) {
    console.error(`\n[FAIL] npm install 退出码 ${r.status}`);
    console.error('兜底：node Tool/setup/npm_fetch.mjs playwright Workspace/deps/node_modules');
    process.exit(1);
  }
  if (!resolvable()) {
    console.error('[FAIL] 装完了但解析不到 playwright，检查 Workspace/deps/node_modules/playwright 是否存在');
    process.exit(1);
  }
  log('安装完成');
}

const b = detectBrowser();
if (b) log(`系统浏览器：${b.channel} → ${b.exe}`);
else log('⚠ 未找到系统 Edge/Chrome：登录/发布需要浏览器，请先安装 Microsoft Edge');

const { version } = JSON.parse(fs.readFileSync(path.join(NODE_MODULES, 'playwright', 'package.json'), 'utf8'));
log(`playwright ${version} 就绪`);
