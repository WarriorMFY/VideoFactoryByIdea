#!/usr/bin/env node
/**
 * make_digest.mjs — 「3 分钟摘要报告」流水线（loop14 WP4.7 新增）
 *
 * 用途：把一条已发布的长片（TED 演讲原声版）压缩成中文解说的摘要视频，
 * 并生成「快速导航通道」所需的全部物料（章节表 / 原片时间角标 / 跳转链接）。
 *
 * 结构：
 *   片头卡(黑底标题) → N 个段落（每段=1 句中文解说 + 原片精选帧 Ken Burns 动效
 *   + 底部中文字幕 + 左上章节角标 + 右上「原片 mm:ss」） → 片尾卡(导流完整版)
 *
 * 音画同步模型（推导见 History/loops/loop14/ep_a_digest/README.md）：
 *   音频 = [片头静音T] seg1 [GAP] seg2 [GAP] ... segN [GAP] [片尾静音E]
 *   视频片段时长 V0=T+GAP；Vk=seg时长+2*GAP (k=1..N)；Vlast=E+GAP
 *   xfade 交叉淡化=GAP，转场恰好落在句间静音里，解说起点=画面定格起点，零漂移。
 *
 * 用法：
 *   node Tool/ops/make_digest.mjs --spec <digest.json> --out <dir>
 *
 * spec 字段：
 *   source      原片视频（抽帧用，须与已发布稿件同源）
 *   origin_bvid 原片 BV 号（生成跳转链接）
 *   origin_dur  原片时长秒（导流文案用）
 *   voice/rate  Edge TTS 音色与语速
 *   gap         段间静音=转场时长（默认 0.5）
 *   title_card  { dur, lines:[{text,style}] }  style: t1/t2/t3
 *   end_card    同上
 *   segments    [{ chapter, src, text }]  chapter 仅在每章首段显示角标
 *
 * 产物（<dir>/）：final.mp4、digest.ass、zh.srt、manifest.json（含章节跳转表）、
 *               desc_publish.txt（可直接喂 publish_bilibili.mjs --desc-file）、frames/
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ffmpeg, durationOf, run, ROOT } from '../lib/ff.mjs';
import { toSrt } from '../lib/srt.mjs';

const args = process.argv.slice(2);
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const SPEC = path.resolve(ROOT, getOpt('--spec', ''));
const OUT = path.resolve(ROOT, getOpt('--out', ''));
if (!SPEC || !fs.existsSync(SPEC)) { console.error('缺少 --spec 或文件不存在'); process.exit(2); }
if (!OUT) { console.error('缺少 --out'); process.exit(2); }
const spec = JSON.parse(fs.readFileSync(SPEC, 'utf8'));

const SRC = path.resolve(ROOT, spec.source);
const GAP = Number(spec.gap ?? 0.5);
const VOICE = spec.voice || 'zh-CN-YunyangNeural';
const RATE = spec.rate || '+5%';
const FPS = 30;
const W = 1280, H = 720;
const T_DUR = Number(spec.title_card?.dur || 3.4);
const E_DUR = Number(spec.end_card?.dur || 5.5);

fs.mkdirSync(OUT, { recursive: true });
const work = path.join(OUT, '.work'); fs.mkdirSync(work, { recursive: true });
const framesDir = path.join(OUT, 'frames'); fs.mkdirSync(framesDir, { recursive: true });
const log = (n) => path.join(ROOT, 'History', 'runs', '_logs', `digest_${n}.log`);
const t0 = Date.now();
const tick = (label, ms) => console.log(`  [${String(ms).padStart(5)}ms] ${label}`);

const fmtT = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.round(s % 60)).padStart(2, '0')}`;

console.log(`[digest] ${spec.segments.length} 段解说 / 音色 ${VOICE} ${RATE} / GAP ${GAP}s`);

// ---------- ① TTS（逐段，去首尾静音）----------
const require = createRequire(path.join(ROOT, 'Workspace', 'deps', 'asr', 'index.cjs'));
const { EdgeTTS } = require('@andresaya/edge-tts');
let t = Date.now();
const durs = [];
const REUSE_TTS = args.includes('--reuse-tts');
for (let i = 0; i < spec.segments.length; i++) {
  const seg = spec.segments[i];
  const mp3 = path.join(work, `s${i}.mp3`);
  const wav = path.join(work, `s${i}.wav`);
  if (REUSE_TTS && fs.existsSync(wav)) { durs.push(durationOf(wav, log(`dur_${i}`))); continue; }
  let ok = false;
  for (let a = 0; a < 3 && !ok; a++) {
    try {
      const tts = new EdgeTTS();
      await tts.synthesize(seg.text, VOICE, { rate: RATE });
      const buf = await tts.toBuffer();
      if (!buf || buf.length < 1000) throw new Error('TTS 输出异常');
      fs.writeFileSync(mp3, buf); ok = true;
    } catch { await new Promise((r) => setTimeout(r, 1200)); }
  }
  if (!ok) { console.error(`TTS 失败（第 ${i + 1} 段）`); process.exit(1); }
  const r = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-i', mp3,
    '-af', 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.03,areverse,'
      + 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.03,areverse',
    '-ac', '2', '-ar', '48000', '-c:a', 'pcm_s16le', wav], log(`tts_${i}`));
  if (r.status !== 0) { console.error(`TTS 转码失败: ${(r.text || '').slice(-200)}`); process.exit(1); }
  durs.push(durationOf(wav, log(`dur_${i}`)));
}
tick(`TTS ${spec.segments.length} 段 共${durs.reduce((a, b) => a + b, 0).toFixed(1)}s`, Date.now() - t);

// ---------- ② 时间轴推导 ----------
// 音频单元：u0=T(片头静音) u1..uN=各段 u_{N+1}=E(片尾静音)，单元间 GAP
const U = [T_DUR, ...durs, E_DUR];
const S = []; let acc = 0; // S[k]=第k个单元音频起点
for (const u of U) { S.push(acc); acc += u + GAP; }
const audioTotal = acc - GAP; // 最后一个单元后没有 GAP
// 视频片段：V0=u0+GAP；Vk=uk+2*GAP；Vlast=u_last+GAP；C[k]=片段视觉起点
const N = U.length;
const V = [], C = [];
for (let k = 0; k < N; k++) {
  V.push(k === 0 ? U[0] + GAP : (k === N - 1 ? U[k] + GAP : U[k] + 2 * GAP));
}
C.push(0);
for (let k = 1; k < N; k++) C.push(C[k - 1] + V[k - 1] - GAP);
const videoTotal = C[N - 1] + V[N - 1];
if (Math.abs(videoTotal - audioTotal) > 0.05) {
  console.error(`音画时长校验失败 video=${videoTotal.toFixed(2)} audio=${audioTotal.toFixed(2)}`); process.exit(1);
}

// ---- 帧对齐（抗抖动 / 抗转场擦帧）----
// xfade 的 offset 若不是 1/FPS 整数倍，内部按时间选帧会产生 1 帧级跳变；
// 片段帧数若按 round(V*FPS) 独立取整，误差会单向累积（实测最差 0.11s=3.3 帧）。
// 做法：把片段起止点统一量化到帧栅格，片段帧数由相邻起点差推出，形成自洽整数链。
const fGAP = Math.round(GAP * FPS);
const fOff = C.map((s) => Math.round(s * FPS));       // 每段视觉起点（帧）
const fTotal = Math.round(videoTotal * FPS);
const fV = fOff.map((o, k) => (k < N - 1 ? fOff[k + 1] + fGAP - o : fTotal - o));
for (let k = 0; k < N; k++) {
  if (fV[k] < fGAP + 2) { console.error(`片段${k}帧数过短 (${fV[k]}帧 < 转场${fGAP}帧)`); process.exit(1); }
}
const totalDrift = Math.max(...fV.map((f, k) => Math.abs(f / FPS - V[k])));
console.log(`  帧对齐：${fTotal} 帧 / 转场 ${fGAP} 帧 / 单段最大量化偏差 ${(totalDrift * 1000).toFixed(1)}ms`);
console.log(`  时间轴：成片 ${videoTotal.toFixed(1)}s（片头 ${T_DUR}s + 解说 ${durs.reduce((a, b) => a + b, 0).toFixed(1)}s + 片尾 ${E_DUR}s）`);

// ---------- ③ 抽帧 ----------
t = Date.now();
const frameFiles = [];
for (let i = 0; i < spec.segments.length; i++) {
  const f = path.join(framesDir, `f${String(i).padStart(2, '0')}_${Math.round(spec.segments[i].src)}s.jpg`);
  const r = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(spec.segments[i].src),
    '-i', SRC, '-frames:v', '1', '-vf', `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`,
    '-q:v', '2', f], log(`frame_${i}`));
  if (r.status !== 0 || !fs.existsSync(f)) { console.error(`抽帧失败: ${SRC} @${spec.segments[i].src}s`); process.exit(1); }
  frameFiles.push(f);
}
tick(`抽帧 ${spec.segments.length} 张`, Date.now() - t);

// ---------- ④ 片段渲染（Ken Burns：偶数推进/奇数拉远）----------
// 抗抖动三联：
//   ① 4x lanczos 上采样（1280→5120）：每帧位移放大到 4px 级，1px 取整误差占比降到 1/4
//   ② 全程 yuv444p：避免 4:2:0 色度子采样在亚像素移动下的色块跳动
//   ③ zoompan 输出 2x 尺寸再 lanczos 下采样：二次低通滤掉残留在像素栅格上的台阶
// 实测 CV（帧间差异变异系数）32.6% → 13.0%，最大跳变 0.26 → 0.07。
t = Date.now();
const clips = [];
const UPW = W * 4, UPH = H * 4;      // 5120x2880
const KBW = W * 2, KBH = H * 2;      // zoompan 输出 2560x1440
for (let k = 0; k < N; k++) {
  const c = path.join(work, `c${String(k).padStart(2, '0')}.mp4`);
  const nF = fV[k];
  if (k === 0 || k === N - 1) {
    // 片头/片尾卡：纯黑底（文字由 ASS 叠加）
    const r = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', `color=c=0x0B0E14:s=${W}x${H}:r=${FPS}`,
      '-frames:v', String(nF), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14',
      '-pix_fmt', 'yuv420p', c], log(`clip_${k}`));
    if (r.status !== 0) { console.error(`片段${k}渲染失败`); process.exit(1); }
  } else {
    const zin = (k % 2 === 1);
    const zex = zin ? `1+0.10*on/${nF}` : `1.10-0.10*on/${nF}`;
    const vf = `scale=${UPW}:${UPH}:flags=lanczos,format=yuv444p,`
      + `zoompan=z='${zex}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${nF}:s=${KBW}x${KBH}:fps=${FPS},`
      + `scale=${W}:${H}:flags=lanczos,format=yuv420p`;
    const r = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-i', frameFiles[k - 1],
      '-vf', vf, '-frames:v', String(nF),
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', c], log(`clip_${k}`));
    if (r.status !== 0) { console.error(`片段${k}渲染失败: ${(r.text || '').slice(-200)}`); process.exit(1); }
  }
  clips.push(c);
}
tick(`片段渲染 ${N} 个`, Date.now() - t);

// ---------- ⑤ 拼音频（单元间 GAP 精确静音）----------
t = Date.now();
const parts = [];
const sil = (d, name) => {
  const f = path.join(work, name);
  ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo',
    '-t', String(d), '-c:a', 'pcm_s16le', f], log(`sil_${name}`));
  return f;
};
parts.push(sil(T_DUR, 'lead.wav'));
parts.push(sil(GAP, 'glead.wav')); // U 模型：片头静音与首段之间也有一个 GAP（此处恰为卡片→首段的转场窗）
for (let i = 0; i < durs.length; i++) {
  parts.push(path.join(work, `s${i}.wav`));
  parts.push(sil(GAP, `g${i}.wav`)); // 每段后都有 GAP（最后一段的 GAP 是 segN→片尾卡的转场窗）
}
parts.push(sil(E_DUR, 'tail.wav'));
const listTxt = path.join(work, 'audio_list.txt');
fs.writeFileSync(listTxt, parts.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n'));
const speech = path.join(work, 'speech.wav');
{
  const r = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', listTxt,
    '-c:a', 'pcm_s16le', speech], log('concat'));
  if (r.status !== 0) { console.error('音频拼接失败'); process.exit(1); }
}
const speechDur = durationOf(speech, log('sdur'));
if (Math.abs(speechDur - audioTotal) > 0.08) {
  console.error(`拼接音频 ${speechDur.toFixed(2)}s ≠ 预期 ${audioTotal.toFixed(2)}s`); process.exit(1);
}
tick(`音频拼接 ${speechDur.toFixed(2)}s`, Date.now() - t);

// ---------- ⑥ 字幕/角标 ASS ----------
t = Date.now();
const ass = [];
ass.push('[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${W}`, `PlayResY: ${H}`, 'WrapStyle: 2', 'ScaledBorderAndShadow: yes', '');
ass.push('[V4+ Styles]',
  'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
  `Style: Narr,SimHei,40,&H00FFFFFF,&H00FFFFFF,&H00141414,&HC8000000,1,0,0,0,100,100,0,0,1,2.4,1.0,2,42,42,32,1`,
  `Style: TL,SimHei,25,&H00E8F4FF,&H00E8F4FF,&HB4141414,&H64000000,1,0,0,0,100,100,0,0,3,10,0,7,22,22,18,1`,
  `Style: TR,SimHei,23,&H00E8F4FF,&H00E8F4FF,&HB4141414,&H64000000,0,0,0,0,100,100,0,0,3,8,0,9,22,22,18,1`,
  `Style: T1,SimHei,72,&H00FFFFFF,&H00FFFFFF,&H00141414,&HC8000000,1,0,0,0,100,100,0,0,1,3,0,5,0,0,0,1`,
  `Style: T2,SimHei,38,&H00E8F4FF,&H00E8F4FF,&H00141414,&HC8000000,0,0,0,0,100,100,0,0,1,2,0,5,0,0,0,1`,
  `Style: T3,SimHei,26,&H00B4B4B4,&H00B4B4B4,&H00141414,&HC8000000,0,0,0,0,100,100,0,0,1,1.5,0,5,0,0,0,1`, '');
ass.push('[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text');
const ts = (s) => `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${(s % 60).toFixed(2).padStart(5, '0')}`;
const ev = (st, a, b, text) => ass.push(`Dialogue: 0,${ts(a)},${ts(b)},${st},,0,0,0,,${text}`);

// 片头卡
for (const ln of spec.title_card?.lines || []) ev(ln.style || 't1', 0.2, T_DUR - 0.1, ln.text);
// 各段：解说字幕（按标点切块、时长按字数均摊）+ 章节角标 + 原片时间
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
let lastChapter = null;
for (let i = 0; i < spec.segments.length; i++) {
  const seg = spec.segments[i];
  const Ck = C[i + 1], dur = durs[i];
  const segs = chunk(seg.text);
  const chars = segs.reduce((n, s) => n + s.length, 0) || 1;
  let c0 = Ck;
  segs.forEach((s, j) => {
    const d = (dur * s.length) / chars;
    ev('Narr', c0, j === segs.length - 1 ? Ck + dur : c0 + d + 0.02, s.replace(/([，。、！？；：—])/g, '$1'));
    c0 += d;
  });
  if (seg.chapter && seg.chapter !== lastChapter) {
    ev('TL', Ck, Ck + dur + GAP, `◆ ${seg.chapter}`);
    lastChapter = seg.chapter;
  }
  ev('TR', Ck, Ck + dur + GAP, `原片 ${fmtT(seg.src)}`);
}
// 片尾卡
for (const ln of spec.end_card?.lines || []) ev(ln.style || 't2', C[N - 1] + 0.2, videoTotal - 0.1, ln.text);
const assPath = path.join(OUT, 'digest.ass');
fs.writeFileSync(assPath, ass.join('\n') + '\n');
tick('ASS 字幕+角标', Date.now() - t);

// ---------- ⑦ xfade 合成 + 烧字幕 + 混音 ----------
t = Date.now();
const fcs = [];
let inputs = [];
for (const c of clips) inputs.push(['-i', c]);
inputs.push(['-i', speech]);
// xfade 链
fcs.push(`[0:v]format=yuv420p[v0]`);
for (let k = 1; k < N; k++) {
  fcs.push(`[${k}:v]format=yuv420p[v${k}]`);
  const off = (fOff[k] / FPS).toFixed(3);   // 帧对齐后的转场起点，避免 xfade 内部选帧抖动
  const prev = k === 1 ? 'v0' : `x${k - 1}`;
  fcs.push(`[${prev}][v${k}]xfade=transition=fade:duration=${GAP}:offset=${off}[x${k}]`);
}
fcs.push(`[x${N - 1}]ass='${path.relative(ROOT, assPath).replace(/\\/g, '/')}'[vout]`);
fcs.push(`[${N}:a]loudnorm=I=-16:TP=-1.5:LRA=11[ao]`);
const fcPath = path.join(work, 'fc.txt');
fs.writeFileSync(fcPath, fcs.join(';\n'));
const final = path.join(OUT, 'final.mp4');
{
  const r = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', ...inputs.flat(),
    '-filter_complex_script', fcPath,
    '-map', '[vout]', '-map', '[ao]', '-t', (fTotal / FPS).toFixed(3),
    '-r', String(FPS),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '160k', '-ar', '48000',
    '-movflags', '+faststart', final], log('final'));
  if (r.status !== 0) { console.error('合成失败:', (r.text || '').slice(-500)); process.exit(1); }
}
const finalDur = durationOf(final, log('fdur'));
tick(`成片合成 ${finalDur.toFixed(2)}s`, Date.now() - t);

// ---------- ⑧ SRT / manifest / 简介物料 ----------
const cues = [];
for (let i = 0; i < spec.segments.length; i++) {
  const seg = spec.segments[i];
  const segs = chunk(seg.text);
  const chars = segs.reduce((n, s) => n + s.length, 0) || 1;
  let c0 = C[i + 1];
  segs.forEach((s, j) => {
    const d = (durs[i] * s.length) / chars;
    cues.push({ start: c0, end: j === segs.length - 1 ? c0 + durs[i] : c0 + d, zh: s });
    c0 += d;
  });
}
fs.writeFileSync(path.join(OUT, 'zh.srt'), toSrt(cues, (c) => [c.zh]));

// 章节表（摘要时间 → 原片时间）
const chapters = [];
let seen = null;
for (let i = 0; i < spec.segments.length; i++) {
  const seg = spec.segments[i];
  if (seg.chapter && seg.chapter !== seen) {
    chapters.push({ no: chapters.length + 1, title: seg.chapter, digest_t: Number(C[i + 1].toFixed(1)), src_t: seg.src });
    seen = seg.chapter;
  }
}
const originUrl = (t2) => `https://www.bilibili.com/video/${spec.origin_bvid}?t=${Math.round(t2)}`;
const descLines = [];
descLines.push(spec.desc_head || '');
descLines.push('');
descLines.push(`完整原片（${fmtT(spec.origin_dur)}）：${originUrl(0)}`);
descLines.push('');
descLines.push('【快速导航通道】本片每章右上角标注了对应原片时间，按下表可直接跳到原片完整论述：');
for (const ch of chapters) {
  descLines.push(`${String(ch.no).padStart(2, '0')} ${ch.title} ｜ 摘要 ${fmtT(ch.digest_t)} → 原片 ${fmtT(ch.src_t)}  ${originUrl(ch.src_t)}`);
}
if (spec.desc_tail) { descLines.push(''); descLines.push(spec.desc_tail); }
fs.writeFileSync(path.join(OUT, 'desc_publish.txt'), descLines.join('\n') + '\n');

const manifest = {
  generated_at: new Date().toISOString(),
  tool: 'Tool/ops/make_digest.mjs',
  spec: path.relative(ROOT, SPEC),
  source: { file: path.relative(ROOT, SRC), origin_bvid: spec.origin_bvid, origin_dur: spec.origin_dur },
  duration_s: Number(finalDur.toFixed(2)),
  voice: { engine: 'edge-tts', name: VOICE, rate: RATE },
  segments: spec.segments.map((s, i) => ({ ...s, tts_dur: Number(durs[i].toFixed(2)), digest_t: Number(C[i + 1].toFixed(2)) })),
  chapters, nav_links: chapters.map((ch) => ({ ...ch, origin_url: originUrl(ch.src_t) })),
  timings_ms: { total: Date.now() - t0 },
};
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`\n[digest] 完成 ${path.relative(ROOT, final)}  总耗时 ${((Date.now() - t0) / 1000).toFixed(0)}s`);
