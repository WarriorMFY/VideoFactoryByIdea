/**
 * digest_v2.mjs — 摘要片 v2 剪辑语言（loop18，把 loop17 验证的 P1-P5 并入主链）
 *
 * 与 v1 的差异（调研依据 Prototype/loop17_edit_research/REPORT.md）：
 *   P1 真机位片段：段=原片时间窗（trim）而非静帧 Ken Burns，ASL 从 85s 回到 ~5s 量级
 *   P2 硬切替代软溶解：concat 直切（无 xfade），切点全部可感知
 *   P3 冷开场 hook：spec.hook 强观点句前置，标题卡后移
 *   P4 关键词强调：段内 kw:[[字位,词]] 橙色弹出（OpusClip keyword accent 同款）
 *   P5 章节进度条：底部常驻，随全程生长
 *   + 音效当标点：每个切点 whoosh + impact（合成音效，无版权问题）
 *
 * 结构：hook(可选) → 标题卡 → N 段真机位窗口 → 片尾卡
 * 音频：TTS 逐段就位 + 切点音效，原声轨不混入（与 v1 一致，纯解说）
 *
 * 由 make_digest.mjs --v2 调用：TTS 阶段共用，本模块负责时间轴/ASS/合成/物料。
 * 产物与 v1 同构：final.mp4、digest.ass、zh.srt、manifest.json、desc_publish.txt
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ffmpeg, durationOf, ROOT } from '../lib/ff.mjs';
import { toSrt } from '../lib/srt.mjs';

const FPS = 30, W = 1280, H = 720;
const LEAD = 0.35, HOOK_LEAD = 0.6;   // TTS 相对段起点的就位延迟
const BAR_H = 7, BAR_Y = 706;         // 进度条
const KW_COLOR = '2AD5FF';            // BGR：橙色

export async function runV2({ spec, SPEC, OUT, durs, work, args }) {
  const SRC = path.resolve(ROOT, spec.source);
  const VOICE = spec.voice || 'zh-CN-YunyangNeural';
  const RATE = spec.rate || '+5%';
  const T_DUR = Number(spec.title_card?.dur || 2.4);
  const E_DUR = Number(spec.end_card?.dur || 6.0);
  const log = (n) => path.join(ROOT, 'History', 'runs', '_logs', `digest_v2_${n}.log`);
  const t0 = Date.now();
  const tick = (label, ms) => console.log(`  [${String(ms).padStart(5)}ms] ${label}`);
  const fmtT = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  // loop21 参数化：--kw-dur 关键词停留秒数（默认 1.6 = loop18 行为）；--quote-card 章节金句锚点卡
  const getArg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const KW_DUR = Math.max(0.4, Number(getArg('--kw-dur', '1.6')));
  const QUOTE_CARD = args.includes('--quote-card');
  const QUOTE_DUR = Math.max(1.0, Number(getArg('--quote-dur', '1.8')));
  console.log(`[digest v2] ${spec.segments.length} 段真机位窗口 / hook ${spec.hook ? '有' : '无'} / 硬切+音效`);

  // ---------- ① hook TTS（冷开场，复用同一音色）----------
  const require = createRequire(path.join(ROOT, 'Workspace', 'deps', 'asr', 'index.cjs'));
  const { EdgeTTS } = require('@andresaya/edge-tts');
  let hookDur = 0;
  if (spec.hook) {
    const mp3 = path.join(work, 'hook.mp3'), wav = path.join(work, 'hook.wav');
    if (!(args.includes('--reuse-tts') && fs.existsSync(wav))) {
      let ok = false;
      for (let a = 0; a < 3 && !ok; a++) {
        try {
          const tts = new EdgeTTS();
          await tts.synthesize(spec.hook.text, VOICE, { rate: RATE });
          const buf = await tts.toBuffer();
          if (!buf || buf.length < 1000) throw new Error('TTS 输出异常');
          fs.writeFileSync(mp3, buf); ok = true;
        } catch { await new Promise((r) => setTimeout(r, 1200)); }
      }
      if (!ok) { console.error('hook TTS 失败'); process.exit(1); }
      const r = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-i', mp3,
        '-af', 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.03,areverse,'
          + 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.03,areverse',
        '-ac', '2', '-ar', '48000', '-c:a', 'pcm_s16le', wav], log('tts_hook'));
      if (r.status !== 0) { console.error('hook TTS 转码失败'); process.exit(1); }
    }
    hookDur = durationOf(wav, log('dur_hook'));
  }

  // ---------- ② 时间轴（硬切：单元首尾相接，无 GAP 窗）----------
  const segVis = spec.segments.map((s, i) =>
    Math.max(durs[i] + LEAD + 0.9, Number(s.min || 5.5)));
  const hookVis = spec.hook ? Math.max(hookDur + HOOK_LEAD + 0.9, Number(spec.hook.min || 8)) : 0;
  const units = [];
  if (spec.hook) units.push({ kind: 'hook', dur: hookVis });
  units.push({ kind: 'title', dur: T_DUR });
  spec.segments.forEach((s, i) => units.push({ kind: 'seg', dur: segVis[i], i, src: s.src }));
  units.push({ kind: 'end', dur: E_DUR });
  let acc = 0;
  for (const u of units) { u.start = acc; acc += u.dur; }
  const TOTAL = acc;
  if (TOTAL > 15 * 60) { console.error(`成片 ${TOTAL.toFixed(0)}s 超过 15 分钟红线`); process.exit(1); }
  console.log(`  时间轴：成片 ${TOTAL.toFixed(1)}s（hook ${hookVis.toFixed(1)} + 标题 ${T_DUR} + ${spec.segments.length} 段 + 片尾 ${E_DUR}）`);

  // ---------- ③ ASS ----------
  const ass = [];
  ass.push('[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${W}`, `PlayResY: ${H}`, 'WrapStyle: 2', 'ScaledBorderAndShadow: yes', '');
  ass.push('[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Narr,SimHei,40,&H00FFFFFF,&H00FFFFFF,&H00141414,&HC8000000,1,0,0,0,100,100,0,0,1,2.4,1.0,2,42,42,32,1`,
    `Style: KW,SimHei,58,&H00${KW_COLOR},&H00${KW_COLOR},&HC8141414,&HC8000000,1,0,0,0,100,100,0,0,1,3,0,7,0,0,0,1`,
    `Style: Chap,SimHei,25,&H00FFFFFF,&H00FFFFFF,&HB4141414,&H64000000,1,0,0,0,100,100,0,0,1,8,0,7,22,22,18,1`,
    `Style: TR,SimHei,23,&H00E8F4FF,&H00E8F4FF,&HB4141414,&H64000000,0,0,0,0,100,100,0,0,3,8,0,9,22,22,18,1`,
    `Style: T1,SimHei,72,&H00FFFFFF,&H00FFFFFF,&H00141414,&HC8000000,1,0,0,0,100,100,0,0,1,3,0,5,0,0,0,1`,
    `Style: T2,SimHei,38,&H00E8F4FF,&H00E8F4FF,&H00141414,&HC8000000,0,0,0,0,100,100,0,0,1,2,0,5,0,0,0,1`,
    `Style: T3,SimHei,26,&H00B4B4B4,&H00B4B4B4,&H00141414,&HC8000000,0,0,0,0,100,100,0,0,1,1.5,0,5,0,0,0,1`,
    `Style: QCBG,SimHei,30,&H00000000,&H00000000,&H00000000,&H00000000,0,0,0,0,100,100,0,0,0,0,0,7,0,0,0,1`,
    `Style: QCT,SimHei,60,&H00FFFFFF,&H00FFFFFF,&H00141414,&HC8000000,1,0,0,0,100,100,0,0,1,3,0,5,60,60,0,1`, '');
  ass.push('[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text');
  const ts = (s) => `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${(s % 60).toFixed(2).padStart(5, '0')}`;
  const ev = (layer, st, a, b, text) => ass.push(`Dialogue: ${layer},${ts(a)},${ts(b)},${st},,0,0,0,,${text}`);
  const esc = (t) => t.replace(/\n/g, '\\N');

  // 进度条：每单元一段事件，fscx 累计生长（无缝连续）
  for (const u of units) {
    const a = u.start, b = u.start + u.dur;
    const shape = `m 0 0 l ${W} 0 ${W} ${BAR_H} 0 ${BAR_H}{\\p0}`;
    const ms = Math.max(1, Math.round((b - a) * 1000));
    ev(0, 'Chap', a, b, `{\\an7\\pos(0,${BAR_Y})\\p1}${shape}`);
    ev(1, 'Chap', a, b, `{\\an7\\pos(0,${BAR_Y})\\c&H${KW_COLOR}&\\fscx${(a / TOTAL * 100).toFixed(2)}\\t(0,${ms},\\fscx${(b / TOTAL * 100).toFixed(2)})\\p1}${shape}`);
  }
  // 标题卡 / 片尾卡文字
  for (const ln of spec.title_card?.lines || []) ev(0, ln.style || 'T1', units[spec.hook ? 1 : 0].start + 0.15, units[spec.hook ? 1 : 0].start + T_DUR - 0.1, ln.text);
  const eU = units[units.length - 1];
  for (const ln of spec.end_card?.lines || []) ev(0, ln.style || 'T2', eU.start + 0.2, TOTAL - 0.1, ln.text);

  const segUnits = units.filter((u) => u.kind === 'seg' || u.kind === 'hook');
  for (const u of segUnits) {
    const isHook = u.kind === 'hook';
    const seg = isHook ? spec.hook : spec.segments[u.i];
    const a = u.start, b = u.start + u.dur;
    const vs = a + (isHook ? HOOK_LEAD : LEAD);
    ev(0, 'Narr', vs, b - 0.2, `{\\fad(120,160)}${esc(seg.text)}`);
    if (!isHook) {
      if (seg.chapter) ev(0, 'Chap', a + 0.1, b, `{\\fad(100,0)}◆ ${seg.chapter}`);
      ev(0, 'TR', a + 0.1, b, `{\\fad(100,0)}原片 ${fmtT(seg.src)}`);
    }
    // 关键词弹出（P4；loop21：停留时长参数化 --kw-dur）
    for (const [ci, word] of seg.kw || []) {
      const t = Math.min(vs + ci / seg.text.length * (isHook ? hookDur : durs[u.i]), b - Math.min(KW_DUR, 1.2));
      ev(1, 'KW', t, Math.min(t + KW_DUR, b - 0.2),
        `{\\an8\\pos(${W / 2},96)\\fscx55\\fscy55\\t(0,150,\\fscx100\\fscy100)\\fad(0,240)}${word}`);
    }
    // 章节金句锚点卡（loop21 E2：全屏压暗 + 居中白字，雷军版语法移植；底部解说字幕保留）
    if (QUOTE_CARD && !isHook && seg.quote) {
      const qEnd = Math.min(a + QUOTE_DUR, b - 0.1);
      ev(1, 'QCBG', a, qEnd, `{\\an7\\pos(0,0)\\p1\\1c&H000000&\\1a&H50&}m 0 0 l ${W} 0 ${W} ${H} 0 ${H}{\\p0}`);
      ev(1, 'QCT', a, qEnd, `{\\fad(120,160)}${esc(seg.quote)}`);
    }
  }
  const assPath = path.join(OUT, 'digest.ass');
  fs.writeFileSync(assPath, ass.join('\n') + '\n');
  tick('ASS 字幕+角标+进度条', Date.now() - t0);

  // ---------- ④ 合成音效（whoosh / impact，纯合成无版权）----------
  ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi',
    '-i', 'anoisesrc=color=pink:duration=0.45:amplitude=0.85',
    '-af', 'highpass=f=220,lowpass=f=1100,afade=t=in:st=0:d=0.3,afade=t=out:st=0.3:d=0.15,volume=0.55',
    '-ar', '48000', '-ac', '2', path.join(work, 'whoosh.wav')], log('whoosh'));
  ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi',
    '-i', 'sine=frequency=68:duration=0.35',
    '-af', 'afade=t=out:st=0.04:d=0.31,volume=0.5',
    '-ar', '48000', '-ac', '2', path.join(work, 'impact.wav')], log('impact'));

  // ---------- ⑤ 逐单元渲染中间片段（坑17：禁止单图多 trim 分支并行解码——
  // 33 分支同图会把 h264 解码器内存打爆（thread_get_buffer failed），静默丢帧 32s。
  // 改为 v1 同款架构：串行切片段 → 文件 concat，内存平稳且总解码量从 33×911s 降到 ~2×209s）----------
  const t1 = Date.now();
  const clips = [];
  const nF = (d) => Math.round(d * FPS);
  for (let k = 0; k < units.length; k++) {
    const u = units[k];
    const c = path.join(work, `u${String(k).padStart(2, '0')}.mp4`);
    if (u.kind === 'title' || u.kind === 'end') {
      const r = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y',
        '-f', 'lavfi', '-i', `color=c=0x0B0E14:s=${W}x${H}:r=${FPS}`,
        '-frames:v', String(nF(u.dur)), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14',
        '-pix_fmt', 'yuv420p', c], log(`clip_${k}`));
      if (r.status !== 0) { console.error(`卡片段${k}渲染失败`); process.exit(1); }
    } else {
      const src = u.kind === 'hook' ? spec.hook.src : spec.segments[u.i].src;
      const r = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y',
        '-ss', String(src), '-t', u.dur.toFixed(3), '-i', SRC,
        '-vf', `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},setsar=1`,
        '-an', '-frames:v', String(nF(u.dur)),
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', '-pix_fmt', 'yuv420p', c], log(`clip_${k}`));
      if (r.status !== 0) { console.error(`片段${k}渲染失败: ${(r.text || '').slice(-200)}`); process.exit(1); }
    }
    const cd = durationOf(c, log(`cdur_${k}`));
    if (Math.abs(cd - u.dur) > 0.15) { console.error(`片段${k}时长校验失败 ${cd.toFixed(2)} ≠ ${u.dur.toFixed(2)}`); process.exit(1); }
    clips.push(c);
  }
  tick(`中间片段 ${clips.length} 个`, Date.now() - t1);

  // ---------- ⑤b 音频预混（坑17：97 路 amix 与 x264 同图编码会静默饿死视频链，
  // 视频流截断在 ~177s 且退出码 0。两段式：音频单独预混成 wav，终混只有 M+1 路输入）----------
  const t2 = Date.now();
  const ttsFiles = [];
  if (spec.hook) ttsFiles.push(path.join(work, 'hook.wav'));
  for (let i = 0; i < spec.segments.length; i++) ttsFiles.push(path.join(work, `s${i}.wav`));
  {
    const aIn = ['-hide_banner', '-loglevel', 'error', '-y', '-i', path.join(work, 'whoosh.wav'), '-i', path.join(work, 'impact.wav')];
    for (const f of ttsFiles) aIn.push('-i', f);
    let afc = '';
    const amix = [];
    const segBase = spec.hook ? 2 : 1;
    ttsFiles.forEach((f, i) => {
      const isHook = i === 0 && spec.hook;
      const u = isHook ? units[0] : units[segBase + (i - (spec.hook ? 1 : 0))];
      const lead = isHook ? HOOK_LEAD : LEAD;
      const d = Math.round((u.start + lead) * 1000);
      afc += `[${2 + i}:a]aformat=sample_rates=48000:channel_layouts=stereo,adelay=${d}|${d}[ta${i}];`;
      amix.push(`[ta${i}]`);
    });
    units.forEach((u, i) => {
      const d = Math.round(u.start * 1000);
      afc += `[0:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=0.5,adelay=${d}|${d}[w${i}];`;
      afc += `[1:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=0.35,adelay=${d + 60}|${d + 60}[p${i}];`;
      amix.push(`[w${i}]`, `[p${i}]`);
    });
    afc += `${amix.join('')}amix=inputs=${amix.length}:normalize=0,apad=whole_dur=${TOTAL.toFixed(2)},loudnorm=I=-16:TP=-1.5:LRA=11[aout]`;
    const afcPath = path.join(work, 'afc_v2.txt');
    fs.writeFileSync(afcPath, afc);
    const mixWav = path.join(work, 'mix_v2.wav');
    const r = ffmpeg([...aIn, '-filter_complex_script', afcPath,
      '-map', '[aout]', '-c:a', 'pcm_s16le', mixWav], log('amix'));
    if (r.status !== 0) { console.error('音频预混失败:', (r.text || '').slice(-400)); process.exit(1); }
    const md = durationOf(mixWav, log('amix_dur'));
    if (Math.abs(md - TOTAL) > 0.2) { console.error(`预混时长校验失败 ${md.toFixed(2)} ≠ ${TOTAL.toFixed(2)}`); process.exit(1); }
  }
  tick('音频预混 1 条 wav', Date.now() - t2);

  // ---------- ⑤c 终混：concat 硬切 → 烧字幕 + 预混音轨 ----------
  const t3 = Date.now();
  const argsF = ['-hide_banner', '-loglevel', 'error', '-y'];
  for (const c of clips) argsF.push('-i', c);                    // 0..M-1
  const M = clips.length;
  argsF.push('-i', path.join(work, 'mix_v2.wav'));               // M
  let fc = '';
  const vin = clips.map((_, k) => `[${k}:v]`).join('');
  fc = `${vin}concat=n=${M}:v=1:a=0[vc];`;
  const assEsc = path.relative(ROOT, assPath).replace(/\\/g, '/').replace(/:/g, '\\:');
  fc += `[vc]subtitles='${assEsc}'[vout];`;
  const fcPath = path.join(work, 'fc_v2.txt');
  fs.writeFileSync(fcPath, fc);
  const final = path.join(OUT, 'final.mp4');
  {
    const r = ffmpeg([...argsF, '-filter_complex_script', fcPath,
      '-map', '[vout]', '-map', `${M}:a`, '-t', TOTAL.toFixed(3),
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-movflags', '+faststart', final], log('final'));
    if (r.status !== 0) { console.error('v2 合成失败:', (r.text || '').slice(-500)); process.exit(1); }
  }
  // 校验必须看视频流时长（容器时长会被音频撑住，掩盖视频流静默截断——坑17教训）
  const { FP, run } = await import('../lib/ff.mjs');
  const vdur = Number(String(run(FP, ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=duration', '-of', 'csv=p=0', final], log('vdur')).text || '').trim()) || 0;
  const finalDur = durationOf(final, log('fdur'));
  if (Math.abs(vdur - TOTAL) > 0.5) { console.error(`视频流时长校验失败 ${vdur.toFixed(2)} ≠ ${TOTAL.toFixed(2)}（视频被静默截断）`); process.exit(1); }
  if (Math.abs(finalDur - TOTAL) > 0.5) { console.error(`成片时长校验失败 ${finalDur.toFixed(2)} ≠ ${TOTAL.toFixed(2)}`); process.exit(1); }
  tick(`v2 合成 ${finalDur.toFixed(2)}s`, Date.now() - t3);

  // ---------- ⑥ SRT / desc / manifest（与 v1 同构）----------
  const chunk = (line) => {
    const cl = line.split(/(?<=[，。、！？；：—])/).filter(Boolean);
    const segs = []; let buf = '';
    const flush = () => { if (buf) { segs.push(buf); buf = ''; } };
    for (const c of cl) {
      if ((buf + c).length <= 20) { buf += c; continue; }
      flush();
      if (c.length <= 22) { segs.push(c); continue; }
      for (let j = 0; j < c.length; j += 20) segs.push(c.slice(j, j + 20));
    }
    flush();
    return segs;
  };
  const cues = [];
  spec.segments.forEach((s, i) => {
    const u = units[(spec.hook ? 1 : 0) + 1 + i];
    const segs = chunk(s.text);
    const chars = segs.reduce((n, x) => n + x.length, 0) || 1;
    let c0 = u.start + LEAD;
    segs.forEach((x, j) => {
      const d = (durs[i] * x.length) / chars;
      cues.push({ start: c0, end: j === segs.length - 1 ? c0 + durs[i] : c0 + d, zh: x });
      c0 += d;
    });
  });
  fs.writeFileSync(path.join(OUT, 'zh.srt'), toSrt(cues, (c) => [c.zh]));

  const originUrl = (t2) => `https://www.bilibili.com/video/${spec.origin_bvid}?t=${Math.round(t2)}`;
  const descLines = [spec.desc_head || '', '',
    `完整原片（${fmtT(spec.origin_dur)}）：${originUrl(0)}`, '',
    '【快速导航通道】本片每章右上角标注了对应原片时间，按下表可直接跳到原片完整论述：'];
  const chapters = [];
  let seen = null;
  spec.segments.forEach((s, i) => {
    if (s.chapter && s.chapter !== seen) {
      const u = units[(spec.hook ? 1 : 0) + 1 + i];
      chapters.push({ no: chapters.length + 1, title: s.chapter, digest_t: Number(u.start.toFixed(1)), src_t: s.src });
      seen = s.chapter;
    }
  });
  for (const ch of chapters) descLines.push(`${String(ch.no).padStart(2, '0')} ${ch.title} ｜ 摘要 ${fmtT(ch.digest_t)} → 原片 ${fmtT(ch.src_t)}  ${originUrl(ch.src_t)}`);
  if (spec.desc_tail) { descLines.push('', spec.desc_tail); }
  fs.writeFileSync(path.join(OUT, 'desc_publish.txt'), descLines.join('\n') + '\n');

  const manifest = {
    generated_at: new Date().toISOString(),
    tool: 'Tool/ops/make_digest.mjs --v2 (digest_v2.mjs)',
    spec: path.relative(ROOT, SPEC),
    source: { file: path.relative(ROOT, SRC), origin_bvid: spec.origin_bvid, origin_dur: spec.origin_dur },
    mode: 'v2',
    features: ['P1 真机位窗口', 'P2 硬切', 'P3 冷开场hook', 'P4 关键词强调', 'P5 进度条', '音效转场'],
    duration_s: Number(finalDur.toFixed(2)),
    voice: { engine: 'edge-tts', name: VOICE, rate: RATE },
    hook: spec.hook ? { src: spec.hook.src, digest_t: 0 } : null,
    segments: spec.segments.map((s, i) => ({ ...s, tts_dur: Number(durs[i].toFixed(2)), digest_t: Number(units[(spec.hook ? 1 : 0) + 1 + i].start.toFixed(2)), vis_dur: Number(segVis[i].toFixed(2)) })),
    chapters, nav_links: chapters.map((ch) => ({ ...ch, origin_url: originUrl(ch.src_t) })),
    timings_ms: { total: Date.now() - t0 },
  };
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`\n[digest v2] 完成 ${path.relative(ROOT, final)}  总耗时 ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
