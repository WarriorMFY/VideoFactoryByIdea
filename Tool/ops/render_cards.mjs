#!/usr/bin/env node
/**
 * render_cards.mjs — 把一页 HTML 里的若干版式块逐个截成整屏 PNG（loop23 升格版）
 *
 * 用途：做「版式卡」素材——标题卡 / 金句卡 / 双栏数据卡 / SVG 图表卡 / 片尾卡。
 * 比在 ffmpeg 里画 drawtext 靠谱：排版、字距、渐变、SVG 都在浏览器里完成，所见即所得。
 *
 * 用法：
 *   node Tool/ops/render_cards.mjs --html <cards.html> --out <cards/> --ids title,quote1,info1
 *   node Tool/ops/render_cards.mjs                       # 跑 loop23 默认（复现《光偷走的那两小时》版式卡）
 *   node Tool/ops/render_cards.mjs --html x.html --ids a,b --copy "img1.png,img2.png"
 *
 * 参数：
 *   --html <path>   版式页，默认 Prototype/loop23_shortfilm/cards.html
 *   --out  <dir>    PNG 输出目录，默认 <html 所在目录>/cards
 *   --ids  <a,b,c>  要截图的元素 id，按给出顺序渲染；省略时自动取带 data-card 属性的元素
 *   --size <WxH>    视口尺寸，默认 1920x1080
 *   --wait <ms>     页面加载后等待（等字体/web font 落位），默认 1200
 *   --copy <a,b>    需要拷进 <html 目录>/cards_src 的图片（版式页里 <img src="cards_src/..."> 用）
 *   --from <dir>    上述图片的来源目录，默认 Workspace/tmp/loop23_img
 *
 * 约定：截图元素必须是固定像素尺寸的整屏块（1920×1080），否则成片会与画布不匹配。
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadPlaywright, launchProfile } from '../lib/pw.mjs';
import { ROOT } from '../lib/ff.mjs';

const argv = process.argv.slice(2);
const opt = (name, dv) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dv;
};
const abs = (p) => (path.isAbsolute(p) ? p : path.join(ROOT, p));

const HTML = abs(opt('html', 'Prototype/loop23_shortfilm/cards.html'));
if (!fs.existsSync(HTML)) { console.error(`版式页不存在: ${HTML}`); process.exit(1); }
const HTML_DIR = path.dirname(HTML);
const OUT = abs(opt('out', path.join(HTML_DIR, 'cards')));
const [VW, VH] = String(opt('size', '1920x1080')).split('x').map(Number);
const WAIT = Number(opt('wait', '1200'));
const IDS = String(opt('ids', '')).split(',').map((s) => s.trim()).filter(Boolean);
const COPY = String(opt('copy', '')).split(',').map((s) => s.trim()).filter(Boolean);
const FROM = abs(opt('from', 'Workspace/tmp/loop23_img'));

// 版式页里常引用 cards_src/ 下的画面（双栏信息卡左侧透出画面），先把图拷到位
if (COPY.length) {
  const dst = path.join(HTML_DIR, 'cards_src');
  fs.mkdirSync(dst, { recursive: true });
  for (const f of COPY) {
    const src = path.isAbsolute(f) ? f : path.join(FROM, f);
    if (!fs.existsSync(src)) { console.error(`待拷图片不存在: ${src}`); process.exit(1); }
    fs.copyFileSync(src, path.join(dst, path.basename(f)));
  }
}
fs.mkdirSync(OUT, { recursive: true });

const { pw, from } = loadPlaywright();
console.log('playwright from', from);
const { page, ctx } = await launchProfile({ headless: true, profile: path.join(ROOT, 'Workspace/run/profile_cards') });
try {
  await page.setViewportSize({ width: VW, height: VH });
  // 用 pathToFileURL 兜住中文路径与空格（手拼 file:/// 在非 ASCII 路径上会打不开）
  const { pathToFileURL } = await import('node:url');
  await page.goto(pathToFileURL(HTML).href, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(WAIT);

  const targets = IDS.length ? IDS : await page.$$eval('[data-card]', (els) => els.map((e) => e.id).filter(Boolean));
  if (!targets.length) { console.error('没有可截图的元素：传 --ids，或给版式块加 data-card 属性'); process.exit(1); }

  const done = [];
  for (const id of targets) {
    const el = page.locator('#' + id);
    if (!(await el.count())) { console.error(`元素不存在: #${id}`); process.exit(1); }
    const box = await el.boundingBox();
    if (!box) { console.error(`元素不可见: #${id}`); process.exit(1); }
    if (Math.abs(box.width - VW) > 2 || Math.abs(box.height - VH) > 2) {
      console.log(`⚠ #${id} 尺寸 ${box.width}×${box.height} ≠ ${VW}×${VH}，成片会缩放失真`);
    }
    const file = path.join(OUT, id + '.png');
    await el.screenshot({ path: file });
    const kb = (fs.statSync(file).size / 1024).toFixed(0);
    console.log(`✓ ${id}.png (${kb}KB)`);
    done.push(id);
  }
  console.log(`完成 ${done.length} 张 → ${OUT}`);
} finally {
  await ctx.close().catch(() => {});
}
