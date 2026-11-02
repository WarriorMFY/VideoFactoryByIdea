#!/usr/bin/env node
// demo_build.mjs — loop17 剪辑创新验证片段（~40s）
//
// 验证的 5 个创新点（调研结论的落地证明）：
//   ① 冷开场 hook：强观点句前置（TEDx 指南 start strong / OpusClip auto hook）
//   ② 真机位片段替代静帧：摘要片的 ASL 从 85s 回到 ~10s 量级（消除与 TED 剪辑语言的 10 倍差距）
//   ③ 硬切 + whoosh 音效替代全软溶解（切点可感知）
//   ④ 关键词字幕强调（keyword accent，OpusClip 同款）
//   ⑤ 章节进度条（常驻，ASS \t 动画）
//
// 用法: node Prototype/loop17_edit_research/demo_build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ffmpeg, FF, ROOT, durationOf } from '../../Tool/lib/ff.mjs';

const OUTDIR = path.join(ROOT, 'Prototype', 'loop17_edit_research', 'demo');
const SRC = path.join(ROOT, 'Workspace', 'tmp', 'ted_feifei', 'talk_720p.mp4');
const LOG = (n) => path.join(ROOT, 'History', 'runs', '_logs', `demo_${n}.log`);
fs.mkdirSync(OUTDIR, { recursive: true });

// ---------- TTS ----------
const req = createRequire(path.join(ROOT, 'Workspace', 'deps', 'asr', 'node_modules', '_req.js'));
const { EdgeTTS } = req('@andresaya/edge-tts');
const VOICE = 'zh-CN-YunyangNeural', RATE = '+5%';

// ---------- 片单（窗口实测过画面）----------
const SEGS = [
  { id: 'co', t0: 392, min: 8, chap: null, hook: true,
    text: '我们需要的，不仅仅是能看见、会说话的AI。',
    kw: [[9, '看见'], [15, '会说话']] },                    // kw: [text 中的字位, 词]
  { id: 'c1', t0: 553.5, min: 9, chap: '01 · 一双眼睛',
    text: '转折发生在十年前。她的实验室做出ImageNet，第一次教会计算机「看见」。',
    kw: [[16, 'ImageNet'], [26, '第一次']] },
  { id: 'c2', t0: 62, min: 8, chap: '02 · 空间智能',
    text: '但她真正的判断是：看见只是开始，看见是为了做和学。这就是空间智能。',
    kw: [[24, '空间智能']] },
  { id: 'c3', t0: 568, min: 8, chap: '03 · 走进现实',
    text: '当机器真正学会看，机器人就走在了走进现实的路上。',
    kw: [[13, '机器人']] },
];
const END = 4.5, LEAD = 0.35, CO_LEAD = 0.6;

// ---------- 1) TTS ----------
for (const s of SEGS) {
  const wav = path.join(OUTDIR, `tts_${s.id}.wav`);
  s.wav = wav;
  if (!fs.existsSync(wav)) {
    const tts = new EdgeTTS();
    await tts.synthesize(s.text, VOICE, { rate: RATE });
    const buf = await tts.toBuffer();
    fs.writeFileSync(wav, buf);
  }
  s.tts = durationOf(wav, LOG(`tts_${s.id}`));
  s.vis = Math.max(s.tts + LEAD + 0.9, s.min);
  console.log(`${s.id}: tts ${s.tts.toFixed(2)}s → vis ${s.vis.toFixed(2)}s`);
}

// ---------- 2) 时间轴 ----------
let cur = 0;
for (const s of SEGS) { s.start = cur; cur += s.vis; }
const TOTAL = cur + END;
const fmt = (t) => { const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), x = t % 60; return `${h}:${String(m).padStart(2, '0')}:${x.toFixed(2).padStart(5, '0')}`; };

// ---------- 3) ASS ----------
const W = 1280, H = 720;
const ass = ['[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${W}`, `PlayResY: ${H}`, 'WrapStyle: 2', 'ScaledBorderAndShadow: yes', '',
  '[V4+ Styles]',
  `Style: Narr,Microsoft YaHei,38,&H00FFFFFF,&H00FFFFFF,&H00141414,&HC8000000,1,0,0,0,100,100,0,0,1,2.4,1.0,2,42,42,36,1`,
  `Style: KW,Microsoft YaHei,58,&H002AD5FF,&H002AD5FF,&HC8141414,&HC8000000,1,0,0,0,100,100,0,0,1,3,0,7,0,0,0,1`,  // 关键词：大号橙黄
  `Style: Chap,Microsoft YaHei,26,&H00FFFFFF,&H00FFFFFF,&HB4141414,&H64000000,1,0,0,0,100,100,0,0,1,8,0,7,18,18,12,1`,
  `Style: TR,Microsoft YaHei,22,&H00E8F4FF,&H00E8F4FF,&HB4141414,&H64000000,0,0,0,0,100,100,0,0,3,8,0,9,20,20,14,1`,
  `Style: End,Microsoft YaHei,40,&H00FFFFFF,&H00FFFFFF,&H00141414,&HC8000000,1,0,0,0,100,100,0,0,1,2,0,2,0,0,0,1`,
  '', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text'];

const esc = (t) => t.replace(/\n/g, '\\N');
for (const s of SEGS) {
  const a = s.start, b = s.start + s.vis, vs = a + (s.hook ? CO_LEAD : LEAD);
  // 解说字幕
  ass.push(`Dialogue: 0,${fmt(vs)},${fmt(b - 0.2)},Narr,,0,0,0,,{\\fad(120,160)}${esc(s.text)}`);
  // 章节角标（左上）
  if (s.chap) ass.push(`Dialogue: 0,${fmt(a + 0.1)},${fmt(b)},Chap,,0,0,0,,{\\fad(100,0)}◆ ${s.chap}`);
  // 原片时间角标（右上）
  const o = `${String(Math.floor(s.t0 / 60)).padStart(2, '0')}:${String(Math.round(s.t0 % 60)).padStart(2, '0')}`;
  ass.push(`Dialogue: 0,${fmt(a + 0.1)},${fmt(b)},TR,,0,0,0,,{\\fad(100,0)}原片 ${o}`);
  // 关键词强调（中上，弹出）
  for (const [ci, word] of s.kw) {
    const t = Math.min(vs + ci / s.text.length * s.tts, b - 1.2);
    ass.push(`Dialogue: 1,${fmt(t)},${fmt(Math.min(t + 1.6, b - 0.2))},KW,,0,0,0,,` +
      `{\\an8\\pos(640,96)\\fscx55\\fscy55\\t(0,150,\\fscx100\\fscy100)\\fad(0,240)}${word}`);
  }
  // 进度条（底部，全程生长）
  const grow = ((b - a) * 1000).toFixed(0);
  ass.push(`Dialogue: 0,${fmt(a)},${fmt(b)},Chap,,0,0,0,,` +
    `{\\an7\\pos(0,706)\\p1}m 0 0 l ${W} 0 ${W} 7 0 7{\\p0}`);                    // 底槽
  ass.push(`Dialogue: 1,${fmt(a)},${fmt(b)},Chap,,0,0,0,,` +
    `{\\an7\\pos(0,706)\\c&H2AD5FF&\\fscx0\\t(0,${grow},\\fscx100)\\p1}m 0 0 l ${W} 0 ${W} 7 0 7{\\p0}`);
}
// 片尾卡
const ea = cur;
ass.push(`Dialogue: 0,${fmt(ea + 0.3)},${fmt(TOTAL)},End,,0,0,0,,{\\fad(150,200)\\an5\\pos(640,320)}剪辑创新验证片段 · 60 秒`);
ass.push(`Dialogue: 0,${fmt(ea + 0.9)},${fmt(TOTAL)},Chap,,0,0,0,,{\\fad(150,200)\\an5\\pos(640,392)}完整演讲 15:02 → BV113xW6VEv6\\N五项创新：冷开场 / 真机位 / 硬切+音效 / 关键词强调 / 进度条`);
const ASS = path.join(OUTDIR, 'demo.ass');
fs.writeFileSync(ASS, ass.join('\n') + '\n');

// ---------- 4) 音效（合成 whoosh / impact）----------
const mkWhoosh = async (f) => {
  ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi',
    '-i', `anoisesrc=color=pink:duration=0.45:amplitude=0.85`,
    '-af', 'highpass=f=220,lowpass=f=1100,afade=t=in:st=0:d=0.3,afade=t=out:st=0.3:d=0.15,volume=0.55',
    '-ar', '48000', '-ac', '2', f], LOG('whoosh'));
};
const mkImpact = async (f) => {
  ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi',
    '-i', `sine=frequency=68:duration=0.35`,
    '-af', 'afade=t=out:st=0.04:d=0.31,volume=0.5',
    '-ar', '48000', '-ac', '2', f], LOG('impact'));
};
await mkWhoosh(path.join(OUTDIR, 'whoosh.wav'));
await mkImpact(path.join(OUTDIR, 'impact.wav'));

// ---------- 5) 一次合成：视频 concat + 烧字幕 + 混音 ----------
const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', SRC];
for (const s of SEGS) args.push('-i', s.wav);                    // 1..n
const N = SEGS.length;
args.push('-f', 'lavfi', '-i', `anoisesrc=color=pink:duration=0.45:amplitude=0.85`);   // n+1 whoosh
args.push('-f', 'lavfi', '-i', `sine=frequency=68:duration=0.35`);                     // n+2 impact
args.push('-f', 'lavfi', '-i', `color=c=0x1A1030:s=${W}x${H}:r=30`);                   // n+3 end card

// 视频链：5 个窗口 trim → concat → 烧字幕
let fc = '', vlabels = [];
SEGS.forEach((s, i) => {
  fc += `[0:v]trim=start=${s.t0}:duration=${s.vis.toFixed(3)},setpts=PTS-STARTPTS,scale=${W}:${H}:flags=lanczos,fps=30,setsar=1[v${i}];`;
  vlabels.push(`[v${i}]`);
});
fc += `[${N + 3}:v]trim=duration=${END},setpts=PTS-STARTPTS,format=yuv420p[ve];`;
fc += `${vlabels.join('')}[ve]concat=n=${N + 1}:v=1:a=0[vc];`;
const assEsc = ASS.replace(/\\/g, '/').replace(/:/g, '\\:');
fc += `[vc]subtitles='${assEsc}'[vout];`;

// 音频链：每段解说 delay 到位；切点 whoosh/impact
const amixIn = [];
SEGS.forEach((s, i) => {
  const d = Math.round(((s.hook ? CO_LEAD : LEAD) + s.start) * 1000);
  fc += `[${i + 1}:a]aformat=sample_rates=48000:channel_layouts=stereo,adelay=${d}|${d}[a${i}];`;
  amixIn.push(`[a${i}]`);
});
// whoosh/impact 放在每个切点（含开头 hook）
const hits = [0, ...SEGS.slice(1).map(s => s.start)];
hits.forEach((t, i) => {
  const d = Math.round(t * 1000);
  fc += `[${N + 1}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=0.5,adelay=${d}|${d}[w${i}];`;
  fc += `[${N + 2}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=0.35,adelay=${d + 60}|${d + 60}[p${i}];`;
  amixIn.push(`[w${i}]`, `[p${i}]`);
});
fc += `${amixIn.join('')}amix=inputs=${amixIn.length}:normalize=0,apad=whole_dur=${TOTAL.toFixed(2)},loudnorm=I=-16:TP=-1.5:LRA=11[aout]`;

args.push('-filter_complex', fc, '-map', '[vout]', '-map', '[aout]',
  '-t', TOTAL.toFixed(2), '-c:v', 'libx264', '-crf', '20', '-preset', 'medium',
  '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k',
  path.join(OUTDIR, 'final.mp4'));
const r = ffmpeg(args, LOG('build'));
console.log(r.status === 0 ? `✓ 完成 → ${path.join(OUTDIR, 'final.mp4')}（${TOTAL.toFixed(1)}s）` : '✗ 失败，见 History/runs/_logs/demo_build.log');
process.exit(r.status === 0 ? 0 : 1);
