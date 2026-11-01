#!/usr/bin/env node
/**
 * pw.mjs — Playwright + 系统浏览器 + 持久化登录态（发布链共用）
 *
 * 为什么不用 playwright 自带 Chromium：本机下载 browsers 走的是 CDN，实测不通；
 * 系统里已有 Edge（Windows 10+ 自带），用 channel='msedge' 直接驱动，零下载。
 *
 * 模块解析顺序（第一个能 require 到的就用，避免把路径写死在某台机器上）：
 *   1. Workspace/deps/node_modules           ← bootstrap_playwright.mjs 的落点（跟随仓库，可随时删）
 *   2. ~/.workbuddy/binaries/node/workspace/node_modules  ← 宿主托管运行时
 *   3. %APPDATA%/npm/node_modules       ← 全局安装兜底
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT } from './ff.mjs';

export const WORKSPACE = path.join(ROOT, 'Workspace');
export const PROFILE_DIR = path.join(WORKSPACE, 'run', 'bili_profile');

/** 候选模块目录（按优先级） */
export function moduleDirs() {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const appdata = process.env.APPDATA || '';
  return [
    path.join(WORKSPACE, 'deps', 'node_modules'),
    path.join(home, '.workbuddy', 'binaries', 'node', 'workspace', 'node_modules'),
    path.join(appdata, 'npm', 'node_modules'),
  ].filter(Boolean);
}

/** 返回 { pw, from }；找不到时抛可操作的错误 */
export function loadPlaywright() {
  const tried = [];
  for (const dir of moduleDirs()) {
    try {
      const req = createRequire(path.join(dir, '__resolve_probe__.cjs'));
      return { pw: req('playwright'), from: dir };
    } catch (e) {
      tried.push(`  ${dir} → ${e.code || String(e.message).split('\n')[0]}`);
    }
  }
  const err = new Error(
    'playwright 不可用。先跑：node Tool/setup/bootstrap_playwright.mjs\n已尝试：\n' + tried.join('\n')
  );
  err.code = 'PLAYWRIGHT_MISSING';
  throw err;
}

const BROWSERS = [
  ['msedge', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'],
  ['msedge', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'],
  ['chrome', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'],
  ['chrome', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'],
];

/** 找系统浏览器；返回 { channel, exe } */
export function detectBrowser() {
  for (const [channel, exe] of BROWSERS) if (fs.existsSync(exe)) return { channel, exe };
  return null;
}

export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0';

/**
 * 启动持久化上下文（登录态存在 profile 目录里，下次免扫码）
 * @returns {{ctx, page, info:{channel,exe,profile,modulesFrom}}}
 */
export async function launchProfile(opts = {}) {
  const { profile = PROFILE_DIR, headless = true, channel = null, viewport = { width: 1440, height: 900 } } = opts;
  const { pw, from } = loadPlaywright();
  const b = channel ? { channel, exe: '' } : detectBrowser();
  if (!b) throw new Error('未找到系统 Edge/Chrome；请安装 Microsoft Edge 或传 --channel chrome');
  fs.mkdirSync(profile, { recursive: true });
  const ctx = await pw.chromium.launchPersistentContext(profile, {
    channel: b.channel,
    headless,
    viewport,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    userAgent: UA,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--lang=zh-CN'],
  });
  const page = ctx.pages()[0] || (await ctx.newPage());
  page.setDefaultTimeout(30000);
  return { ctx, page, info: { channel: b.channel, exe: b.exe, profile, modulesFrom: from } };
}

/** 登录态：SESSDATA + DedeUserID 同时存在才算登录 */
export async function loginState(ctx) {
  const cookies = await ctx.cookies('https://www.bilibili.com');
  const map = new Map(cookies.map((c) => [c.name, c.value]));
  return {
    loggedIn: map.has('SESSDATA') && map.has('DedeUserID'),
    uid: map.get('DedeUserID') || null,
    cookieCount: cookies.length,
  };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
