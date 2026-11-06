#!/usr/bin/env node
// vs_curate.mjs —— 对比剪辑流「候选池」工具（loop36 提炼，三阶段流程之阶段1）
// 批量渲染候选对位组小片（每组一个左右分屏预览）+ 生成核验表格 table.html / table.csv
// 用法: node Tool/ops/vs_curate.mjs <config.json> [outDir]
// 流程：用户在表格页逐组核验 → 反馈（保留/换段/调 cropX）→ 用 vs_split.mjs 合成正式版
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const FF = process.env.FFMPEG || join(ROOT, 'Workspace/deps/ffmpeg/ffmpeg.exe');
const FP = process.env.FFPROBE || FF.replace(/ffmpeg(\.exe)?$/i, 'ffprobe$1');
const j = s => (s.includes(' ') ? JSON.stringify(s) : s);
const run = (cmd, cwd) => execSync(cmd, { stdio: ['ignore', 'ignore', 'inherit'], cwd });

const cfgPath = process.argv[2];
if (!cfgPath) { console.error('用法: node vs_curate.mjs <config.json> [outDir]'); process.exit(1); }
const CFG = JSON.parse(readFileSync(resolve(cfgPath), 'utf8'));
const DIR = dirname(resolve(cfgPath));
const OUTDIR = resolve(process.argv[3] || join(DIR, CFG.outDir || 'out'));
mkdirSync(OUTDIR, { recursive: true });

const DUR = CFG.dur ?? 3.2;
const W = 1920, H = 1080, HALF_W = Math.round(W / 2), HALF_H = H;
const PW = CFG.previewW ?? 960, PH = Math.round(PW / (W / H));   // 预览小片尺寸
const SRC_W = Math.round(PW / 2), SRC_H = PH;

const SIDES = CFG.sides || {};
const sides = { a: { ...(SIDES.a || {}), key: 'a' }, b: { ...(SIDES.b || {}), key: 'b' } };
for (const k of ['a', 'b']) {
  const f = resolve(DIR, sides[k].src);
  if (!existsSync(f)) { console.error(`sides.${k}.src 不存在: ${f}`); process.exit(1); }
  sides[k].src = f;
  const o = execSync(`${j(FP)} -v quiet -show_entries stream=width,height -select_streams v:0 -of csv=p=0 ${j(f)}`).toString().trim();
  const [w, h] = o.split(',').map(Number);
  sides[k].dim = { w, h };
}

// crop 规划：[x,y,w,h] 优先；cropX 指定竖裁左边界；否则居中最大内接
const planCrop = (side, spec) => {
  const { w: sw, h: sh } = side.dim;
  const aspect = HALF_W / HALF_H;
  if (Array.isArray(spec.crop) && spec.crop.length === 4) return { x: spec.crop[0], y: spec.crop[1], cw: spec.crop[2], ch: spec.crop[3] };
  let ch = sh, cw = Math.round(sh * aspect / 2) * 2;
  if (cw > sw) { cw = Math.round(sw / 2) * 2; ch = Math.round(sw / aspect / 2) * 2; }
  const x = spec.cropX != null ? Math.max(0, Math.min(sw - cw, spec.cropX)) : Math.round((sw - cw) / 2);
  const y = Math.max(0, Math.min(sh - ch, spec.cropY ?? 0));
  return { x, y, cw, ch };
};
const bgr = c => { const s = String(c || 'FFFFFF').replace('#', '').toUpperCase(); return s.length === 6 ? s.slice(4, 6) + s.slice(2, 4) + s.slice(0, 2) : s; };
const C_A = bgr(sides.a.color || 'FFC850'), C_B = bgr(sides.b.color || 'FF6B5A'), C_G = bgr(CFG.gray || 'C8B890');
const ts = s => `0:${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(2).padStart(5, '0')}`;

// 渲染一组（960x540 左右分屏 + 组号/语义小标注）
// 组时长 c.dur（缺省 DUR）；侧变速 c.x.fit（>1 加速）：trim 侧原始时长后 setpts=PTS/fit
const renderGroup = (c, i) => {
  const id = String(i + 1).padStart(2, '0');
  const gdur = c.dur ?? DUR;
  const tag = c.tag || { a: '', b: '' };
  const lines = [
    `Dialogue: 0,0:00:00.05,0:00:${gdur.toFixed(2)},N,,0,0,0,,{\\an7\\pos(20,34)\\fs26\\1c&H${C_A}&\\bord1.2\\3c&H000000&\\3a&H50&}#${id} ${tag.a || ''}`,
    `Dialogue: 0,0:00:00.05,0:00:${gdur.toFixed(2)},N,,0,0,0,,{\\an7\\pos(500,34)\\fs26\\1c&H${C_B}&\\bord1.2\\3c&H000000&\\3a&H50&}#${id} ${tag.b || ''}`,
    `Dialogue: 0,0:00:00.05,0:00:${gdur.toFixed(2)},N,,0,0,0,,{\\an7\\pos(20,66)\\fs18\\1c&H${C_G}&\\bord1\\3c&H000000&\\3a&H50&}${sides.a.pack || ''}`,
    `Dialogue: 0,0:00:00.05,0:00:${gdur.toFixed(2)},N,,0,0,0,,{\\an7\\pos(500,66)\\fs18\\1c&H${C_G}&\\bord1\\3c&H000000&\\3a&H50&}${sides.b.pack || ''}`,
  ];
  writeFileSync(join(OUTDIR, `grp_${id}.ass`), `[Script Info]
ScriptType: v4.00+
PlayResX: ${PW}
PlayResY: ${PH}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: N,${CFG.font || 'Microsoft YaHei'},26,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,1.2,0,7,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${lines.join('\n')}
`, 'utf8');
  const ca = planCrop(sides.a, c.a || {}), cb = planCrop(sides.b, c.b || {});
  const chain = (idx, side, cpl, spec) => {
    const sdur = spec?.dur ?? gdur;
    const fit = spec?.fit && Math.abs(spec.fit - 1) > 0.02 ? `,setpts=PTS/${spec.fit.toFixed(4)}` : '';
    return `[${idx}:v]trim=duration=${sdur},setpts=PTS-STARTPTS${fit},crop=${cpl.cw}:${cpl.ch}:${cpl.x}:${cpl.y},scale=${SRC_W}:${SRC_H}:flags=lanczos,setsar=1[${side}]`;
  };
  run([
    j(FF), '-y',
    '-ss', String(c.a?.t ?? 0), '-i', j(sides.a.src),
    '-ss', String(c.b?.t ?? 0), '-i', j(sides.b.src),
    '-filter_complex',
    `${chain(0, 'x', ca, c.a)};${chain(1, 'y', cb, c.b)};[x][y]hstack,drawbox=x=${SRC_W - 3}:y=0:w=3:h=${PH}:color=black:t=fill,ass=grp_${id}.ass,format=yuv420p[v]`,
    '-map', '[v]', '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', j(join(OUTDIR, `grp_${id}.mp4`)),
  ].join(' '), OUTDIR);
  return { id, ca, cb };
};

const rows = [];
(CFG.candidates || []).forEach((c, i) => {
  const { id } = renderGroup(c, i);
  const row = {
    组: `#${id}`,
    维度: c.dim || '',
    标签: `${(c.tag?.a || '')} / ${(c.tag?.b || '')}`,
    中式段: `${sides.a.pack}@${(c.a?.t ?? 0).toFixed(2)}s+${(c.a?.dur ?? c.dur ?? DUR).toFixed(1)}s${c.a?.fit ? `(${c.a.fit}x)` : ''}`,
    西式段: `${sides.b.pack}@${(c.b?.t ?? 0).toFixed(2)}s+${(c.b?.dur ?? c.dur ?? DUR).toFixed(1)}s${c.b?.fit ? `(${c.b.fit}x)` : ''}`,
    状态: c.status || '新',
    备注: c.note || '',
    风险: c.risk || '',
    视频: `grp_${id}.mp4`,
  };
  rows.push(row);
  console.log(`#${id} ${row.标签}  ok`);
});

// CSV
const esc = v => `"${String(v).replace(/"/g, '""')}"`;
writeFileSync(join(OUTDIR, 'table.csv'), '\ufeff' + Object.keys(rows[0] || { 组: 1 }).map(esc).join(',') + '\n' +
  rows.map(r => Object.values(r).map(esc).join(',')).join('\n'), 'utf8');

// HTML 表格（核验页）
const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>对比候选池核验 · ${sides.a.pack} × ${sides.b.pack}</title>
<style>
  :root { --amber:#ffc850; --red:#ff6b5a; --gray:#9a9a94; --bg:#0b0b0c; --panel:#141416; --line:#26262a; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:var(--bg); color:#e8e8e4; font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif; padding:32px 16px 64px; }
  header { max-width:1040px; margin:0 auto 20px; text-align:center; }
  h1 { font-size:clamp(19px,3.4vw,28px); font-weight:600; letter-spacing:.04em; }
  h1 .a { color:var(--amber); } h1 .b { color:var(--red); }
  .sub { margin-top:10px; font-size:12.5px; color:var(--gray); line-height:1.8; }
  .tbl { max-width:1040px; margin:0 auto; display:flex; flex-direction:column; gap:14px; }
  .grp { background:var(--panel); border:1px solid var(--line); border-radius:10px; overflow:hidden; }
  .head { display:grid; grid-template-columns:64px 1fr auto; gap:10px; align-items:baseline; padding:12px 16px; border-bottom:1px solid var(--line); }
  .no { font-size:20px; font-weight:700; color:#55555a; }
  .tags { font-size:15px; font-weight:600; letter-spacing:.04em; }
  .tags .a { color:var(--amber); } .tags .b { color:var(--red); } .tags .s { color:#4a4a4e; margin:0 .5em; }
  .meta { font-size:11.5px; color:var(--gray); text-align:right; line-height:1.7; }
  .meta .st { display:inline-block; padding:1px 8px; border-radius:9px; border:1px solid var(--line); }
  video { display:block; width:100%; aspect-ratio:16/9; background:#000; }
  .foot { padding:10px 16px 14px; font-size:12px; color:var(--gray); line-height:1.8; }
  .foot b { color:#cfcfc9; font-weight:500; }
  .risk { color:#e0a24a; }
  .howto { max-width:1040px; margin:0 auto 18px; background:var(--panel); border:1px dashed var(--line); border-radius:10px; padding:14px 18px; font-size:12.5px; color:var(--gray); line-height:2; }
  .howto b { color:#cfcfc9; }
</style>
</head>
<body>
<header>
  <h1><span class="a">${sides.a.pack}</span> × <span class="b">${sides.b.pack}</span> 对位候选池</h1>
  <p class="sub">共 ${rows.length} 组候选 · 完整处决单位版 · 请核验后反馈保留/换段/调整</p>
</header>
<div class="howto">
  <b>核验方式：</b>逐组点开小片（左右分屏，左=${sides.a.pack}，右=${sides.b.pack}），判断——①对位语义是否成立 ②两侧主体是否在画面内 ③有无 UI/水印抢戏。<br>
  <b>反馈格式：</b>「保留 #1#2#4，#5 中式换 55s，#9 右侧右移」即可，我用 vs_split 按最终清单合成正式版。
</div>
<div class="tbl">
${rows.map(r => `  <div class="grp" id="g${r.组.replace('#', '')}">
    <div class="head">
      <div class="no">${r.组}</div>
      <div class="tags"><span class="a">${esc(r.标签).slice(1, -1).split(' / ')[0]}</span><span class="s">×</span><span class="b">${esc(r.标签).slice(1, -1).split(' / ')[1]}</span><span style="color:var(--gray);font-size:12px;font-weight:400;margin-left:10px">${r.维度}</span></div>
      <div class="meta"><span class="st">${r.状态}</span><br>${r.中式段} · ${r.西式段}</div>
    </div>
    <video controls preload="metadata" src="${r.视频}"></video>
    <div class="foot">${r.备注 ? `<b>备注：</b>${r.备注}<br>` : ''}${r.风险 ? `<b class="risk">⚠ ${r.风险}</b>` : ''}</div>
  </div>`).join('\n')}
</div>
</body>
</html>`;
writeFileSync(join(OUTDIR, 'table.html'), html, 'utf8');
console.log(`候选池完成: ${rows.length} 组 → ${OUTDIR}`);
console.log('表格: table.html / table.csv');
