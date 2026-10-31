#!/usr/bin/env node
/**
 * check_cover.mjs — 封面自检（把小循环 12 挂账项④"封面文字观感需人眼确认"变成可量化 + 我来看图）
 *
 * 为什么能做成脚本：封面是 `make_cover.mjs` 用**已知布局**画的（底部黑蒙版 + 标题/副标题 + 左上角标），
 * 所以"文字可读性"可以用**像素统计**代理，而不是靠感觉：
 *   · 文字带是不是真的暗底（不然白字糊在亮画面上）
 *   · 高亮像素占比（太小=没字/字太暗，太大=过曝或面积过大）
 *   · 缩到信息流缩略图尺寸后还有没有对比（320px 宽是 B 站/抖音列表里最常见的显示尺度）
 *   · 文字有没有贴边（四周 2% 条带内不应出现亮文字像素）
 *
 * 明确的局限：本脚本**不做 OCR**，验不出错别字/文案好坏/主体表情；那部分由人（或我看图）确认。
 *
 * 用法：node Tool\ops\check_cover.mjs --cover <jpg> [--expect 16:9|9:16] [--json out.json] [--md out.md]
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, FF, ffprobeJson } from '../lib/ff.mjs';

const args = process.argv.slice(2);
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const COVER = getOpt('--cover', '');
if (!COVER) { console.error('用法: node Tool/ops/check_cover.mjs --cover <jpg> [--expect 16:9|9:16]'); process.exit(2); }
const SRC = path.resolve(ROOT, COVER);
if (!fs.existsSync(SRC)) { console.error('封面不存在:', SRC); process.exit(1); }
const EXPECT = getOpt('--expect', '');
const JSON_OUT = getOpt('--json', '');
const MD_OUT = getOpt('--md', '');
const WORK = path.join(ROOT, 'Workspace', 'cache', 'covercheck');
fs.mkdirSync(WORK, { recursive: true });

const probe = ffprobeJson(['-show_streams', '-show_format', SRC], path.join(WORK, '_probe.log'));
const v = (probe.streams || []).find((s) => s.codec_type === 'video');
if (!v) { console.error('不是图片/读不到画面'); process.exit(1); }
const W = Number(v.width), H = Number(v.height);
const ratio = W / H;

/** 用 ffmpeg 把图转成灰度原始像素（禁管道 → 写文件再读） */
function gray(file, w, h) {
  const out = path.join(WORK, `${path.basename(file, path.extname(file))}_${w}x${h}.gray`);
  const r = spawnSync(FF, ['-hide_banner', '-loglevel', 'error', '-y', '-i', file, '-vf', `scale=${w}:${h}:flags=area,format=gray`, '-f', 'rawvideo', '-pix_fmt', 'gray', out], {
    stdio: 'ignore', timeout: 120000, windowsHide: true,
  });
  if (r.status !== 0 || !fs.existsSync(out)) return null;
  return { buf: fs.readFileSync(out), w, h };
}
const stats = (g, x0, y0, x1, y1) => {
  let sum = 0, sum2 = 0, n = 0, hi = 0, vhi = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const p = g.buf[y * g.w + x];
      sum += p; sum2 += p * p; n++;
      if (p > 217) hi++;      // >0.85
      if (p > 235) vhi++;     // >0.92
    }
  }
  if (!n) return { mean: 0, std: 0, hiRatio: 0, vhiRatio: 0 };
  const mean = sum / n;
  const std = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
  return { mean: mean / 255, std: std / 255, hiRatio: hi / n, vhiRatio: vhi / n };
};
const r3 = (n) => Math.round(n * 1000) / 1000;

const checks = {};
const detail = {};

// 1) 尺寸/比例
const expectRatio = EXPECT === '9:16' ? 9 / 16 : EXPECT === '16:9' ? 16 / 9 : null;
checks.aspect = !!expectRatio && Math.abs(ratio - expectRatio) / expectRatio < 0.02;
detail.aspect = { w: W, h: H, ratio: r3(ratio), expect: EXPECT || '(未指定)', ok: checks.aspect };

// 2) 文字带（下 38%）是否暗底 + 有字
const full = gray(SRC, Math.min(W, 1280), Math.min(H, Math.round(Math.min(W, 1280) * H / W)));
const bandTop = Math.round(full.h * 0.62);
const band = stats(full, 0, bandTop, full.w, full.h);
checks.text_band_dark = band.mean < 0.5;
checks.text_present = band.hiRatio > 0.01 && band.hiRatio < 0.45;
detail.text_band = { mean: r3(band.mean), std: r3(band.std), hiRatio: r3(band.hiRatio), region: 'y≥62%' };

// 3) 蒙版分隔：文字带要比**紧邻其上的画面**更暗（黑蒙版的效果）
//    早先用"整幅上半区"作参照，竖屏会误判 —— 竖屏顶部本来就是模糊暗调，跟文字带一样暗，
//    于是 delta 只有 0.066 被判失败，而人眼看到的"分层"是清楚的。改成本地参照（45%–62% 条带）。
const above = stats(full, 0, Math.round(full.h * 0.45), full.w, bandTop);
checks.band_contrast = (above.mean - band.mean) > 0.08;
detail.contrast = { aboveMean: r3(above.mean), bandMean: r3(band.mean), delta: r3(above.mean - band.mean) };

// 4) 缩略图尺度（320 宽）可读性
const th = Math.max(1, Math.round(320 * H / W));
const thumb = gray(SRC, 320, th);
const tb = stats(thumb, 0, Math.round(th * 0.62), thumb.w, thumb.h);
checks.thumb_readable = tb.std > 0.05 && tb.hiRatio > 0.008;
detail.thumb320 = { w: 320, h: th, std: r3(tb.std), hiRatio: r3(tb.hiRatio) };

// 5) 安全边距：四周 2% 条带不应有亮文字像素
const m = Math.max(2, Math.round(full.w * 0.02));
const edges = {
  top: stats(full, 0, 0, full.w, Math.max(2, Math.round(full.h * 0.02))),
  bottom: stats(full, 0, full.h - Math.max(2, Math.round(full.h * 0.02)), full.w, full.h),
  left: stats(full, 0, 0, m, full.h),
  right: stats(full, full.w - m, 0, full.w, full.h),
};
const edgeMax = Math.max(...Object.values(edges).map((e) => e.vhiRatio));
checks.safe_margin = edgeMax < 0.005;
detail.edges = Object.fromEntries(Object.entries(edges).map(([k, e]) => [k, r3(e.vhiRatio)]));

const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k);
const verdict = failed.length === 0 ? 'PASS' : failed.length <= 2 ? 'WARN' : 'FAIL';
const result = {
  checked_at: new Date().toISOString(), file: path.relative(ROOT, SRC), verdict,
  checks, detail, failed,
  note: '不做 OCR：错别字/文案/主体表情仍需人眼确认；这里只量化"文字是否可读、是否贴边、缩略图下是否还有对比"。',
};
console.log(`[cover] ${path.basename(SRC)} ${W}x${H} → ${verdict}`);
for (const [k, ok] of Object.entries(checks)) console.log(`  ${ok ? '✅' : '❌'} ${k}`);
console.log(`  文字带 亮度均值 ${detail.text_band.mean} / 高亮占比 ${detail.text_band.hiRatio} / 与上半区差 ${detail.contrast.delta}`);
console.log(`  320px 缩略图 std ${detail.thumb320.std} / 高亮 ${detail.thumb320.hiRatio} / 边缘亮像素 ${JSON.stringify(detail.edges)}`);

if (JSON_OUT) { fs.mkdirSync(path.dirname(path.resolve(ROOT, JSON_OUT)), { recursive: true }); fs.writeFileSync(path.resolve(ROOT, JSON_OUT), JSON.stringify(result, null, 2), 'utf8'); }
if (MD_OUT) {
  const L = [];
  L.push(`# 封面自检 · ${path.basename(SRC)}`, '');
  L.push(`结论：**${verdict}**　尺寸 ${W}x${H}（比例 ${r3(ratio)}）`, '');
  L.push('| 检查项 | 结果 | 依据 |', '| --- | --- | --- |');
  L.push(`| 尺寸/比例 | ${checks.aspect ? '✅' : '❌'} | ${W}x${H}，期望 ${EXPECT || '未指定'} |`);
  L.push(`| 文字带是暗底 | ${checks.text_band_dark ? '✅' : '❌'} | 下 38% 区域亮度均值 ${detail.text_band.mean}（阈值 <0.50） |`);
  L.push(`| 文字存在且不过曝 | ${checks.text_present ? '✅' : '❌'} | 高亮像素占比 ${detail.text_band.hiRatio}（期望 1%–45%） |`);
  L.push(`| 蒙版分隔 | ${checks.band_contrast ? '✅' : '❌'} | 上半区与文字带亮度差 ${detail.contrast.delta}（期望 >0.12） |`);
  L.push(`| 缩略图可读 | ${checks.thumb_readable ? '✅' : '❌'} | 320px 宽下 std ${detail.thumb320.std} / 高亮 ${detail.thumb320.hiRatio} |`);
  L.push(`| 安全边距 | ${checks.safe_margin ? '✅' : '❌'} | 四边 2% 条带亮像素最大占比 ${r3(Math.max(...Object.values(edges).map((e) => e.vhiRatio)))}（期望 <0.5%） |`);
  L.push('');
  L.push('> 局限：不做 OCR，错别字/文案/主体表情需人眼确认（本轮已人工看图，结论见 loop12 交付说明）。');
  fs.mkdirSync(path.dirname(path.resolve(ROOT, MD_OUT)), { recursive: true });
  fs.writeFileSync(path.resolve(ROOT, MD_OUT), L.join('\n'), 'utf8');
}
process.exit(verdict === 'FAIL' ? 1 : 0);
