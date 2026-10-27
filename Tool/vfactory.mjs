#!/usr/bin/env node
/**
 * vfactory.mjs — 视频剪辑工厂 MVP 流水线（Auto-Edit Factory v0.1）
 *
 * 输入：一段原视频（mp4/mov/mkv…）
 * 过程：探测 -> 信号分析(黑场/冻帧/静音/场景切点) -> 剪辑决策 -> 渲染(重编码+转场+统一音频响度+可选字幕/标题)
 * 输出：交付包（final.mp4 + edits.json(EDL) + signals.json + report.md + contact_sheet.jpg + runlog.jsonl）
 *
 * 用法：
 *   node Tool/vfactory.mjs <source> --out <dir> [--fps 30] [--width 1280] [--transition fade|none]
 *                                 [--title "标题"] [--srt sub.srt] [--fill] [--max-cut 20]
 *                                 [--protect transcript.json] [--protect-pad 0.25] [--black-pix 0.04] [--black-pic 0.98] [--black-dur 0.30]
 * 设计要点：
 *   - 纯 ffmpeg + Node 标准库，无第三方运行时依赖（本机 pip/curl 出网受限，node 可出网）。
 *   - 每一步的 ffmpeg 命令都写入 runlog.jsonl，保证可复现、可审计。
 *   - 决策规则集中在 DECISION_SPEC（可调参），见 report.md 的"规则"一节。
 */
import fs from 'node:fs';
import path from 'node:path';
import { ffmpeg as ffRaw, ffprobeJson, durationOf, hasFilter, ROOT } from './lib/ff.mjs';

// ---------------- 参数 ----------------
function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t.startsWith('--')) {
      const k = t.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) a[k] = true;
      else { a[k] = next; i++; }
    } else a._.push(t);
  }
  return a;
}
const args = parseArgs(process.argv.slice(2));
const SRC = args._[0];
if (!SRC) { console.error('用法: node Tool/vfactory.mjs <source> --out <dir> [...]'); process.exit(2); }
const OUT = path.resolve(args.out || path.join(ROOT, 'History', 'runs', 'run_' + Date.now()));
const OPT = {
  fps: Number(args.fps || 30),
  width: Number(args.width || 1280),
  height: Number(args.height || 720),
  transition: args.transition === 'none' ? 'none' : 'fade',
  xfadeDur: Number(args['xfade-dur'] || 0.4),
  title: args.title || '',
  srt: args.srt ? path.resolve(args.srt) : '',
  fill: !!args.fill,                 // 是否用黑边填充到固定画幅（默认按比例缩放+pad）
  preset: args.preset || 'balanced',
  maxCutRatio: Number(args['max-cut'] || 60),   // 最多切除百分比，防病态素材被切空
  protect: args.protect ? path.resolve(args.protect) : '', // ASR transcript.json：有语音的区间禁止切除
  protectPad: Number(args['protect-pad'] || 0.25),         // 语音保护的两侧余量（秒）
  protectConf: Number(args['protect-conf'] || 0.5),       // 只有置信度 ≥ 该值的词才用于保护（防 ASR 噪声误保护）
};

// ---------------- 决策参数（剪辑规则） ----------------
// 注意：黑场判定在真实影视素材上很容易误伤"暗场景"（实测 Sintel trailer 的对白段被当黑场剪掉）。
// 因此把 pix_th 收紧（0.10→0.04）、pic_th 提高（默认 0.98 显式写明）、最短时长提高（0.12→0.30）。
const DECISION = {
  blackPixTh: Number(args['black-pix'] || 0.04),
  blackPicTh: Number(args['black-pic'] || 0.98),
  blackMinDur: Number(args['black-dur'] || 0.30),
  freezeNoise: 0.003, freezeMinDur: 0.35,
  silenceDb: -35, silenceMinDur: 0.5,
  sceneTh: 8,
  snapWindow: 0.6,     // 切点吸附到最近场景切点的最大距离
  minGap: 0.40,        // 相邻切除段间隔小于此值则合并
  minKeep: 1.20,       // 保留段短于此值则并入切除（避免碎镜头）
  headroom: 0.0,
};

// ---------------- 工具函数 ----------------
fs.mkdirSync(OUT, { recursive: true });
const LOG = path.join(OUT, 'runlog.jsonl');
const LOGDIR = path.join(OUT, '.work', 'logs');
fs.mkdirSync(LOGDIR, { recursive: true });
let stepNo = 0;
/** 调 ffmpeg：输出重定向到 .work/logs/*.log（沙箱禁止管道 stdio），并记录可审计的命令行 */
function ffrun(argv, label = 'step') {
  const logFile = path.join(LOGDIR, `${String(++stepNo).padStart(3, '0')}_${label.replace(/[^\w.-]/g, '_')}.log`);
  const r = ffRaw(argv, logFile);
  const rec = { ts: new Date().toISOString(), ms: r.ms, status: r.status, error: r.error, args: argv, log: path.relative(OUT, logFile) };
  if (r.status !== 0) rec.log_tail = String(r.text || '').split('\n').slice(-25).join('\n');
  fs.appendFileSync(LOG, JSON.stringify(rec) + '\n');
  return r;
}
const r3 = (x) => Math.round(x * 1000) / 1000;
const r2 = r3;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const durOf = (f) => durationOf(f, path.join(LOGDIR, 'probe_dur.log'));

// ---------------- 1. 探测 ----------------
function probe(file) {
  const json = ffprobeJson(['-show_format', '-show_streams', file], path.join(LOGDIR, 'probe.json.log'));
  const v = (json.streams || []).find((s) => s.codec_type === 'video');
  const a = (json.streams || []).find((s) => s.codec_type === 'audio');
  return {
    file, duration: Number(json.format?.duration || 0), format: json.format?.format_name,
    size: Number(json.format?.size || 0), bitrate: Number(json.format?.bit_rate || 0),
    video: v ? { codec: v.codec_name, width: v.width, height: v.height, fps: v.r_frame_rate, pix_fmt: v.pix_fmt, nb_frames: v.nb_frames } : null,
    audio: a ? { codec: a.codec_name, sample_rate: a.sample_rate, channels: a.channels, bitrate: a.bit_rate } : null,
  };
}

// ---------------- 2. 信号分析 ----------------
function analyze(file, hasAudio) {
  // 一次视频 pass 同时拿到 黑场/冻帧/场景切点 日志
  const vf = `blackdetect=d=${DECISION.blackMinDur}:pix_th=${DECISION.blackPixTh}:pic_th=${DECISION.blackPicTh},` +
             `freezedetect=n=${DECISION.freezeNoise}:d=${DECISION.freezeMinDur},` +
             `scdet=threshold=${DECISION.sceneTh}`;
  const vArgs = ['-hide_banner', '-nostats', '-i', file, '-an', '-vf', vf, '-f', 'null', 'NUL'];
  const vr = ffrun(vArgs, 'analyze_video');
  const vtxt = vr.text;

  const black = [];
  for (const m of vtxt.matchAll(/black_start:\s*([\d.]+)\s+black_end:\s*([\d.]+)\s+black_duration:\s*([\d.]+)/g)) {
    black.push({ start: Number(m[1]), end: Number(m[2]), dur: Number(m[3]) });
  }
  const freeze = [];
  {
    const starts = [...vtxt.matchAll(/freeze_start:\s*([\d.]+)/g)].map((m) => Number(m[1]));
    const ends = [...vtxt.matchAll(/freeze_end:\s*([\d.]+)/g)].map((m) => Number(m[1]));
    for (let i = 0; i < starts.length; i++) freeze.push({ start: starts[i], end: ends[i] ?? null });
  }
  const scenes = [...vtxt.matchAll(/lavfi\.scd\.time:\s*([\d.]+)/g)].map((m) => Number(m[1]));

  let silence = [];
  if (hasAudio) {
    const ar = ffrun(['-hide_banner', '-nostats', '-i', file, '-vn', '-af', `silencedetect=n=${DECISION.silenceDb}dB:d=${DECISION.silenceMinDur}`, '-f', 'null', 'NUL'], 'analyze_audio');
    const atxt = ar.text;
    const ss = [...atxt.matchAll(/silence_start:\s*(-?[\d.]+)/g)].map((m) => Number(m[1]));
    const se = [...atxt.matchAll(/silence_end:\s*([\d.]+)/g)].map((m) => Number(m[1]));
    for (let i = 0; i < ss.length; i++) silence.push({ start: Math.max(0, ss[i]), end: se[i] ?? null });
  }
  return { black, freeze, scenes, silence };
}

// ---------------- 3. 剪辑决策 ----------------
function intervals(lst, dur) {
  return lst.map((x) => ({ start: clamp(x.start, 0, dur), end: clamp(x.end ?? dur, 0, dur) })).filter((x) => x.end - x.start > 0.02);
}
function merge(list, gap) {
  const s = [...list].sort((a, b) => a.start - b.start);
  const out = [];
  for (const it of s) {
    const last = out[out.length - 1];
    if (last && it.start - last.end <= gap) last.end = Math.max(last.end, it.end);
    else out.push({ ...it });
  }
  return out;
}
function intersect(a, b) {
  const out = [];
  for (const x of a) for (const y of b) {
    const s = Math.max(x.start, y.start), e = Math.min(x.end, y.end);
    if (e - s > 0.02) out.push({ start: s, end: e });
  }
  return merge(out, 0.001);
}
function complement(cuts, dur) {
  const out = [];
  let cur = 0;
  for (const c of merge(cuts, 0.001)) {
    if (c.start - cur > 0.02) out.push({ start: cur, end: c.start });
    cur = Math.max(cur, c.end);
  }
  if (dur - cur > 0.02) out.push({ start: cur, end: dur });
  return out;
}
/** 区间差集：a 中扣掉 b 覆盖的部分（用于把"新切除段"并入已有切除集合而不重复计入） */
function subtract(a, b) {
  let cur = [{ ...a }];
  for (const x of b) {
    const next = [];
    for (const c of cur) {
      if (x.end <= c.start || x.start >= c.end) { next.push(c); continue; }
      if (x.start > c.start) next.push({ start: c.start, end: x.start });
      if (x.end < c.end) next.push({ start: x.end, end: c.end });
    }
    cur = next;
  }
  return cur.filter((c) => c.end - c.start > 0.05);
}
function overlap(a, b) { return Math.min(a.end, b.end) - Math.max(a.start, b.start) > 0.05; }

function decide(sig, dur) {
  const black = intervals(sig.black, dur);
  const freeze = intervals(sig.freeze, dur);
  const silence = intervals(sig.silence, dur);

  // 规则1：黑场 -> 切
  let cut = merge(black, DECISION.minGap);
  const reasons = [];
  for (const b of cut) reasons.push({ start: b.start, end: b.end, why: 'black（无画面）' });

  // 规则2：冻帧 ∧ 静音 -> 切；只满足其一时保留（口播冻帧/无声动作镜头不得误切）
  // 注意：候选段可能与已切除段部分重叠，必须先做差集，否则"只加不补"会漏切（曾在此处踩坑）
  const fs2 = intersect(freeze, silence);
  for (const f of fs2) {
    for (const piece of subtract(f, cut)) {
      cut.push(piece);
      reasons.push({ start: r3(piece.start), end: r3(piece.end), why: 'freeze∧silence（两路都无信息）' });
    }
  }
  cut = merge(cut, DECISION.minGap);

  // 规则3：切点吸附到最近场景切点（让切点落在镜头边界上）
  const sc = sig.scenes;
  cut = cut.map((c) => {
    let s = c.start, e = c.end;
    const near = (t) => sc.filter((x) => Math.abs(x - t) <= DECISION.snapWindow).sort((a, b) => Math.abs(a - t) - Math.abs(b - t))[0];
    const ns = near(s); if (ns !== undefined && Math.abs(ns - s) > 0.02) s = ns;
    const ne = near(e); if (ne !== undefined && Math.abs(ne - e) > 0.02) e = ne;
    return { start: Math.min(s, e), end: Math.max(s, e) };
  });
  cut = merge(cut, DECISION.minGap);

  // 规则4：保留段过短 -> 并入切除（避免碎片）
  let keep = complement(cut, dur);
  let changed = true;
  while (changed) {
    changed = false;
    const shortIdx = keep.findIndex((k) => k.end - k.start < DECISION.minKeep);
    if (shortIdx >= 0) {
      const s = keep[shortIdx];
      cut.push({ start: s.start, end: s.end });
      cut = merge(cut, DECISION.minGap);
      keep = complement(cut, dur);
      changed = true;
    }
  }

  // 规则5：语音保护 —— 有对白/讲话的区间一律不剪
  // 为什么需要：真实影视素材里"暗场景"会被黑场检测误判、静音处可能夹着台词（实测 Sintel trailer
  // 的对白段被黑场规则整段剪掉）。只要有 ASR 词级时间戳，就用它给语音区间上锁。
  let protectedSpans = [];
  if (OPT.protect && fs.existsSync(OPT.protect)) {
    const tr = JSON.parse(fs.readFileSync(OPT.protect, 'utf8'));
    const words = (tr.words || []).filter((w) => w && Number.isFinite(w.start) && Number.isFinite(w.end) && (w.conf ?? 1) >= OPT.protectConf);
    // 相邻词间隔 < 0.8s 视为同一句连续语音，合并成区间
    const spans = [];
    for (const w of words) {
      const last = spans[spans.length - 1];
      if (last && w.start - last.end < 0.8) last.end = Math.max(last.end, w.end);
      else spans.push({ start: w.start, end: w.end });
    }
    protectedSpans = spans
      .map((s) => ({ start: Math.max(0, s.start - OPT.protectPad), end: Math.min(dur, s.end + OPT.protectPad) }))
      .filter((s) => s.end - s.start > 0.1);
    const before = cut.reduce((a, c) => a + (c.end - c.start), 0);
    const kept0 = [];
    for (const c of cut) for (const piece of subtract(c, protectedSpans)) kept0.push(piece);
    cut = merge(kept0, DECISION.minGap);
    keep = complement(cut, dur);
    const after = cut.reduce((a, c) => a + (c.end - c.start), 0);
    reasons.push({ start: r3(0), end: r3(dur), why: `语音保护：${protectedSpans.length} 段语音区间已锁定，切除量 ${before.toFixed(2)}s → ${after.toFixed(2)}s（恢复 ${(before - after).toFixed(2)}s）` });
  }

  // 规则6：硬上限保护（病态素材不得切空）
  const keepDur = keep.reduce((a, k) => a + (k.end - k.start), 0);
  let guard = null;
  if (dur > 0 && (keepDur / dur) * 100 < 100 - OPT.maxCutRatio) {
    guard = `切除比例超过 ${OPT.maxCutRatio}%（保留 ${(keepDur / dur * 100).toFixed(1)}%），已放弃自动切除，改用整段保留`;
    cut = [];
    keep = [{ start: 0, end: dur }];
  }

  const kept = keep.map((k) => ({
    start: r3(k.start), end: r3(k.end), dur: r3(k.end - k.start),
    signals: {
      black: black.some((x) => overlap(x, k)),
      freeze: freeze.some((x) => overlap(x, k)),
      silence: silence.some((x) => overlap(x, k)),
      speech: protectedSpans.some((x) => overlap(x, k)),
    },
  }));
  return { kept, cut: merge(cut, 0.001).map((c) => ({ start: r3(c.start), end: r3(c.end) })), reasons, guard, protectedSpans, signals: { black, freeze, scenes: sc, silence } };
}

// ---------------- 4. 渲染 ----------------
/** 判断 SRT 是否双语（同一时间轴下每块两行文本）——双语字幕要缩小字号 */
function bilingualSrt(file) {
  try {
    const txt = fs.readFileSync(file, 'utf8');
    const blocks = txt.split(/\n\s*\n/).filter((b) => b.includes('-->'));
    if (!blocks.length) return false;
    const twoLine = blocks.filter((b) => {
      const lines = b.trim().split(/\r?\n/);
      return lines.length >= 4; // idx + 时间 + 2 行文本
    }).length;
    return twoLine / blocks.length > 0.5;
  } catch { return false; }
}
const VF_NORM = (w, h, fps) => `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,fps=${fps},setsar=1,format=yuv420p`;
const AF_NORM = 'aresample=48000:async=1,aformat=sample_fmts=fltp:channel_layouts=stereo';

function extractSegments(src, kept, work, hasAudio) {
  const files = [];
  kept.forEach((k, i) => {
    const f = path.join(work, `seg_${String(i).padStart(3, '0')}.mp4`);
    const a = ['-hide_banner', '-nostats', '-y', '-ss', String(k.start), '-to', String(k.end), '-i', src,
      '-vf', VF_NORM(OPT.width, OPT.height, OPT.fps)];
    if (hasAudio) a.push('-af', AF_NORM, '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2');
    else a.push('-an');
    a.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(OPT.fps), f);
    const r = ffrun(a, `seg_${i}`);
    if (r.status !== 0) throw new Error(`segment ${i} 提取失败: ${String(r.text).split('\n').slice(-5).join(' ')}`);
    const d = durOf(f);
    files.push({ file: f, dur: d, src: k });
  });
  return files;
}

function mergeSegments(segs, work, hasAudio) {
  const T = OPT.xfadeDur;
  if (segs.length === 1) return { file: segs[0].file, mode: 'single' };

  if (OPT.transition === 'fade') {
    // 计算 xfade/acrossfade 偏移
    let offsets = [];
    let acc = segs[0].dur;
    for (let i = 1; i < segs.length; i++) { offsets.push(r2(acc - T)); acc = acc + segs[i].dur - T; }
    const inputs = segs.flatMap((s) => ['-i', s.file]);
    const fc = [];
    let vPrev = '0:v', aPrev = hasAudio ? '0:a' : null;
    for (let i = 1; i < segs.length; i++) {
      const vOut = i === segs.length - 1 ? 'vout' : `v${i}`;
      fc.push(`[${vPrev}][${i}:v]xfade=transition=fade:duration=${T}:offset=${offsets[i - 1]}[${vOut}]`);
      vPrev = vOut;
      if (hasAudio) {
        const aOut = i === segs.length - 1 ? 'aout' : `a${i}`;
        fc.push(`[${aPrev}][${i}:a]acrossfade=d=${T}:c1=tri:c2=tri[${aOut}]`);
        aPrev = aOut;
      }
    }
    const out = path.join(work, 'merged.mp4');
    const a = ['-hide_banner', '-nostats', '-y', ...inputs, '-filter_complex', fc.join(';'),
      '-map', '[vout]'];
    if (hasAudio) a.push('-map', '[aout]', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2');
    a.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(OPT.fps), out);
    const r = ffrun(a, 'merge_xfade');
    if (r.status === 0) return { file: out, mode: `xfade(fade,${T}s)` };
    console.log('[warn] xfade 合并失败，回退到无转场拼接:', String(r.text).split('\n').slice(-3).join(' '));
  }

  // 回退：concat demuxer（无转场）
  const list = path.join(work, 'concat.txt');
  fs.writeFileSync(list, segs.map((s) => `file '${s.file.replace(/'/g, "'\\''")}'`).join('\n') + '\n');
  const out = path.join(work, 'merged.mp4');
  const a = ['-hide_banner', '-nostats', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', out];
  const r = ffrun(a, 'merge_concat');
  if (r.status !== 0) throw new Error('concat 合并失败: ' + String(r.text).split('\n').slice(-5).join(' '));
  return { file: out, mode: 'concat(no transition)' };
}

function polish(mergedFile, outFile, hasAudio, totalDur) {
  const fps = OPT.fps, W = OPT.width, H = OPT.height;
  const fadeOutStart = Math.max(0, totalDur - 0.8);
  const vf = [];
  if (OPT.title) {
    // 字体：用 fontconfig 家族名而非 fontfile。实测 fontfile=C\:/Windows/... 在 ffmpeg 6.1 下
    // 会静默回退到默认衬线字体、中文变方块；font=SimHei 才真正加载（见 History/probe/fontvari_*.jpg）。
    // SimHei 依赖 lib/ff.mjs 自建的 fonts.conf（指向 C:/Windows/Fonts）。
    const font = hasFilter('drawtext', path.join(LOGDIR, 'filters.log')) ? 'SimHei' : 'Arial';
    const esc = OPT.title.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'").replace(/,/g, '\\,').replace(/%/g, '\\%');
    const alpha = "if(lt(t,0.6),t/0.6,if(lt(t,3.4),1,max(0,(4.0-t)/0.6)))";
    vf.push(`drawtext=font=${font}:text='${esc}':fontsize=${Math.round(H * 0.072)}:fontcolor=white:shadowcolor=black@0.7:shadowx=2:shadowy=2:box=1:boxcolor=black@0.45:boxborderw=22:alpha='${alpha}':x=(w-text_w)/2:y=h*0.74:enable='between(t,0.2,4.0)'`);
  }
  if (OPT.srt && fs.existsSync(OPT.srt)) {
    const p = OPT.srt.replace(/\\/g, '/').replace(/:/g, '\\:');
    // FontName 必须指定含 CJK 的字体（否则中文变方块）；Fontsize 以 libass 默认 PlayResY=288 为基准。
    const fs2 = bilingualSrt(OPT.srt) ? 15 : 20;
    vf.push(`subtitles='${p}':force_style='FontName=SimHei,Fontsize=${fs2},PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,BorderStyle=1,Outline=1.2,Shadow=0.6,MarginV=18,Alignment=2'`);
  }
  vf.push(`fade=t=in:st=0:d=0.5`);
  vf.push(`fade=t=out:st=${r2(fadeOutStart)}:d=0.8`);
  const af = [];
  if (hasAudio) {
    af.push('loudnorm=I=-16:TP=-1.5:LRA=11');
    af.push('afade=t=in:st=0:d=0.5');
    af.push(`afade=t=out:st=${r2(fadeOutStart)}:d=0.8`);
  }
  const a = ['-hide_banner', '-nostats', '-y', '-i', mergedFile, '-vf', vf.join(','), '-r', String(fps)];
  if (hasAudio) a.push('-af', af.join(','), '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2');
  else a.push('-an');
  a.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
         '-movflags', '+faststart', '-t', String(r3(totalDur)), outFile);
  const r = ffrun(a, 'polish_final');
  if (r.status !== 0) throw new Error('final 渲染失败: ' + String(r.text).split('\n').slice(-8).join(' '));
}

function contactSheet(mergedFile, outImg, totalDur) {
  const n = 12;
  const step = Math.max(0.5, totalDur / n);
  const vf = `fps=1/${r3(step)},scale=320:180,tile=4x3`;
  const r = ffrun(['-hide_banner', '-nostats', '-y', '-i', mergedFile, '-vf', vf, '-frames:v', '1', '-q:v', '3', outImg]);
  return r.status === 0;
}

// ---------------- 5. 报告 ----------------
function fmt(t) { const m = Math.floor(t / 60), s = (t % 60).toFixed(1); return `${m}:${s.padStart(4, '0')}`; }

function report(d) {
  const { src, pr, dec, mergeInfo, totalOut, files, hasAudio } = d;
  const cutDur = src.duration - dec.kept.reduce((a, k) => a + k.dur, 0);
  const L = [];
  L.push(`# 剪辑工厂交付报告`, '');
  L.push(`| 项 | 值 |`, `| --- | --- |`);
  L.push(`| 源文件 | \`${path.basename(src.file)}\` (${(src.size / 1048576).toFixed(1)} MB, ${src.format}) |`);
  L.push(`| 源时长 | ${fmt(src.duration)} (${src.duration.toFixed(2)}s) |`);
  L.push(`| 源规格 | ${src.video ? `${src.video.width}x${src.video.height} ${src.video.codec} @ ${src.video.fps}` : 'n/a'}${src.audio ? ` / ${src.audio.codec} ${src.audio.sample_rate}Hz ${src.audio.channels}ch` : ' / 无音轨'} |`);
  L.push(`| 成片时长 | ${totalOut.toFixed(2)}s（切除 ${cutDur.toFixed(2)}s / ${(cutDur / src.duration * 100).toFixed(1)}%） |`);
  L.push(`| 成片规格 | ${OPT.width}x${OPT.height} ${OPT.fps}fps H.264 High + ${hasAudio ? 'AAC 192k(loudnorm -16 LUFS)' : '无音轨'} |`);
  L.push(`| 转场 | ${mergeInfo.mode} |`);
  L.push('');
  L.push(`## 输入信号（自动探测）`, '');
  L.push(`- 黑场 ${dec.signals.black.length} 段，冻帧 ${dec.signals.freeze.length} 段，静音 ${dec.signals.silence.length} 段，场景切点 ${dec.signals.scenes.length} 个`);
  L.push('');
  L.push(`## 剪辑决策（${dec.kept.length} 个保留段）`, '');
  L.push(`| # | 入点 | 出点 | 时长 | 信号标记 |`, `| --- | --- | --- | --- | --- |`);
  dec.kept.forEach((k, i) => {
    const mark = [k.signals.speech && 'speech(已保护)', k.signals.black && 'black', k.signals.freeze && 'freeze', k.signals.silence && 'silence'].filter(Boolean).join(',') || '正常';
    L.push(`| ${i + 1} | ${fmt(k.start)} (${k.start.toFixed(2)}s) | ${fmt(k.end)} (${k.end.toFixed(2)}s) | ${k.dur.toFixed(2)}s | ${mark} |`);
  });
  L.push('', `## 切除段`, '');
  if (!dec.cut.length) L.push('- 无');
  else {
    L.push(`| # | 入点 | 出点 | 时长 | 原因 |`, `| --- | --- | --- | --- | --- |`);
    dec.reasons.forEach((c, i) => L.push(`| ${i + 1} | ${c.start.toFixed(2)}s | ${c.end.toFixed(2)}s | ${(c.end - c.start).toFixed(2)}s | ${c.why} |`));
  }
  if (dec.guard) L.push('', `> ⚠ 保护触发：${dec.guard}`);
  L.push('', `## 剪辑规则（决策可调的默认参数）`, '');
  L.push('```json', JSON.stringify(DECISION, null, 2), '```', '');
  L.push(`> 规则：黑场切；冻帧且静音切；仅冻帧或仅静音保留（避免误切口播与动作镜头）；切点吸附最近镜头边界；短于 ${DECISION.minKeep}s 的碎片并入切除；切除超过 ${OPT.maxCutRatio}% 时放弃自动切除。`);
  L.push('', `## 交付清单`, '');
  for (const f of files) L.push(`- \`${path.basename(f.name)}\` — ${f.desc}`);
  L.push('', `## 复现`, '');
  L.push('```powershell');
  L.push(`node Tool\\vfactory.mjs "${SRC}" --out out --title "..."`);
  L.push('```');
  L.push('', `每步 ffmpeg 命令见 \`runlog.jsonl\`。`);
  fs.writeFileSync(path.join(OUT, 'report.md'), L.join('\n'));
}

// ---------------- main ----------------
function main() {
  const t0 = Date.now();
  console.log('[probe]', SRC);
  const pr = probe(path.resolve(SRC));
  if (!pr.video) throw new Error('源文件无视频流');
  pr.duration = pr.duration || Number(pr.video.nb_frames) / Number((pr.video.fps || '30/1').split('/')[0]);
  const hasAudio = !!pr.audio;
  fs.writeFileSync(path.join(OUT, 'probe.json'), JSON.stringify(pr, null, 2));
  console.log(`[probe] ${pr.duration.toFixed(2)}s ${pr.video.width}x${pr.video.height} audio=${hasAudio}`);

  console.log('[analyze] blackdetect / freezedetect / scdet / silencedetect ...');
  const sig = analyze(path.resolve(SRC), hasAudio);
  console.log(`[analyze] black=${sig.black.length} freeze=${sig.freeze.length} silence=${sig.silence.length} scenes=${sig.scenes.length}`);

  console.log('[decide] 应用剪辑规则 ...');
  const dec = decide(sig, pr.duration);
  fs.writeFileSync(path.join(OUT, 'signals.json'), JSON.stringify(sig, null, 2));

  const work = path.join(OUT, '.work');
  fs.mkdirSync(work, { recursive: true });
  console.log(`[render] 提取 ${dec.kept.length} 段 ...`);
  const segs = extractSegments(path.resolve(SRC), dec.kept, work, hasAudio);
  console.log(`[render] 合并 (${OPT.transition}) ...`);
  const mergeInfo = mergeSegments(segs, work, hasAudio);
  const mergedDur = durOf(mergeInfo.file);
  const finalFile = path.join(OUT, 'final.mp4');
  console.log(`[render] 收尾(响度归一/淡入淡出${OPT.title ? '/标题' : ''}${OPT.srt ? '/字幕' : ''}) ...`);
  polish(mergeInfo.file, finalFile, hasAudio, mergedDur);
  const outDur = durOf(finalFile);

  const sheet = path.join(OUT, 'contact_sheet.jpg');
  const okSheet = contactSheet(finalFile, sheet, outDur);

  const edl = {
    generated_at: new Date().toISOString(),
    tool: 'vfactory v0.1',
    source: { file: path.resolve(SRC), duration: pr.duration, video: pr.video, audio: pr.audio },
    output: { file: finalFile, duration: outDur, width: OPT.width, height: OPT.height, fps: OPT.fps, transition: mergeInfo.mode },
    decision: { params: DECISION, rule: 'black→cut; freeze∧silence→cut; freeze-only or silence-only→keep; snap to scene cuts; drop keeps<minKeep; speech-protection(no cut where ASR found words); guard maxCutRatio', protect: OPT.protect || null, protect_pad: OPT.protectPad, protect_conf: OPT.protectConf, protected_spans: dec.protectedSpans },
    kept: dec.kept,
    cut: dec.cut,
    cut_reasons: dec.reasons,
    guard: dec.guard,
  };
  fs.writeFileSync(path.join(OUT, 'edits.json'), JSON.stringify(edl, null, 2));

  const files = [
    { name: finalFile, desc: '成片（可直接交付）' },
    { name: path.join(OUT, 'edits.json'), desc: 'EDL 剪辑决策单（机器可读，含规则参数）' },
    { name: path.join(OUT, 'signals.json'), desc: '探测到的黑场/冻帧/静音/场景切点原始信号' },
    { name: path.join(OUT, 'probe.json'), desc: '源文件技术信息' },
    { name: path.join(OUT, 'report.md'), desc: '人类可读交付报告' },
    ...(okSheet ? [{ name: sheet, desc: '成片抽帧拼图（快速目检）' }] : []),
    { name: LOG, desc: '每一步 ffmpeg 命令与耗时（可审计/可复现）' },
  ];
  report({ src: pr, pr, dec, mergeInfo, totalOut: outDur, files, hasAudio });

  console.log(`[done] ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${OUT}`);
  console.log(`[done] final=${outDur.toFixed(2)}s kept=${dec.kept.length} cut=${dec.cut.length} transition=${mergeInfo.mode}`);
  for (const f of files) if (fs.existsSync(f.name)) console.log(`  - ${path.basename(f.name)} ${(fs.statSync(f.name).size / 1024).toFixed(0)}KB`);
}

try { main(); } catch (e) { console.error('[error]', e.message); process.exit(1); }
