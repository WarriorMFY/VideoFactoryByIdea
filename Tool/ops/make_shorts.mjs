#!/usr/bin/env node
/**
 * make_shorts.mjs — 微稿流水线：一条命令从「3 句话」到「可投放包」
 *
 * 为什么要它（loop13 WP4）：赛马要一次做 2–3 条，单稿 15 步手工命令撑不住。
 * 这里把 loop12 摸索出来的分散动作串成一条链，输入只剩**文本**，其余全部自动：
 *
 *   3 句文本 → Edge TTS（逐句，去首尾静音）→ 精确拼轨 → SRT → 循环铺画面 + 硬字幕
 *           → 封面（走 make_cover.mjs v2，S1–S6 规范）→ 打包 + 耗时清单
 *
 * 复用而非重写：画面铺法（stream_loop + scale/crop + 显式 -map）与口播时长累加
 * 全部沿用 `Tool/ops/make_episode.mjs` 的做法，封面直接调 `Tool/ops/make_cover.mjs`。
 *
 * 用法（最短一条）：
 *   node Tool/ops/make_shorts.mjs --topic "剪映自动踩点" \
 *     --lines "剪映里有个自动踩点，很多人从来没用过。||把音乐拖进轨道，点一下自动踩点，节拍点就全标出来了。||卡着点切画面，一条片子五分钟就能剪完。" \
 *     --title "自动踩点|五分钟剪完" --sub "剪映操作·看完就会" --tag "剪辑必看" \
 *     --out Workspace/tmp/shorts_demo
 *
 * 参数：
 *   --lines "a||b||c"   3 句口播（也支持 --script <txt>，一行一句，忽略 # 注释）
 *   --topic "..."       选题名，只进 manifest / 封面副标兜底
 *   --title/--sub/--tag 封面文案（缺省：title 取 topic 前 10 字）
 *   --out <dir>         输出目录（默认 Workspace/tmp/shorts_demo）
 *   --footage <mp4>     画面素材（默认 Big Buck Bunny 1080p 10s，CC-BY 3.0）
 *   --voice <name>      Edge TTS 音色（默认 zh-CN-XiaoxiaoNeural）
 *   --rate "+8%"        语速
 *   --gap 0.18          句间停顿（秒）
 *   --w 1280 --h 720    画幅（竖屏用 --w 720 --h 1280）
 *   --no-subs           不烧字幕（默认烧硬字幕）
 *   --cover-at 4        封面上取帧秒数
 *
 * 产物（<out>/）：
 *   final.mp4        成片（h264 + aac，带硬字幕）
 *   zh.srt           与成片逐句对齐的中文字幕（软字幕版，可直接上传）
 *   cover_16x9.jpg   封面（比例随 --w/--h，4:3 用 --w 960）
 *   lines.txt        实际使用的口播文本（可复现）
 *   manifest.json    逐句时间码 + 每步耗时 + 素材授权
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ffmpeg, durationOf, run, ROOT } from '../lib/ff.mjs';
import { toSrt } from '../lib/srt.mjs';

const args = process.argv.slice(2);
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const T0 = Date.now();

const OUT = path.resolve(ROOT, getOpt('--out', 'Workspace/tmp/shorts_demo'));
const TOPIC = getOpt('--topic', '未命名选题');
const FOOTAGE = path.resolve(ROOT, getOpt('--footage', 'Workspace/assets/Big_Buck_Bunny_1080_10s_5MB.mp4'));
const VOICE = getOpt('--voice', 'zh-CN-XiaoxiaoNeural');
const RATE = getOpt('--rate', '+8%');
const GAP = Number(getOpt('--gap', 0.18));
const W = Number(getOpt('--w', 1280));
const H = Number(getOpt('--h', 720));
const NO_SUBS = args.includes('--no-subs');
const COVER_AT = getOpt('--cover-at', '4');
const TITLE = getOpt('--title', '');
const SUB = getOpt('--sub', '');
const TAG = getOpt('--tag', '');

// ---- 输入 ----
let lines = [];
const inline = getOpt('--lines', '');
const scriptFile = getOpt('--script', '');
if (inline) lines = inline.split('||').map((s) => s.trim()).filter(Boolean);
else if (scriptFile) {
  lines = fs.readFileSync(path.resolve(ROOT, scriptFile), 'utf8')
    .split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith('#'));
} else {
  console.error('必须给 --lines "a||b||c" 或 --script <txt>');
  process.exit(2);
}
if (lines.length < 2 || lines.length > 4) {
  console.error(`微稿只吃 2–4 句（拿到 ${lines.length} 句）。句子多了时长会失控，拆成多条更划算。`);
  process.exit(2);
}
if (!fs.existsSync(FOOTAGE)) { console.error('画面素材不存在:', FOOTAGE); process.exit(1); }

fs.mkdirSync(OUT, { recursive: true });
const work = path.join(OUT, '.work');
fs.mkdirSync(work, { recursive: true });
const log = (n) => path.join(ROOT, 'History', 'runs', '_logs', `shorts_${n}.log`);
const timings = [];
const tick = (label, ms) => { timings.push({ step: label, ms }); console.log(`  [${String(ms).padStart(5)}ms] ${label}`); };

console.log(`[shorts] 选题「${TOPIC}」 ${lines.length} 句 / 画面 ${path.relative(ROOT, FOOTAGE)} / ${W}x${H}`);

// ---- ① Edge TTS（逐句，去首尾静音）----
const require = createRequire(path.join(ROOT, 'Workspace', 'deps', 'asr', 'index.cjs'));
const { EdgeTTS } = require('@andresaya/edge-tts');

let t = Date.now();
const wavs = [];
const durs = [];
for (let i = 0; i < lines.length; i++) {
  const mp3 = path.join(work, `s${i}.mp3`);
  const wav = path.join(work, `s${i}.wav`);
  let ok = false;
  for (let attempt = 0; attempt < 3 && !ok; attempt++) {
    try {
      const tts = new EdgeTTS();
      await tts.synthesize(lines[i], VOICE, { rate: RATE });
      const buf = await tts.toBuffer();
      if (!buf || buf.length < 1000) throw new Error('TTS 输出异常');
      fs.writeFileSync(mp3, buf);
      ok = true;
    } catch { await new Promise((r) => setTimeout(r, 1200)); }
  }
  if (!ok) { console.error(`TTS 失败（第 ${i + 1} 句）`); process.exit(1); }
  const r = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-i', mp3,
    '-af', 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.03,areverse,'
      + 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.03,areverse',
    '-ac', '2', '-ar', '48000', '-c:a', 'pcm_s16le', wav], log(`tts_${i}`));
  if (r.status !== 0) { console.error(`TTS 转码失败（第 ${i + 1} 句）: ${(r.text || '').slice(-200)}`); process.exit(1); }
  wavs.push(wav);
  durs.push(durationOf(wav, log(`dur_${i}`)));
  console.log(`  #${i + 1} ${durs[i].toFixed(2)}s  ${lines[i].slice(0, 30)}`);
}
tick(`TTS ${lines.length} 句`, Date.now() - t);

// ---- ② 拼轨（句间静音长度精确，时间轴才不飘）----
t = Date.now();
const parts = [];
for (let i = 0; i < wavs.length; i++) {
  parts.push(wavs[i]);
  if (i < wavs.length - 1) {
    const sil = path.join(work, `g${i}.wav`);
    ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo',
      '-t', String(GAP), '-c:a', 'pcm_s16le', sil], log(`gap_${i}`));
    parts.push(sil);
  }
}
const speech = path.join(work, 'speech.wav');
const listTxt = path.join(work, 'audio_list.txt');
fs.writeFileSync(listTxt, parts.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n'));
{
  const r = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', listTxt,
    '-c:a', 'pcm_s16le', speech], log('concat'));
  if (r.status !== 0) { console.error('音频拼接失败:', (r.text || '').slice(-200)); process.exit(1); }
}
const total = durationOf(speech, log('total'));
tick(`拼轨 ${total.toFixed(2)}s`, Date.now() - t);

// ---- ③ 字幕（时间码 = TTS 实测时长累加，与音频同源）----
// 一句 8 秒、40 多字压成一块字幕，屏幕上根本读不完（首版实测：末 12 字直接看不到）。
// 所以按标点切块，每块 ≤MAX_CHARS 字、独占一个 cue，时长按字数在句内均摊。
t = Date.now();
const MAX_CHARS = 14;
const SOFT_CHARS = 19; // 单个分句略长时宁可整块显示，也不要在词中间断（首版曾切出「音轨上/了」）
function chunk(line) {
  const clauses = line.split(/(?<=[，。、！？；：,.!?;:])/).filter(Boolean);
  const segs = [];
  for (const c of clauses) {
    if (c.length <= MAX_CHARS) {
      const last = segs[segs.length - 1];
      if (last && last.length + c.length <= MAX_CHARS) segs[segs.length - 1] += c;
      else segs.push(c);
    } else if (c.length <= SOFT_CHARS) {
      segs.push(c);
    } else {
      for (let i = 0; i < c.length; i += MAX_CHARS) segs.push(c.slice(i, i + MAX_CHARS));
    }
  }
  return segs;
}
const cues = [];   // 字幕块（用于 SRT）
const sentences = []; // 整句（用于 manifest / 后续对齐）
let cursor = 0;
for (let i = 0; i < lines.length; i++) {
  const segs = chunk(lines[i]);
  const chars = segs.reduce((n, s) => n + s.length, 0) || 1;
  let c0 = cursor;
  segs.forEach((s, k) => {
    const d = (durs[i] * s.length) / chars;
    // 块尾直接接到下一块起点，避免 27ms 级空隙让字幕闪烁
    const end = k === segs.length - 1 ? cursor + durs[i] : c0 + d;
    cues.push({ start: c0, end, zh: s });
    c0 = end;
  });
  sentences.push({ idx: i, start: Number(cursor.toFixed(3)), end: Number((cursor + durs[i]).toFixed(3)), text: lines[i] });
  cursor += durs[i] + (i < lines.length - 1 ? GAP : 0);
}
const srt = toSrt(cues, (c) => [c.zh]);
const srtPath = path.join(OUT, 'zh.srt');
fs.writeFileSync(srtPath, srt);
tick('字幕 SRT', Date.now() - t);

// ---- ④ 画面 + 硬字幕 ----
t = Date.now();
// 注意：必须显式 -map。素材自带音轨，ffmpeg 默认流选择会挑它（loop12 踩过：ASR 0 词）
const vf = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=30`;
// libass 对 SRT 默认 PlayResY=288，Fontsize/MarginV 都按 288 高计再等比放大到成片
// （首版直接写像素值，字号被放大 2.5 倍、16 字撑爆全屏）。12*720/288≈30px @720p。
const style = 'FontName=SimHei,Fontsize=12,PrimaryColour=&H00FFFFFF,'
  + 'OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=0,Alignment=2,MarginV=18';
const filt = NO_SUBS ? vf : `${vf},subtitles='${path.relative(ROOT, srtPath).replace(/\\/g, '/')}':force_style='${style}'`;
const final = path.join(OUT, 'final.mp4');
const rv = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y',
  '-stream_loop', '-1', '-i', FOOTAGE, '-i', speech,
  '-map', '0:v:0', '-map', '1:a:0', '-t', total.toFixed(3),
  '-vf', filt,
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2',
  '-movflags', '+faststart', final], log('mux'));
if (rv.status !== 0) { console.error('合成失败:', (rv.text || '').slice(-400)); process.exit(1); }
const finalDur = durationOf(final, log('fdur'));
tick(`画面合成 ${finalDur.toFixed(2)}s`, Date.now() - t);

// ---- ⑤ 封面（复用 make_cover v2）----
t = Date.now();
const cover = path.join(OUT, 'cover_16x9.jpg');
// 封面取帧用**原素材**而不是成片：成片全程带硬字幕，标题会和字幕叠在一起（首版实测）。
// 成片画面本来就是素材循环铺的，取帧内容一致。
const coverAtSec = Number(COVER_AT) % Math.max(1, durationOf(FOOTAGE, log('fdur')));
const coverArgs = ['Tool/ops/make_cover.mjs', '--video', path.relative(ROOT, FOOTAGE), '--out', path.relative(ROOT, cover),
  '--w', String(W), '--h', String(H), '--at', coverAtSec.toFixed(2),
  '--title', TITLE || TOPIC.slice(0, 10), '--fs', '0.19', '--tcolor', 'yellow', '--stroke', '0.014'];
if (SUB) coverArgs.push('--sub', SUB);
if (TAG) coverArgs.push('--tag', TAG);
const rc = run(process.execPath, coverArgs, log('cover'));
if (rc.status !== 0) { console.error('封面失败:', (rc.text || '').slice(-300)); process.exit(1); }
console.log('  ' + (rc.text || '').trim().split('\n').pop());
tick('封面', Date.now() - t);

// ---- ⑥ 打包 ----
fs.writeFileSync(path.join(OUT, 'lines.txt'), lines.join('\n') + '\n');
const manifest = {
  generated_at: new Date().toISOString(),
  topic: TOPIC,
  pitch: { w: W, h: H, fps: 30 },
  duration_s: Number(finalDur.toFixed(3)),
  lines: sentences,
  subtitle_cues: cues.length,
  voice: { engine: 'edge-tts', name: VOICE, rate: RATE, gap_s: GAP },
  footage: { file: path.relative(ROOT, FOOTAGE), license: 'CC-BY 3.0 (Blender Foundation)' },
  hard_subs: !NO_SUBS,
  cover: { file: path.basename(cover), title: TITLE, sub: SUB, tag: TAG },
  timings_ms: timings,
  total_ms: Date.now() - T0,
  note: '时间码由 Edge TTS 实测时长累加，与音轨同源；不转载任何外部版权素材',
};
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
fs.rmSync(work, { recursive: true, force: true });

console.log(`[shorts] 成片 ${path.relative(ROOT, final)} ${finalDur.toFixed(2)}s ${W}x${H}`);
console.log(`[shorts] 字幕 ${path.relative(ROOT, srtPath)}｜封面 ${path.relative(ROOT, cover)}`);
console.log(`[shorts] 总耗时 ${((Date.now() - T0) / 1000).toFixed(1)}s（${timings.map((x) => `${x.step} ${(x.ms / 1000).toFixed(1)}s`).join(' / ')}）`);
