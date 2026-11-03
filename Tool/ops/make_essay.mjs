#!/usr/bin/env node
/**
 * make_essay.mjs — 散文影像（essay film）成片渲染主链（loop23 升格版）
 *
 * 输入：一个 spec.json（镜头表 + 旁白 + 色温 + 运动 + 花字）+ 图片目录 + 版式卡目录
 * 输出：final.mp4 + manifest.json
 *
 * 架构（坑 17 的教训，别改回单 filter_complex 单图多分支）：
 *   ① TTS 逐段合成 → ② 排时间轴 → ③ 逐 shot 串行渲染 clip（zoompan 运动 + colortemperature 叙事调色）
 *   → ④ concat demuxer 拼接 + **视频流时长校验** → ⑤ 音频三级预混（voice / sfx / BGM ducking）
 *   → ⑥ 生成 ASS 双层字幕（日记层 + 花字层）→ ⑦ 终合成 → ⑧ 视频流时长校验
 *
 * 用法：
 *   node Tool/ops/make_essay.mjs                       # 跑默认 spec（loop23《光偷走的那两小时》）
 *   node Tool/ops/make_essay.mjs --spec <spec.json> --out <outDir>
 *   node Tool/ops/make_essay.mjs --reuse-tts           # 复用 --work 下已有 wav（跨目录要先拷 wav，坑 18）
 *   node Tool/ops/make_essay.mjs --no-bgm --crf 20     # 关闭 BGM / 调画质
 *
 * 参数：
 *   --spec <path>    spec 路径，默认 Prototype/loop23_shortfilm/spec.json
 *   --out  <dir>     成片目录，默认 <spec 所在目录>/out
 *   --work <dir>     中间件目录（TTS wav / clip / mix.wav），默认 <spec 所在目录>/.work
 *   --reuse-tts      保留 --work 并复用已有 tts wav
 *   --no-bgm         不合成 BGM pad（只留人声 + 音效）
 *   --crf  <n>       画质，默认 19
 *   --preset <p>     x264 preset，默认 veryfast
 *
 * 只读约定：不联网、不发布；素材（图片/版式卡）必须由调用方预先备好。
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ffmpeg, FP, run, durationOf, hasFilter, ROOT } from '../lib/ff.mjs';

// ---------- 参数 ----------
const argv = process.argv.slice(2);
const opt = (name, dv) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dv;
};
const flag = (name) => argv.includes(`--${name}`);
const abs = (p) => (path.isAbsolute(p) ? p : path.join(ROOT, p));

const SPEC_PATH = abs(opt('spec', 'Prototype/loop23_shortfilm/spec.json'));
if (!fs.existsSync(SPEC_PATH)) {
  console.error(`spec 不存在: ${SPEC_PATH}`);
  process.exit(1);
}
const SPEC = JSON.parse(fs.readFileSync(SPEC_PATH, 'utf8'));
const SPEC_DIR = path.dirname(SPEC_PATH);
const OUT = abs(opt('out', path.join(SPEC_DIR, 'out')));
const WORK = abs(opt('work', path.join(SPEC_DIR, '.work')));
const REUSE = flag('reuse-tts');
const BGM = !flag('no-bgm');
const CRF = String(opt('crf', '19'));
const PRESET = opt('preset', 'veryfast');

const [W, H] = String(SPEC.size || '1920x1080').split('x').map(Number);
const FPS = Number(SPEC.fps || 30);
if (!W || !H) { console.error('spec.size 非法，应形如 "1920x1080"'); process.exit(1); }

const IMG_DIR = SPEC.img_dir ? abs(SPEC.img_dir) : null;
const CARD_DIR = SPEC.card_dir ? abs(SPEC.card_dir) : null;

const logDir = path.join(ROOT, 'History/runs/_logs');
fs.mkdirSync(logDir, { recursive: true });
const log = (n) => path.join(logDir, `essay_${n}.log`);
const t0 = Date.now();
const tick = (msg) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${msg}`);
const die = (msg) => { console.error(msg); process.exit(1); };

// spec 前置校验：id 唯一、kind 合法、素材在位
const KINDS = new Set(['img', 'card', 'info', 'black']);
const seen = new Set();
for (const s of SPEC.shots) {
  if (!s.id) die('shot 缺 id');
  if (seen.has(s.id)) die(`shot id 重复: ${s.id}`);
  seen.add(s.id);
  if (!KINDS.has(s.kind)) die(`shot ${s.id} kind 非法: ${s.kind}`);
  if ((s.kind === 'img') && !s.img) die(`shot ${s.id} 缺 img`);
  if ((s.kind === 'card' || s.kind === 'info') && !s.card) die(`shot ${s.id} 缺 card`);
  if (s.kind === 'img' && IMG_DIR && !fs.existsSync(path.join(IMG_DIR, s.img))) die(`图片不存在: ${s.img}`);
  if ((s.kind === 'card' || s.kind === 'info') && CARD_DIR && !fs.existsSync(path.join(CARD_DIR, s.card))) die(`版式卡不存在: ${s.card}`);
}

if (!REUSE) fs.rmSync(WORK, { recursive: true, force: true });
fs.mkdirSync(WORK, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

// ---------- ① TTS ----------
const voiceShots = SPEC.shots.filter((s) => s.tts);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (voiceShots.length) {
  const req = createRequire(path.join(ROOT, 'Workspace', 'deps', 'asr', 'index.cjs'));
  const { EdgeTTS } = req('@andresaya/edge-tts');
  const voice = SPEC.voice || {};
  if (!voice.name) die('spec 有 tts 但缺 voice.name');
  const synth = async (text, wav) => {
    for (let i = 0; i < 4; i++) {
      try {
        const tts = new EdgeTTS();
        await tts.synthesize(text, voice.name, { rate: voice.rate || '+0%' });
        fs.writeFileSync(wav, await tts.toBuffer());
        return;
      } catch (e) {
        if (i === 3) die(`TTS 连续失败: ${String(e.message || e).slice(0, 120)}`);
        const wait = 8 + i * 8;
        console.log(`  TTS 失败（${String(e.message || e).slice(0, 60)}），${wait}s 后重试`);
        await sleep(wait * 1000);
      }
    }
  };
  for (const s of voiceShots) {
    const wav = path.join(WORK, `${s.id}.wav`);
    if (!(REUSE && fs.existsSync(wav))) {
      // 两段式：先落 raw，再转 48k/双声道 pcm —— 直接 ffmpeg -i a.wav … a.wav 会被
      // 拒绝（"same as Input #0 - exiting"），而这类失败在只看末行日志时极易被忽略。
      const raw = path.join(WORK, `${s.id}.raw.wav`);
      await synth(s.tts, raw);
      const r = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-i', raw, '-ac', '2', '-ar', '48000', '-c:a', 'pcm_s16le', wav], log(`tts_${s.id}`));
      if (r.status !== 0) die(`tts 归一化失败 ${s.id}: ${(r.text || '').slice(-200)}`);
      fs.rmSync(raw, { force: true });
    }
  }
  for (const s of voiceShots) {
    s._dur = durationOf(path.join(WORK, `${s.id}.wav`), log(`tdur_${s.id}`));
    if (!(s._dur > 0.05)) die(`TTS 音频异常（${s._dur}s）: ${s.id}`);
  }
  tick(`TTS ${voiceShots.length} 段`);
}

// ---------- ② 时间轴 ----------
let T = 0;
for (const s of SPEC.shots) {
  s.start = T;
  s.dur_a = s.tts ? Math.max(Number(s.dur) || 0.5, s._dur + 0.8) : Number(s.dur) || 0.5;
  T += s.dur_a;
}
const TOTAL = T;
console.log(`时间轴 ${TOTAL.toFixed(2)}s，${SPEC.shots.length} 个镜头（${W}x${H}@${FPS}）`);

// ---------- ③ 逐 shot 渲染 clip ----------
const HAS_CT = hasFilter('colortemperature', log('ct_probe'));
if (SPEC.shots.some((s) => s.k) && !HAS_CT) console.log('⚠ 当前 ffmpeg 无 colortemperature 滤镜，色温层全部跳过');
const clips = [];
const encode = ['-c:v', 'libx264', '-preset', PRESET, '-crf', CRF, '-pix_fmt', 'yuv420p', '-an'];
for (const s of SPEC.shots) {
  const clip = path.join(WORK, `${s.id}.mp4`);
  clips.push(clip);
  const frames = Math.max(1, Math.round(s.dur_a * FPS));
  let vfilter = null;
  let input = null;

  if (s.kind === 'black') {
    input = ['-f', 'lavfi', '-i', `color=c=black:s=${W}x${H}:r=${FPS}`];
  } else if (s.kind === 'card' || s.kind === 'info') {
    // 版式卡：整屏静帧，沿用设计原色（不套色温，避免把设计稿调黄/调蓝）
    input = ['-loop', '1', '-framerate', String(FPS), '-i', path.join(CARD_DIR, s.card)];
    vfilter = `scale=${W}:${H},setsar=1`;
  } else {
    // 图片：crop 顶部区域（默认裁掉底部水印带）→ 超采样 → zoompan 运动 → 色温
    const crop = s.crop || SPEC.img_crop || 'crop=1536:864:0:0';
    const ct = HAS_CT && s.k ? `,colortemperature=temperature=${s.k}` : '';
    const zf = frames;
    // pan 运镜支持自定义变焦基数（'pan-d@1.5'）：1.10 时纵向行程只有 10%，长图滚动感不足
    const [zName, zArg] = String(s.zoom || '').split('@');
    const Z = Number(zArg) || 1.10;
    let zexpr;
    switch (zName) {
      case 'in':    zexpr = `zoompan=z='min(1+0.0009*on,1.10)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`; break;
      case 'out':   zexpr = `zoompan=z='max(1.10-0.0009*on,1.0)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`; break;
      case 'pan-l': zexpr = `zoompan=z='${Z}':x='(iw-iw/zoom)*(1-on/${zf})':y='(ih-ih/zoom)/2'`; break;
      case 'pan-r': zexpr = `zoompan=z='${Z}':x='(iw-iw/zoom)*(on/${zf})':y='(ih-ih/zoom)/2'`; break;
      case 'pan-d': zexpr = `zoompan=z='${Z}':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)*(on/${zf})'`; break;   // 纵向下摇：终端日志/代码长图滚动感
      case 'pan-u': zexpr = `zoompan=z='${Z}':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)*(1-on/${zf})'`; break;
      default:      zexpr = `zoompan=z='1.0':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`;
    }
    // 超采样到 2400 宽是必须的：直接 1920 推近 1.10× 等于放大原图，边缘会糊
    vfilter = `${crop},scale=2400:-2,${zexpr}:d=1:s=${W}x${H}:fps=${FPS},setsar=1${ct}`;
    input = ['-loop', '1', '-framerate', String(FPS), '-i', path.join(IMG_DIR, s.img)];
  }

  const args = ['-hide_banner', '-loglevel', 'error', '-y', ...input, '-t', s.dur_a.toFixed(3)];
  if (vfilter) args.push('-vf', vfilter);
  args.push(...encode, clip);
  const r = ffmpeg(args, log(s.id));
  // 每个分支都必须检查状态：漏检查的后果是 concat 静默少片（坑 21 连带）
  if (r.status !== 0) die(`clip ${s.id} 渲染失败: ${(r.text || '').slice(-300)}`);
  const cd = durationOf(clip, log(`cdur_${s.id}`));
  if (Math.abs(cd - s.dur_a) > 0.2) die(`clip ${s.id} 时长漂移 ${cd.toFixed(2)} ≠ ${s.dur_a.toFixed(2)}`);
}
tick(`${SPEC.shots.length} 个 clip`);

// ---------- ④ concat（demuxer，同参数 copy）----------
const listFile = path.join(WORK, 'concat.txt');
fs.writeFileSync(listFile, clips.map((c) => `file '${c.replace(/\\/g, '/')}'`).join('\n'));
const vconcat = path.join(WORK, 'video_concat.mp4');
{
  const r = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', vconcat], log('concat'));
  if (r.status !== 0) die('concat 失败');
}
const probeDur = (f) => Number(String(run(FP, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=duration', '-of', 'csv=p=0', f], log('vd')).text || '').trim());
const vd = probeDur(vconcat);
if (Math.abs(vd - TOTAL) > 0.3) die(`视频流校验失败 ${vd} ≠ ${TOTAL}（容器时长会被音频撑住，必须查视频流）`);
tick(`concat 校验 ${vd.toFixed(2)}s`);

// ---------- ⑤ 音频三级预混 ----------
const WHOOSH = abs(opt('whoosh', 'Prototype/loop17_edit_research/demo/whoosh.wav'));
const IMPACT = abs(opt('impact', 'Prototype/loop17_edit_research/demo/impact.wav'));
const hasWhoosh = fs.existsSync(WHOOSH);
const hasImpact = fs.existsSync(IMPACT);
if (!hasWhoosh || !hasImpact) console.log('⚠ 缺音效素材（whoosh/impact），切点音效降级为无声');

const inArgs = [];
let inN = 0;
const addIn = (p) => { inArgs.push('-i', p); return inN++; };
for (const s of voiceShots) addIn(path.join(WORK, `${s.id}.wav`));   // 0..nv-1
const whooshIdx = hasWhoosh ? addIn(WHOOSH) : -1;
const impactIdx = hasImpact ? addIn(IMPACT) : -1;

let fc = '';
const groups = [];   // 最终要 amix 的分组 label
const AUD = 'aformat=sample_rates=48000:channel_layouts=stereo';

// 5a：人声组
let voiceMixLabel = null;
if (voiceShots.length) {
  const br = [];
  voiceShots.forEach((s, i) => {
    const d = Math.round((s.start + 0.3) * 1000);
    fc += `[${i}:a]${AUD},adelay=${d}|${d}[v${i}];`;
    br.push(`[v${i}]`);
  });
  fc += `${br.join('')}amix=inputs=${br.length}:normalize=0[voice];`;
  fc += `[voice]asplit=2[voiceSc][voiceMix];`;   // 坑 21：label 只能消费一次
  voiceMixLabel = '[voiceMix]';
}

// 5b：音效组（切点 whoosh / 章节首 impact）
if (whooshIdx >= 0) {
  const wBr = [];
  const pBr = [];
  SPEC.shots.forEach((s, i) => {
    const d = Math.round(s.start * 1000);
    const isChapStart = i === 0 || SPEC.shots[i - 1].chapter !== s.chapter;
    fc += `[${whooshIdx}:a]${AUD},volume=${isChapStart ? 0.42 : 0.3},adelay=${d}|${d}[w${i}];`;
    wBr.push(`[w${i}]`);
    if (isChapStart && impactIdx >= 0) {
      fc += `[${impactIdx}:a]${AUD},volume=0.5,adelay=${d}|${d}[p${i}];`;
      pBr.push(`[p${i}]`);
    }
  });
  fc += `${wBr.join('')}amix=inputs=${wBr.length}:normalize=0[wmix];`;
  if (pBr.length) fc += `${pBr.join('')}amix=inputs=${pBr.length}:normalize=0[pmix];`;
}

// 5c：BGM pad（合成，零版权）：55+110Hz drone + 粉噪空气层
if (BGM) {
  fc += `sine=frequency=55:duration=${TOTAL.toFixed(2)}[s1];sine=frequency=110:duration=${TOTAL.toFixed(2)}[s2];`
    + `[s1][s2]amix=2,tremolo=f=0.13:d=0.35,volume=0.5[pad];`
    + `anoisesrc=color=pink:duration=${TOTAL.toFixed(2)}:amplitude=0.5,highpass=f=300,lowpass=f=2500,volume=0.10[air];`
    + `[pad][air]amix=2,afade=t=in:d=6,volume=0.9[bgm];`;
}

// 5d：BGM ducking（人声一来就让位）
if (BGM && voiceMixLabel) {
  fc += `[bgm][voiceSc]sidechaincompress=threshold=0.02:ratio=6:attack=80:release=500[duck];`
    + `[duck]${voiceMixLabel}amix=2:normalize=0[wv];`;
  groups.push('[wv]');
} else if (BGM) {
  groups.push('[bgm]');
} else if (voiceMixLabel) {
  groups.push(voiceMixLabel);
}
if (whooshIdx >= 0) groups.push('[wmix]');
if (hasImpact && fc.includes('[pmix]')) groups.push('[pmix]');
if (!groups.length) die('没有任何可混音的音频源（无 tts、无音效、BGM 已关闭）');

const tail = `apad=whole_dur=${TOTAL.toFixed(2)},loudnorm=I=-16:TP=-1.5:LRA=11[aout]`;
fc += groups.length === 1
  ? `${groups[0]}${tail};`
  : `${groups.join('')}amix=inputs=${groups.length}:normalize=0,${tail};`;

const mixWav = path.join(WORK, 'mix.wav');
{
  const r = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', ...inArgs, '-filter_complex', fc,
    '-map', '[aout]', '-t', TOTAL.toFixed(3), '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', mixWav], log('amix'));
  if (r.status !== 0) die(`音频混音失败: ${(r.text || '').slice(-400)}`);
}
tick('音频预混');

// ---------- ⑥ ASS 双层字幕 ----------
const ass = [
  '[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${W}`, `PlayResY: ${H}`, '',
  '[V4+ Styles]',
  'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
  // 日记层：底部散文旁白，白字细描边
  'Style: Cap,Microsoft YaHei,46,&H00F0F0F0,&H00F0F0F0,&H00101010,&H80000000,0,0,0,0,100,100,1,0,1,2,1,2,80,80,52,1',
  // 花字层：中上橙字，弹出缩放
  'Style: Num,Microsoft YaHei,120,&H0035A0FF,&H0035A0FF,&H00202020,&H80000000,1,0,0,0,100,100,2,0,1,3,0,8,60,60,180,1',
  '', '[Events]',
  'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
];
const fmtT = (sec) => {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return `${h}:${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
};
const esc = (t) => String(t).replace(/[{}]/g, '').replace(/\r?\n/g, '\\N');
for (const s of SPEC.shots) {
  if (s.tts) {
    const st = s.start + 0.3;
    const en = Math.min(s.start + s.dur_a - 0.15, st + s._dur + 0.35);
    if (en > st) ass.push(`Dialogue: 0,${fmtT(st)},${fmtT(en)},Cap,,0,0,0,,${esc(s.tts)}`);
  }
  for (const o of s.overlays || []) {
    const st = s.start + Number(o.at || 0);
    const en = Math.min(st + Number(o.dur || 1), s.start + s.dur_a - 0.05);
    if (en <= st) continue;
    const style = o.style === 'cap' ? 'Cap' : 'Num';
    const anim = style === 'Num' ? '\\an8\\pos(960,200)\\fscx40\\fscy40\\t(0,180,\\fscx105\\fscy105)\\t(180,280,\\fscx100\\fscy100)\\fad(0,260)' : '\\fad(120,200)';
    ass.push(`Dialogue: 1,${fmtT(st)},${fmtT(en)},${style},,0,0,0,,{${anim}}${esc(o.text)}`);
  }
}
const assPath = path.join(WORK, 'essay.ass');
fs.writeFileSync(assPath, ass.join('\n'), 'utf8');

// ---------- ⑦ 终合成 ----------
const final = path.join(OUT, 'final.mp4');
const assEsc = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');
{
  const r = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-i', vconcat, '-i', mixWav,
    '-vf', `subtitles='${assEsc}'`, '-map', '0:v', '-map', '1:a',
    '-c:v', 'libx264', '-preset', PRESET, '-crf', CRF, '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-movflags', '+faststart', final], log('final'));
  if (r.status !== 0) die(`终合成失败: ${(r.text || '').slice(-400)}`);
}
const fd = probeDur(final);
if (Math.abs(fd - TOTAL) > 0.3) die(`成片视频流校验失败 ${fd} ≠ ${TOTAL}`);
const mb = (fs.statSync(final).size / 1048576).toFixed(1);
tick(`成片 ${fd.toFixed(2)}s · ${mb}MB（视频流校验通过）`);

fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({
  title: SPEC.title || path.basename(SPEC_DIR),
  spec: path.relative(ROOT, SPEC_PATH).replace(/\\/g, '/'),
  total_s: Number(fd.toFixed(2)),
  size: `${W}x${H}`, fps: FPS,
  voice: SPEC.voice || null,
  shots: SPEC.shots.map((s) => ({
    id: s.id, start: Number(s.start.toFixed(2)), dur: Number(s.dur_a.toFixed(2)),
    kind: s.kind, chapter: s.chapter || null, k: s.k || null, has_tts: !!s.tts,
  })),
}, null, 1));
console.log('完成 →', final);
