#!/usr/bin/env node
/**
 * make_essay.mjs — loop23：《光偷走的那两小时》渲染主链
 *
 * ⚠ 冻结快照（2026-11-02）：本文件是该片定版时的原样，仅为复现留档，不再维护。
 *   现行版本已升格为 `Tool/ops/make_essay.mjs`（参数化 --spec/--out/--work/--no-bgm，
 *   补了 spec 前置校验、逐 clip 时长校验、无 tts/无音效的降级分支）。改逻辑请改 ops 那份。
 *
 * 架构（吸取坑17）：①逐 shot 串行渲染视频 clip（zoompan+叙事调色）→ ②concat demuxer 拼接
 * → ③音频分级预混（TTS/音效/BGM 三组）→ ④烧字幕+封装 → ⑤视频流时长校验。
 *
 * 用法: node make_essay.mjs [--reuse-tts]
 * 产物: Prototype/loop23_shortfilm/out/final.mp4
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ffmpeg, FP, run, durationOf, hasFilter, ROOT } from '../../Tool/lib/ff.mjs';


// EdgeTTS 从 asr 模块目录解析（与 make_digest 一致）
const req = createRequire(path.join(ROOT, 'Workspace', 'deps', 'asr', 'index.cjs'));
const { EdgeTTS } = req('@andresaya/edge-tts');

const DIR = path.join(ROOT, 'Prototype/loop23_shortfilm');
const SPEC = JSON.parse(fs.readFileSync(path.join(DIR, 'spec.json'), 'utf8'));
const OUT = path.join(DIR, 'out');
const WORK = path.join(DIR, '.work');
const IMG = path.join(ROOT, SPEC.img_dir);
const REUSE = process.argv.includes('--reuse-tts');
const { W, H, FPS } = { W: 1920, H: 1080, FPS: 30 };
const log = (n) => path.join(ROOT, 'History/runs/_logs', `essay_${n}.log`);
const tick = (msg, ms) => console.log(`[${((ms) / 1000).toFixed(1)}s] ${msg}`);

if (!REUSE) fs.rmSync(WORK, { recursive: true, force: true });
fs.mkdirSync(WORK, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

// ---------- ① TTS ----------
const t0 = Date.now();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const synth = async (text, wav) => {
  for (let i = 0; i < 4; i++) {
    try {
      const tts = new EdgeTTS();
      await tts.synthesize(text, SPEC.voice.name, { rate: SPEC.voice.rate });
      fs.writeFileSync(wav, await tts.toBuffer());
      return;
    } catch (e) {
      if (i === 3) throw e;
      console.log(`  TTS 失败（${String(e.message || e).slice(0, 60)}），${8 + i * 8}s 后重试`);
      await sleep((8 + i * 8) * 1000);
    }
  }
};
const voiceShots = SPEC.shots.filter(s => s.tts);
const durs = {};
for (const s of voiceShots) {
  const wav = path.join(WORK, `${s.id}.wav`);
  if (!(REUSE && fs.existsSync(wav))) await synth(s.tts, wav);
  ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-i', wav, '-ac', '2', '-ar', '48000', '-c:a', 'pcm_s16le', wav], log(`tts_${s.id}`));
  durs[s.id] = durationOf(wav, log(`tdur_${s.id}`));
}
tick(`TTS ${voiceShots.length} 段`, Date.now() - t0);

// ---------- ② 时间轴 ----------
let T = 0;
for (const s of SPEC.shots) {
  s.start = T;
  s.dur_a = s.tts ? Math.max(s.dur, durs[s.id] + 0.8) : s.dur;
  T += s.dur_a;
}
const TOTAL = T;
console.log(`时间轴 ${TOTAL.toFixed(2)}s，${SPEC.shots.length} 个镜头`);

// ---------- ③ 逐 shot 渲染视频 clip ----------
const t1 = Date.now();
const HAS_CT = hasFilter('colortemperature', log('ct_probe'));
const clips = [];
for (const s of SPEC.shots) {
  const clip = path.join(WORK, `${s.id}.mp4`);
  clips.push(clip);
  const frames = Math.round(s.dur_a * FPS);
  const encode = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p', '-an'];
  let vfilter;
  if (s.kind === 'black') {
    vfilter = null;
    const rb = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `color=c=black:s=${W}x${H}:r=${FPS}`, '-t', s.dur_a.toFixed(3), ...encode, clip], log(s.id));
    if (rb.status !== 0) { console.error(`clip ${s.id} 失败`); process.exit(1); }
  } else if (s.kind === 'card' || s.kind === 'info') {
    // 版式卡：整屏静帧（沿用设计原色，不套色温）
    const rc = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-loop', '1', '-framerate', String(FPS), '-t', s.dur_a.toFixed(3),
      '-i', path.join(ROOT, SPEC.card_dir, s.card), '-vf', `scale=${W}:${H},setsar=1`, ...encode, clip], log(s.id));
    if (rc.status !== 0) { console.error(`clip ${s.id} 失败（card: ${s.card}）`); process.exit(1); }
  } else {
    // 图片：裁掉底部水印带 → 放大给 zoompan 空间 → 运动叙事 → 色温
    const ct = HAS_CT && s.k ? `,colortemperature=temperature=${s.k}` : '';
    const zf = frames;
    let zexpr;
    switch (s.zoom) {
      case 'in':    zexpr = `zoompan=z='min(1+0.0009*on,1.10)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`; break;
      case 'out':   zexpr = `zoompan=z='max(1.10-0.0009*on,1.0)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`; break;
      case 'pan-l': zexpr = `zoompan=z='1.10':x='(iw-iw/zoom)*(1-on/${zf})':y='(ih-ih/zoom)/2'`; break;
      case 'pan-r': zexpr = `zoompan=z='1.10':x='(iw-iw/zoom)*(on/${zf})':y='(ih-ih/zoom)/2'`; break;
      default:      zexpr = `zoompan=z='1.0':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`;
    }
    vfilter = `crop=1536:864:0:0,scale=2400:1350,${zexpr}:d=1:s=${W}x${H}:fps=${FPS},setsar=1${ct}`;
    const r = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-loop', '1', '-framerate', String(FPS), '-t', s.dur_a.toFixed(3),
      '-i', path.join(IMG, s.img), '-vf', vfilter, ...encode, clip], log(s.id));
    if (r.status !== 0) { console.error(`clip ${s.id} 失败`); process.exit(1); }
  }
}
tick(`${SPEC.shots.length} 个 clip`, Date.now() - t1);

// ---------- ④ concat（demuxer，同参数 copy）----------
const t2 = Date.now();
const listFile = path.join(WORK, 'concat.txt');
fs.writeFileSync(listFile, clips.map(c => `file '${c.replace(/\\/g, '/')}'`).join('\n'));
const vconcat = path.join(WORK, 'video_concat.mp4');
{
  const r = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', vconcat], log('concat'));
  if (r.status !== 0) { console.error('concat 失败'); process.exit(1); }
}
const vd = Number(String(run(FP, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=duration', '-of', 'csv=p=0', vconcat], log('vd')).text || '').trim());
if (Math.abs(vd - TOTAL) > 0.3) { console.error(`视频流校验失败 ${vd} ≠ ${TOTAL}`); process.exit(1); }
tick(`concat 校验 ${vd.toFixed(2)}s`, Date.now() - t2);

// ---------- ⑤ 音频分级预混 ----------
const t3 = Date.now();
const WHOOSH = path.join(ROOT, 'Prototype/loop17_edit_research/demo/whoosh.wav');
const IMPACT = path.join(ROOT, 'Prototype/loop17_edit_research/demo/impact.wav');
// 5a：voice 组
let fc = '', voiceIn = [];
voiceShots.forEach((s, i) => {
  const d = Math.round((s.start + 0.3) * 1000);
  fc += `[${i}:a]aformat=sample_rates=48000:channel_layouts=stereo,adelay=${d}|${d}[v${i}];`;
  voiceIn.push(`[v${i}]`);
});
fc += `${voiceIn.join('')}amix=inputs=${voiceIn.length}:normalize=0[voice];[voice]asplit=2[voiceSc][voiceMix];`;
// 5b：sfx 组（切点 whoosh / 章节首 impact）
const wBr = [], pBr = [];
const IW = voiceShots.length;
SPEC.shots.forEach((s, i) => {
  const d = Math.round(s.start * 1000);
  const isChapStart = i === 0 || SPEC.shots[i - 1].chapter !== s.chapter;
  fc += `[${IW}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=${isChapStart ? 0.42 : 0.3},adelay=${d}|${d}[w${i}];`;
  wBr.push(`[w${i}]`);
  if (isChapStart) {
    fc += `[${IW + 1}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=0.5,adelay=${d}|${d}[p${i}];`;
    pBr.push(`[p${i}]`);
  }
});
fc += `${wBr.join('')}amix=inputs=${wBr.length}:normalize=0[wmix];`;
fc += `${pBr.join('')}amix=inputs=${Math.max(pBr.length, 1)}:normalize=0[pmix];`;
// 5c：BGM 合成 pad（原创，无版权问题）：低频 drone + 空气噪声
fc += `sine=frequency=55:duration=${TOTAL.toFixed(2)}[s1];sine=frequency=110:duration=${TOTAL.toFixed(2)}[s2];`
  + `[s1][s2]amix=2,tremolo=f=0.13:d=0.35,volume=0.5[pad];`
  + `anoisesrc=color=pink:duration=${TOTAL.toFixed(2)}:amplitude=0.5,highpass=f=300,lowpass=f=2500,volume=0.10[air];`
  + `[pad][air]amix=2,afade=t=in:d=6,volume=0.9[bgm];`;
// 5d：bgm ducking + 总混
fc += `[bgm][voiceSc]sidechaincompress=threshold=0.02:ratio=6:attack=80:release=500[duck];`
  + `[duck][voiceMix]amix=2:normalize=0[wv];`
  + `[wv][wmix][pmix]amix=3:normalize=0,apad=whole_dur=${TOTAL.toFixed(2)},loudnorm=I=-16:TP=-1.5:LRA=11[aout]`;

const argsA = voiceShots.map(s => ['-i', path.join(WORK, `${s.id}.wav`)]).flat();
argsA.push('-i', WHOOSH, '-i', IMPACT,
  '-filter_complex', fc, '-map', '[aout]', '-t', TOTAL.toFixed(3),
  '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', path.join(WORK, 'mix.wav'));
{
  const r = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', ...argsA], log('amix'));
  if (r.status !== 0) { console.error('音频混音失败:', (r.text || '').slice(-300)); process.exit(1); }
}
tick('音频预混', Date.now() - t3);

// ---------- ⑥ ASS 字幕（日记层 + 花字层）----------
const ass = [`[Script Info]`, `ScriptType: v4.00+`, `PlayResX: ${W}`, `PlayResY: ${H}`, ``,
`[V4+ Styles]`,
`Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding`,
// 日记层字幕：底部，白，细描边
`Style: Cap,Microsoft YaHei,46,&H00F0F0F0,&H00F0F0F0,&H00101010,&H80000000,0,0,0,0,100,100,1,0,1,2,1,2,80,80,52,1`,
// 花字：中上，橙，弹出
`Style: Num,Microsoft YaHei,120,&H0035A0FF,&H0035A0FF,&H00202020,&H80000000,1,0,0,0,100,100,2,0,1,3,0,8,60,60,180,1`,
``,
`[Events]`,
`Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`];
const fmtT = (sec) => {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return `${h}:${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
};
for (const s of SPEC.shots) {
  if (s.tts) {
    const end = Math.min(s.start + s.dur_a - 0.15, s.start + 0.3 + durs[s.id] + 0.35);
    ass.push(`Dialogue: 0,${fmtT(s.start + 0.3)},${fmtT(end)},Cap,,0,0,0,,${s.tts}`);
  }
  for (const o of s.overlays || []) {
    const st = s.start + o.at, en = Math.min(st + o.dur, s.start + s.dur_a - 0.05);
    ass.push(`Dialogue: 1,${fmtT(st)},${fmtT(en)},Num,,0,0,0,,{\\an8\\pos(960,200)\\fscx40\\fscy40\\t(0,180,\\fscx105\\fscy105)\\t(180,280,\\fscx100\\fscy100)\\fad(0,260)}${o.text}`);
  }
}
const assPath = path.join(WORK, 'essay.ass');
fs.writeFileSync(assPath, ass.join('\n'), 'utf8');

// ---------- ⑦ 终合成：concat 视频 + 字幕 + 音轨 ----------
const t4 = Date.now();
const final = path.join(OUT, 'final.mp4');
const assEsc = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');
{
  const r = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-i', vconcat, '-i', path.join(WORK, 'mix.wav'),
    '-vf', `subtitles='${assEsc}'`, '-map', '0:v', '-map', '1:a',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-movflags', '+faststart', final], log('final'));
  if (r.status !== 0) { console.error('终合成失败:', (r.text || '').slice(-300)); process.exit(1); }
}
const fd = Number(String(run(FP, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=duration', '-of', 'csv=p=0', final], log('fd')).text || '').trim());
if (Math.abs(fd - TOTAL) > 0.3) { console.error(`成片视频流校验失败 ${fd} ≠ ${TOTAL}`); process.exit(1); }
tick(`成片 ${fd.toFixed(2)}s（视频流校验通过）`, Date.now() - t4);

// manifest
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({
  title: SPEC.title, total_s: Number(fd.toFixed(2)),
  voice: SPEC.voice, shots: SPEC.shots.map(s => ({ id: s.id, start: Number(s.start.toFixed(2)), dur: Number(s.dur_a.toFixed(2)), chapter: s.chapter, has_tts: !!s.tts })),
}, null, 1));
console.log('完成 →', final);
