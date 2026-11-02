#!/usr/bin/env node
/**
 * render_cards.mjs — loop23：用 Playwright 把 cards.html 的 7 个版式逐个截图为 1920x1080 PNG
 *
 * ⚠ 冻结快照（2026-11-02）：仅为复现留档，不再维护。
 *   现行版本已升格为 `Tool/ops/render_cards.mjs`（--html/--out/--ids/--size/--copy，
 *   自动检测非整屏元素、pathToFileURL 兜中文路径）。改逻辑请改 ops 那份。
 *
 * 用法: node render_cards.mjs
 */
import { loadPlaywright, launchProfile } from '../../Tool/lib/pw.mjs';
import path from 'node:path';
import fs from 'node:fs';
import { ROOT } from '../../Tool/lib/ff.mjs';

const DIR = path.join(ROOT, 'Prototype/loop23_shortfilm');
const SRC = path.join(ROOT, 'Workspace/tmp/loop23_img');
fs.mkdirSync(path.join(DIR, 'cards_src'), { recursive: true });
// info 卡左侧画面
for (const f of ['img03_1940s.png', 'img07_phone.png']) fs.copyFileSync(path.join(SRC, f), path.join(DIR, 'cards_src', f));

const FRAMES = ['title', 'quote1', 'info1', 'chart', 'info2', 'quote2', 'end'];
const { pw } = loadPlaywright();
console.log('playwright from', loadPlaywright().from);
const { page, ctx } = await launchProfile({ headless: true, profile: path.join(ROOT, 'Workspace/run/profile_cards') });
console.log('browser up');
try {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('file:///' + path.join(DIR, 'cards.html').replace(/\\/g, '/'), { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(1200);
  for (const id of FRAMES) {
    const el = page.locator('#' + id);
    await el.screenshot({ path: path.join(DIR, 'cards', id + '.png') });
    console.log('✓', id + '.png');
  }
} finally { await ctx.close().catch(() => {}); }
console.log('完成');
