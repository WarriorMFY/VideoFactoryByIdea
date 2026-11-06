#!/usr/bin/env node
/**
 * exec_extract.mjs —— 处决单位全量抽取器（loop38，技能 exec-extract 的执行体）
 *
 * 目的：给定一部「处决合集/实机录制」源片，自动找出**所有**处决单位，
 *       按《处决单位边界规则》给出边界提议，并批量导出可入库素材（片 + 缩略图 + 清单）。
 *
 * 依据（Prototype/loop37_exec_bound/REPORT.md）：
 *   处决五层：触发（R3/E 提示）→ 前摇（抓取/踉跄）→ 命中（顿帧/慢放/血雾）→ 收招 → 余韵（尸体落定/染色/站定）
 *   开始帧 = min(抓取发生, 提示出现)；结束帧 = min(角色待机, 尸体落定, 镜头切走) + 0~0.4s
 *   单位长度参考：快杀 2.5-3s / 标准 4.5-5.5s / 仪式级 8-11s
 *
 * 用法：
 *   node exec_extract.mjs scan    <src.mp4> [outDir] [--seg 40]
 *       全片逐帧帧差 + 场景切点；输出 scan.json（动势簇/静默段/切点）与候选单位提议，打印表格
 *
 *   node exec_extract.mjs sheets  <src.mp4> [outDir] [--step 1] [--grid 5x4]
 *       按秒步进生成带时间码的缩略图网格（人工枚举用），输出 sheets/sheet_NN.png
 *
 *   node exec_extract.mjs strip   <src.mp4> <t0> <t1> <n> [outPng] [--w 320]
 *       在 [t0,t1] 均匀取 n 帧拼条带（边界目验用），帧上带绝对时间码
 *
 *   node exec_extract.mjs export  <catalog.json> [outDir] [1920x1080]
 *       按 catalog 里的精确边界剪出每单位 1280x720 片 + 中位缩略图 + ASS 时间码 HUD
 *       + catalog.csv + index.html（含视频的核验/入库页）
 *
 * catalog.json 结构：
 * {
 *   "src": "../../Workspace/tmp/xxx.mp4",
 *   "pack": "影之刃零",
 *   "units": [
 *     { "id": 1, "t": 83.5, "dur": 4.0, "cropX": 460, "kind": "标准",
 *       "scene": "夜雨·白骨林", "move": "一刀劈杀白发巨剑敌",
 *       "beat": "起=雨夜对峙/86.0 书法「斩」/止=收招站定",
 *       "note": "……" }
 *   ]
 * }
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '../..');
const FF = path.join(ROOT, 'Workspace/deps/ffmpeg/ffmpeg.exe');
const FP = path.join(ROOT, 'Workspace/deps/ffmpeg/ffprobe.exe');
const j = s => (String(s).includes(' ') ? JSON.stringify(s) : String(s));
const run = (cmd, cwd) => execSync(cmd, { stdio: ['ignore', 'ignore', 'inherit'], cwd });
const num = (x, d = 3) => Number(Number(x).toFixed(d));
const dur = f => Number(execSync(`${j(FP)} -v quiet -show_entries format=duration -of csv=p=0 ${j(f)}`).toString().trim());
const px = (f, w = 1280) => Number(execSync(`${j(FP)} -v error -select_streams v -show_entries stream=height,width -of csv=p=0 ${j(f)}`).toString().split(',')[0]);

// ---------- 动势曲线（可窗口化） ----------
function motionCurve(src, outDir, tag = 'scan', t0 = null, t1 = null) {
  const meta = `mb_${tag}.txt`;
  const ss = t0 != null ? `-ss ${num(t0)} -t ${num(t1 - t0)} ` : '';
  run(`${j(FF)} -y ${ss}-i ${j(path.resolve(src))} -vf "scale=320:180,tblend=all_mode=difference,signalstats,metadata=print:file=${meta}" -an -f null -`, outDir);
  const lines = fs.readFileSync(path.join(outDir, meta), 'utf8').split('\n');
  const ts = [], vs = [];
  for (const l of lines) {
    const m = l.match(/pts_time:([0-9.]+)/); if (m) ts.push(Number(m[1]));
    const d = l.match(/YDIF=([0-9.]+)/); if (d) vs.push(Number(d[1]));
  }
  fs.unlinkSync(path.join(outDir, meta));
  const n = Math.min(ts.length, vs.length);
  const off = t0 != null ? t0 : 0;
  return Array.from({ length: n }, (_, i) => ({ t: off + ts[i], v: vs[i] }));
}

// ---------- 场景切点 ----------
function sceneCuts(src) {
  const meta = 'sc.txt';
  const tmp = path.join(ROOT, 'Workspace/tmp');
  run(`${j(FF)} -y -i ${j(path.resolve(src))} -vf "select='gt(scene,0.32)',metadata=print:file=${meta}" -an -f null -`, tmp);
  const out = [];
  for (const l of fs.readFileSync(path.join(tmp, meta), 'utf8').split('\n')) {
    const m = l.match(/pts_time:([0-9.]+)/);
    if (m) out.push(Number(m[1]));
  }
  fs.unlinkSync(path.join(tmp, meta));
  return out;
}

const quantile = (arr, p) => {
  if (!arr.length) return 0;
  const b = [...arr].sort((a, b) => a - b);
  return b[Math.min(b.length - 1, Math.floor(b.length * p))];
};

function runs(curve, pred, minFrames, maxGap = 0) {
  const out = []; let start = -1, gap = 0;
  for (let i = 0; i < curve.length; i++) {
    if (pred(curve[i])) { if (start < 0) start = i; gap = 0; }
    else if (start >= 0) {
      gap++;
      if (gap > maxGap) { const end = i - gap; if (end - start + 1 >= minFrames) out.push({ i0: start, i1: end }); start = -1; gap = 0; }
    }
  }
  if (start >= 0) { const end = curve.length - 1; if (end - start + 1 >= minFrames) out.push({ i0: start, i1: end }); }
  return out;
}

// ---------- 扫描：动势簇 → 单位提议 ----------
function scan(cfg) {
  const src = path.resolve(cfg.src), outDir = path.resolve(cfg.outDir);
  fs.mkdirSync(outDir, { recursive: true });
  const curve = motionCurve(src, outDir);
  const vs = curve.map(c => c.v);
  const p25 = quantile(vs, 0.25), p50 = quantile(vs, 0.5), p85 = quantile(vs, 0.85);
  const hi = Math.max(p50 * 1.45, p50 + 3.0);
  const lo = Math.max(p25 * 0.9, 1.5);
  const fps = curve.length / dur(src);
  const burst = runs(curve, c => c.v > hi, Math.round(fps * 0.12), Math.round(fps * 0.2));
  const idle = runs(curve, c => c.v <= lo, Math.round(fps * 0.25), 0);
  const cuts = sceneCuts(src);

  // 合并间隙 ≤0.55s 的动势簇 = 一个单位（多段打击/命中停顿）
  const units = [];
  for (const b of burst) {
    const cur = units[units.length - 1];
    if (cur && curve[b.i0].t - curve[cur.i1].t <= 0.55) cur.i1 = b.i1;
    else units.push({ i0: b.i0, i1: b.i1 });
  }

  const table = [];
  const seen = [];
  for (const [k, u] of units.entries()) {
    const s = curve[u.i0].t, e = curve[u.i1].t;
    // 只做候选窗：动势簇前后各留呼吸（前摇/收招由人工目验收敛，不靠静默段推断）
    const start = Math.max(0, s - 0.5);
    const end = Math.min(dur(src), e + 0.9);
    if (seen.some(x => Math.abs(x.start - start) < 0.45 && Math.abs(x.end - end) < 0.45)) continue;
    seen.push({ start, end });
    const energy = curve.slice(u.i0, u.i1 + 1).reduce((a, c) => a + c.v, 0);
    const innerCuts = cuts.filter(c => c > start + 0.15 && c < end - 0.15);
    table.push({
      id: table.length + 1,
      start: num(start), end: num(end), dur: num(end - start),
      motion: [num(s), num(e)],
      energy: Math.round(energy),
      innerCuts: innerCuts.map(c => num(c, 2))
    });
  }
  table.forEach((u, i) => { u.id = i + 1; });
  const kept = table.filter(u => u.dur >= 0.8);

  fs.writeFileSync(path.join(outDir, 'scan.json'), JSON.stringify({ src, fps: num(fps, 1), p25: num(p25), p50: num(p50), p85: num(p85), hi: num(hi), lo: num(lo), cuts: cuts.map(c => num(c, 2)), units: kept }, null, 2), 'utf8');
  console.log(`#  提议区间          时长   动势簇            内部切点        能量`);
  for (const u of kept) {
    console.log(`${String(u.id).padStart(2)}  [${u.start.toFixed(2)}, ${u.end.toFixed(2)}]  ${u.dur.toFixed(2)}s  [${u.motion[0].toFixed(1)},${u.motion[1].toFixed(1)}]  ${u.innerCuts.length ? u.innerCuts.join('/') : '-'}  ${u.energy}`);
  }
  console.log(`\n候选 ${kept.length} 个 → ${path.join(outDir, 'scan.json')}`);
  console.log('提醒：动势簇只做候选，处决与「普通连段」无法由运动量区分，必须网格目验 + 边界条带复核。');
}

// ---------- 时间码网格 ----------
function sheets(cfg) {
  const src = path.resolve(cfg.src), outDir = path.join(path.resolve(cfg.outDir), 'sheets');
  fs.mkdirSync(outDir, { recursive: true });
  const step = cfg.step || 1, [cols, rows] = (cfg.grid || '5x4').split('x').map(Number);
  run(`${j(FF)} -y -i ${j(src)} -vf "fps=1/${step},scale=320:180,drawtext=fontfile='C\\:/Windows/Fonts/arial.ttf':text='%{eif\\:t\\:d}s':x=5:y=5:fontsize=17:fontcolor=yellow:box=1:boxcolor=black@0.65,tile=${cols}x${rows}:margin=2:padding=2" -vsync 0 sheet_%02d.png`, outDir);
  const n = fs.readdirSync(outDir).filter(f => f.startsWith('sheet_')).length;
  console.log(`${n} 张网格（每张 ${cols * rows} 格，步进 ${step}s）→ ${outDir}`);
}

// ---------- 取证条带 ----------
function strip(src, t0, t1, n, outPng, w = 320) {
  const ts = Array.from({ length: n }, (_, i) => num(t0 + (t1 - t0) * (i / (n - 1))));
  const tmp = path.join(path.dirname(path.resolve(outPng)), '_strip_tmp');
  fs.mkdirSync(tmp, { recursive: true });
  const files = ts.map((t, i) => {
    const f = path.join(tmp, `${i}.png`);
    run(`${j(FF)} -y -ss ${num(t)} -i ${j(path.resolve(src))} -vf "scale=${w}:-1,drawtext=fontfile='C\\:/Windows/Fonts/arial.ttf':text='${t.toFixed(2)}s':x=4:y=4:fontsize=16:fontcolor=yellow:box=1:boxcolor=black@0.7" -frames:v 1 ${j(f)}`);
    return f;
  });
  const cols = Math.min(6, n), rows = Math.ceil(n / cols);
  const layout = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) layout.push(`${c ? `w0*${c}` : 0}_${r ? `h0*${r}` : 0}`);
  const inputs = files.map(f => `-i ${j(f)}`).join(' ');
  run(`${j(FF)} -y ${inputs} -filter_complex "xstack=inputs=${n}:layout=${layout.slice(0, n).join('|')}" -frames:v 1 ${j(path.resolve(outPng))}`);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('→', outPng, `(${n} 帧 @ ${t0}–${t1}s)`);
}

// ---------- ASS HUD ----------
function assFile(unit, w, h, outAss) {
  const k = w / 1280;                                    // 相对 720p 基准的缩放系数
  const n = v => Math.round(v * k);
  const tf = s => {
    const m = Math.floor(s / 60), sec = (s % 60).toFixed(2).padStart(5, '0');
    return `0:${String(m).padStart(2, '0')}:${sec}`;
  };
  const head = `[Script Info]
ScriptType: v4.00+
PlayResX: ${w}
PlayResY: ${h}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: H,Microsoft YaHei,${n(26)},&H00FFFFFF,&H000000FF,&H00101010,&H80000000,0,0,0,0,100,100,0,0,1,${n(2)},0,7,${n(26)},${n(26)},${n(20)},1
Style: S,Microsoft YaHei,${n(20)},&H00C8C8C8,&H000000FF,&H00101010,&H80000000,0,0,0,0,100,100,0,0,1,${n(2)},0,7,${n(26)},${n(26)},${n(20)},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const ev = [];
  const d = unit.dur;
  ev.push(`Dialogue: 0,0:00:00.00,${tf(d)},H,,0,0,0,,{\\an7\\pos(${n(26)},${n(20)})\\bord${n(2)}}#${String(unit.id).padStart(2, '0')} ${unit.scene || ''}`);
  ev.push(`Dialogue: 0,0:00:00.00,${tf(d)},S,,0,0,0,,{\\an7\\pos(${n(26)},${n(54)})}${unit.move || ''}`);
  ev.push(`Dialogue: 0,0:00:00.00,${tf(d)},S,,0,0,0,,{\\an9\\pos(${w - n(26)},${n(20)})}${unit.t.toFixed(2)}s + ${d.toFixed(2)}s · 源 ${unit.srcLabel || ''}`);
  if (unit.beat) ev.push(`Dialogue: 0,0:00:00.00,${tf(d)},S,,0,0,0,,{\\an1\\pos(${w / 2},${h - n(26)})}${unit.beat}`);
  fs.writeFileSync(outAss, head + ev.join('\n') + '\n', 'utf8');
}

// ---------- 批量导出 ----------
function exportUnits(cfgPath, outArg, sizeArg) {
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const base = path.dirname(path.resolve(cfgPath));
  const src = path.resolve(base, cfg.src);
  const outDir = path.join(base, outArg || cfg.outDir || 'clips');
  fs.mkdirSync(outDir, { recursive: true });
  const [W, H] = sizeArg ? sizeArg.split('x').map(Number) : (cfg.size || [1280, 720]);
  const vdim = execSync(`${j(FP)} -v quiet -select_streams v -show_entries stream=width,height -of csv=p=0 ${j(src)}`).toString().trim().split(',');
  const SW = Number(vdim[0]), SH = Number(vdim[1]);
  const rows = [];

  for (const u of cfg.units) {
    const id = String(u.id).padStart(2, '0');
    const ass = path.join(outDir, `u${id}.ass`);
    assFile(u, W, H, ass);
    const clip = path.join(outDir, `u${id}.mp4`);
    // 默认整幅等比缩放（保留原始构图，人物多在中下部，顶部对齐裁窗会切脚）；
    // 仅当 unit.crop 为 true 时才按 cropX/cropY 裁窗（cropY 支持 'bottom'|0-1 比例|像素）
    let geom;
    if (u.crop) {
      const cw = Math.round(SW * (W / H) * (H / SH) * 1);  // 按目标宽高比裁窗
      const cx = u.cropX ?? Math.max(0, Math.round((SW - cw) / 2));
      const ch = Math.min(SH, Math.round(cw * H / W));
      const cy = u.cropY == null || u.cropY === 'bottom' ? SH - ch
        : (typeof u.cropY === 'number' && u.cropY <= 1 ? Math.round((SH - ch) * u.cropY) : Math.round(u.cropY));
      geom = `crop=${cw}:${ch}:${cx}:${cy},scale=${W}:${H}:flags=lanczos`;
    } else {
      geom = `scale=${W}:${H}:flags=lanczos`;
    }
    const vf = `${geom},setsar=1,ass=u${id}.ass`;
    run(`${j(FF)} -y -ss ${u.t.toFixed(3)} -t ${u.dur.toFixed(3)} -i ${j(src)} -vf ${j(vf)} -an -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p ${j(clip)}`, outDir);
    const thumb = path.join(outDir, `u${id}.jpg`);
    run(`${j(FF)} -y -ss ${(u.t + u.dur / 2).toFixed(3)} -i ${j(src)} -vf "${geom},scale=${Math.round(640 * W / 1280)}:${Math.round(360 * H / 720)},setsar=1" -frames:v 1 ${j(thumb)}`, outDir);
    const real = Number(execSync(`${j(FP)} -v quiet -show_entries format=duration -of csv=p=0 ${j(clip)}`).toString().trim());
    rows.push({ ...u, file: `u${id}.mp4`, durOut: num(real, 2) });
    console.log(`#${id} ${u.t}s +${u.dur}s → u${id}.mp4 (${real.toFixed(2)}s) ${u.scene || ''}`);
  }

  // CSV
  const cols = ['id', 'kind', 'scene', 'move', 't', 'dur', 'durOut', 'beat', 'note', 'file'];
  const csv = [cols.join(',')].concat(rows.map(r => cols.map(c => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(','))).join('\n');
  fs.writeFileSync(path.join(outDir, 'catalog.csv'), '\ufeff' + csv, 'utf8');

  // HTML 核对页
  const cards = rows.map(r => `
  <div class="card">
    <div class="hd"><span class="id">#${String(r.id).padStart(2, '0')}</span><span class="kind">${r.kind || ''}</span>
      <span class="ttl">${r.scene || ''} · ${r.move || ''}</span>
      <span class="tc">${r.t.toFixed(2)}s + ${r.dur.toFixed(2)}s</span></div>
    <video src="${r.file}" controls playsinline preload="metadata" poster="u${String(r.id).padStart(2, '0')}.jpg"></video>
    <div class="desc">${r.beat || ''}</div>
    ${r.note ? `<div class="note">${r.note}</div>` : ''}
  </div>`).join('\n');

  fs.writeFileSync(path.join(outDir, 'index.html'), `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${cfg.pack || '处决'} · 处决单位入库清单</title>
<style>
:root{--bg:#0d0f12;--card:#16191e;--line:#2a2f37;--txt:#e8eaee;--dim:#9aa3af;--gold:#ffc850}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--txt);font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;padding:26px 18px 60px}
.wrap{max-width:1100px;margin:0 auto}h1{font-size:21px;margin:0 0 6px}
.sub{color:var(--dim);font-size:13px;line-height:1.8;margin-bottom:20px}.sub b{color:var(--gold)}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:13px;margin-bottom:15px}
.hd{display:flex;gap:9px;align-items:center;flex-wrap:wrap;margin-bottom:9px}
.id{font-family:ui-monospace,Consolas,monospace;color:var(--gold);font-size:14px}
.kind{font-size:11.5px;border:1px solid #4a4030;color:#ffd98a;border-radius:12px;padding:2px 8px}
.ttl{font-size:14.5px;font-weight:600}.tc{font-family:ui-monospace,Consolas,monospace;font-size:11.5px;color:var(--dim);margin-left:auto}
video{width:100%;border-radius:8px;background:#000;display:block}
.desc{font-size:13px;line-height:1.8;color:#c8cdd5;margin-top:9px}.note{font-size:12.5px;color:#8fd6cf;margin-top:6px}
.foot{color:var(--dim);font-size:12.5px;line-height:1.8;border-top:1px solid var(--line);padding-top:14px;margin-top:10px}
</style></head><body><div class="wrap">
<h1>${cfg.pack || '处决'} · 处决单位入库清单</h1>
<div class="sub">共 <b>${rows.length}</b> 个完整处决单位，边界按「触发/抓取 → 命中 → 收招 → 余韵」规则逐帧核验。
片为 1280×720 / CRF18，左上角带编号与场景、右上角带源时间码，底部为该单位的节拍标注。</div>
${cards}
<div class="foot">清单同源文件：catalog.csv（可导入资料库/表格）· uNN.mp4 为入库母版片 · uNN.jpg 为缩略图</div>
</div></body></html>`, 'utf8');

  console.log(`\n导出 ${rows.length} 条 → ${outDir}\n清单: catalog.csv / index.html`);
}

// ---------- 边界收敛：粗估 → 局部动势包络 → 切点吸附 ----------
function refine(cfgPath) {
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const base = path.dirname(path.resolve(cfgPath));
  const src = path.resolve(base, cfg.src);
  const outDir = path.join(base, cfg.outDir || 'work');
  fs.mkdirSync(outDir, { recursive: true });
  const total = dur(src);
  const cuts = sceneCuts(src);
  const snapCut = (t, win = 0.22) => {
    const c = cuts.find(c => Math.abs(c - t) <= win);
    return c ? num(c) : null;
  };
  for (const u of cfg.units) {
    const t0 = Math.max(0, u.t - 1.2), t1 = Math.min(total, u.t + u.dur + 1.6);
    const curve = motionCurve(src, outDir, `r${String(u.id).padStart(2, '0')}`, t0, t1);
    const win = curve.filter(c => c.t >= t0 && c.t <= t1);
    const vs = win.map(c => c.v);
    const hi = Math.max(quantile(vs, 0.5) * 1.4, quantile(vs, 0.5) + 2.6);
    const bursts = runs(win, c => c.v > hi, 4, Math.round(30 * 1.4));
    // 取与粗估窗口重叠最多的簇
    let best = null, bestOv = -1;
    for (const b of bursts) {
      const bs = win[b.i0].t, be = win[b.i1].t;
      const ov = Math.min(be, u.t + u.dur) - Math.max(bs, u.t);
      if (ov > bestOv) { bestOv = ov; best = { bs, be }; }
    }
    if (!best) { u._refine = 'no-burst'; continue; }
    let start = num(Math.max(0, best.bs - 0.18));
    let end = num(Math.min(total, best.be + 0.55));
    const cs = snapCut(start), ce = snapCut(end);
    if (cs !== null && cs >= start - 0.25) start = cs;
    if (ce !== null && ce <= end + 0.25) end = ce;
    u.t = start;
    u.dur = num(end - start);
    u._refine = { motion: [num(best.bs), num(best.be)], startSnap: cs, endSnap: ce, cutsNear: cuts.filter(c => c > start - 0.5 && c < end + 0.5).map(c => num(c, 2)) };
    console.log(`#${String(u.id).padStart(2, '0')} → [${u.t.toFixed(2)}, ${(u.t + u.dur).toFixed(2)}] ${u.dur.toFixed(2)}s  snaps=${cs}/${ce}`);
  }
  const out = path.join(base, 'catalog_refined.json');
  fs.writeFileSync(out, JSON.stringify(cfg, null, 2), 'utf8');
  console.log('→', out);
}

// ---------- CLI ----------
const [mode, ...rest] = process.argv.slice(2);
const arg = (k, d) => { const i = rest.indexOf(`--${k}`); return i >= 0 ? rest[i + 1] : d; };
const positional = rest.filter((x, i) => !x.startsWith('--') && !(i > 0 && rest[i - 1].startsWith('--')));
const outDir = positional[1] || 'Prototype/loop38_exec_extract';

if (!mode) { console.error('用法: scan|sheets|strip|export（见文件头注释）'); process.exit(1); }

if (mode === 'scan') {
  scan({ src: positional[0], outDir, seg: Number(arg('seg', 40)) });
} else if (mode === 'sheets') {
  sheets({ src: positional[0], outDir, step: Number(arg('step', 1)), grid: arg('grid', '5x4') });
} else if (mode === 'strip') {
  const [src, t0, t1, n] = positional;
  strip(src, Number(t0), Number(t1), Number(n), arg('out', path.join(outDir, `strip_${t0}_${t1}.png`)), Number(arg('w', 320)));
} else if (mode === 'refine') {
  refine(positional[0]);
} else if (mode === 'export') {
  exportUnits(positional[0], positional[1], positional[2]);
} else {
  console.error('未知模式', mode);
  process.exit(1);
}
