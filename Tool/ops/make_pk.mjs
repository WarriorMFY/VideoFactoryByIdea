#!/usr/bin/env node
/**
 * make_pk.mjs — 「观点 PK 视频」流水线（小循环 8 新增，架构复用 make_digest.mjs）
 *
 * 与摘要的差异：
 *   1. 每段画面来自不同演讲者（spec.segments[i].frame 为已抽好的 jpg，用 ted_frame.mjs 预抽）
 *   2. 每段可带 speaker（发言人条，顶部居中）与 quote_en（英文原话，顶部居中第二行）
 *   3. topic（议题角标）替代 chapter，左上角标
 *   4. 简介物料为「原声出处表」（多原片，不做单原片导航）
 *
 * 用法：
 *   node Tool/ops/make_pk.mjs --spec <pk.json> --out <dir> [--reuse-tts]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ffmpeg, durationOf, ROOT } from '../lib/ff.mjs';
import { toSrt } from '../lib/srt.mjs';

const args = process.argv.slice(2);
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const SPEC = path.resolve(ROOT, getOpt('--spec', ''));
const OUT = path.resolve(ROOT, getOpt('--out', ''));
if (!SPEC || !fs.existsSync(SPEC)) { console.error('缺少 --spec 或文件不存在'); process.exit(2); }
if (!OUT) { console.error('缺少 --out'); process.exit(2); }
const spec = JSON.parse(fs.readFileSync(SPEC, 'utf8'));

const GAP = Number(spec.gap ?? 0.5);
const VOICE = spec.voice || 'zh-CN-YunyangNeural';
const RATE = spec.rate || '+5%';
const FPS = 30;
const W = 1280, H = 720;
const T_DUR = Number(spec.title_card?.dur || 3.8);
const E_DUR = Number(spec.end_card?.dur || 5.5);

for (const seg of spec.segments) {
  const f = path.resolve(ROOT, seg.frame);
  if (!fs.existsSync(f)) { console.error(`帧不存在: ${seg.frame}`); process.exit(1); }
  seg.frame = f;
}

fs.mkdirSync(OUT, { recursive: true });
const work = path.join(OUT, '.work'); fs.mkdirSync(work, { recursive: true });
const log = (n) => path.join(ROOT, 'History', 'runs', '_logs', `pk_${n}.log`);
const t0 = Date.now();
const tick = (label, ms) => console.log(`  [${String(ms).padStart(5)}ms] ${label}`);
const fmtT = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.round(s % 60)).padStart(2, '0')}`;

console.log(`[pk] ${spec.segments.length} 段 / 音色 ${VOICE} ${RATE} / GAP ${GAP}s`);

// ---------- ① TTS ----------
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

// ---------- ② 时间轴推导（同 make_digest 模型）----------
const U = [T_DUR, ...durs, E_DUR];
const S = []; let acc = 0;
for (const u of U) { S.push(acc); acc += u + GAP; }
const audioTotal = acc - GAP;
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
const fGAP = Math.round(GAP * FPS);
const fOff = C.map((s) => Math.round(s * FPS));
const fTotal = Math.round(videoTotal * FPS);
const fV = fOff.map((o, k) => (k < N - 1 ? fOff[k + 1] + fGAP - o : fTotal - o));
for (let k = 0; k < N; k++) {
  if (fV[k] < fGAP + 2) { console.error(`片段${k}帧数过短 (${fV[k]}帧 < 转场${fGAP}帧)`); process.exit(1); }
}
const totalDrift = Math.max(...fV.map((f, k) => Math.abs(f / FPS - V[k])));
console.log(`  帧对齐：${fTotal} 帧 / 单段最大量化偏差 ${(totalDrift * 1000).toFixed(1)}ms`);
console.log(`  时间轴：成片 ${videoTotal.toFixed(1)}s（片头 ${T_DUR}s + 解说 ${durs.reduce((a, b) => a + b, 0).toFixed(1)}s + 片尾 ${E_DUR}s）`);

// ---------- ③ 片段渲染（Ken Burns）----------
t = Date.now();
const clips = [];
const UPW = W * 4, UPH = H * 4;
const KBW = W * 2, KBH = H * 2;
for (let k = 0; k < N; k++) {
  const c = path.join(work, `c${String(k).padStart(2, '0')}.mp4`);
  const nF = fV[k];
  if (k === 0 || k === N - 1) {
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
    const r = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-i', spec.segments[k - 1].frame,
      '-vf', vf, '-frames:v', String(nF),
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', c], log(`clip_${k}`));
    if (r.status !== 0) { console.error(`片段${k}渲染失败: ${(r.text || '').slice(-200)}`); process.exit(1); }
  }
  clips.push(c);
}
tick(`片段渲染 ${N} 个`, Date.now() - t);

// ---------- ④ 音频拼接 ----------
t = Date.now();
const parts = [];
const sil = (d, name) => {
  const f = path.join(work, name);
  ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo',
    '-t', String(d), '-c:a', 'pcm_s16le', f], log(`sil_${name}`));
  return f;
};
parts.push(sil(T_DUR, 'lead.wav'));
parts.push(sil(GAP, 'glead.wav'));
for (let i = 0; i < durs.length; i++) {
  parts.push(path.join(work, `s${i}.wav`));
  parts.push(sil(GAP, `g${i}.wav`));
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

// ---------- ⑤ 字幕/角标/引语 ASS ----------
t = Date.now();
const ass = [];
ass.push('[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${W}`, `PlayResY: ${H}`, 'WrapStyle: 2', 'ScaledBorderAndShadow: yes', '');
ass.push('[V4+ Styles]',
  'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
  `Style: Narr,SimHei,40,&H00FFFFFF,&H00FFFFFF,&H00141414,&HC8000000,1,0,0,0,100,100,0,0,1,2.4,1.0,2,42,42,32,1`,
  `Style: TL,SimHei,25,&H00E8F4FF,&H00E8F4FF,&HB4141414,&H64000000,1,0,0,0,100,100,0,0,3,10,0,7,22,22,18,1`,
  `Style: TR,SimHei,23,&H00E8F4FF,&H00E8F4FF,&HB4141414,&H64000000,0,0,0,0,100,100,0,0,3,8,0,9,22,22,18,1`,
  `Style: Spk,SimHei,24,&H00FFE08A,&H00FFE08A,&HB4141414,&H64000000,1,0,0,0,100,100,0,0,1,2,0,8,40,40,58,1`,
  `Style: Qt,SimHei,21,&H00E8F4FF,&H00E8F4FF,&HB4141414,&H64000000,0,0,0,0,100,100,0,0,1,1.6,0,8,60,60,96,1`,
  `Style: T1,SimHei,72,&H00FFFFFF,&H00FFFFFF,&H00141414,&HC8000000,1,0,0,0,100,100,0,0,1,3,0,5,0,0,0,1`,
  `Style: T2,SimHei,38,&H00E8F4FF,&H00E8F4FF,&H00141414,&HC8000000,0,0,0,0,100,100,0,0,1,2,0,5,0,0,0,1`,
  `Style: T3,SimHei,26,&H00B4B4B4,&H00B4B4B4,&H00141414,&HC8000000,0,0,0,0,100,100,0,0,1,1.5,0,5,0,0,0,1`, '');
ass.push('[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text');
const ts = (s) => `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${(s % 60).toFixed(2).padStart(5, '0')}`;
const ev = (st, a, b, text) => ass.push(`Dialogue: 0,${ts(a)},${ts(b)},${st},,0,0,0,,${text}`);

for (const ln of spec.title_card?.lines || []) ev(ln.style || 'T1', 0.2, T_DUR - 0.1, ln.text);
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
let lastTopic = null;
for (let i = 0; i < spec.segments.length; i++) {
  const seg = spec.segments[i];
  const Ck = C[i + 1], dur = durs[i];
  const segs = chunk(seg.text);
  const chars = segs.reduce((n, s) => n + s.length, 0) || 1;
  let c0 = Ck;
  segs.forEach((s, j) => {
    const d = (dur * s.length) / chars;
    ev('Narr', c0, j === segs.length - 1 ? Ck + dur : c0 + d + 0.02, s);
    c0 += d;
  });
  if (seg.topic && seg.topic !== lastTopic) {
    ev('TL', Ck, Ck + dur + GAP, `◆ ${seg.topic}`);
    lastTopic = seg.topic;
  }
  if (seg.speaker) ev('Spk', Ck, Ck + dur, seg.speaker);
  if (seg.quote_en) ev('Qt', Ck, Ck + dur, seg.quote_en);
}
for (const ln of spec.end_card?.lines || []) ev(ln.style || 'T2', C[N - 1] + 0.2, videoTotal - 0.1, ln.text);
const assPath = path.join(OUT, 'pk.ass');
fs.writeFileSync(assPath, ass.join('\n') + '\n');
tick('ASS 字幕+引语层', Date.now() - t);

// ---------- ⑥ xfade 合成 ----------
t = Date.now();
const fcs = [];
let inputs = [];
for (const c of clips) inputs.push(['-i', c]);
inputs.push(['-i', speech]);
fcs.push(`[0:v]format=yuv420p[v0]`);
for (let k = 1; k < N; k++) {
  fcs.push(`[${k}:v]format=yuv420p[v${k}]`);
  const off = (fOff[k] / FPS).toFixed(3);
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

// ---------- ⑦ SRT / manifest / 简介物料 ----------
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

const descLines = [];
descLines.push(spec.desc_head || '');
descLines.push('');
descLines.push('【原声出处】（引语均为原话，无断章取义；右上角时间为该演讲内位置）');
for (const s of spec.sources || []) descLines.push(`· ${s.name} → https://www.bilibili.com/video/${s.bvid}`);
if (spec.desc_tail) { descLines.push(''); descLines.push(spec.desc_tail); }
fs.writeFileSync(path.join(OUT, 'desc_publish.txt'), descLines.join('\n') + '\n');

const manifest = {
  generated_at: new Date().toISOString(),
  tool: 'Tool/ops/make_pk.mjs',
  spec: path.relative(ROOT, SPEC),
  duration_s: Number(finalDur.toFixed(2)),
  voice: { engine: 'edge-tts', name: VOICE, rate: RATE },
  segments: spec.segments.map((s, i) => ({
    speaker: s.speaker || null, topic: s.topic || null, quote_en: s.quote_en || null,
    src_t: s.src_t ?? null, tts_dur: Number(durs[i].toFixed(2)), pk_t: Number(C[i + 1].toFixed(2)),
  })),
  sources: spec.sources || [],
  timings_ms: { total: Date.now() - t0 },
};
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`\n[pk] 完成 ${path.relative(ROOT, final)}  总耗时 ${((Date.now() - t0) / 1000).toFixed(0)}s`);
