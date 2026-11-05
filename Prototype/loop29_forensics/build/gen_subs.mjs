#!/usr/bin/env node
// loop29 取证试片字幕生成：7 段各自独立 ASS（每段时间轴从 0 起）
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const OUT = import.meta.dirname;
mkdirSync(OUT, { recursive: true });

const AMBER = '&H0027A2C9';   // #C9A227
const WHITE = '&H00FFFFFF';
const GRAY  = '&H00A8ADB2';

const HEAD = `[Script Info]
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: M,Consolas,24,${WHITE},&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,1,0,1,0,0,7,0,0,0,1
Style: Y,Microsoft YaHei,24,${WHITE},&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,1,0,1,0,0,7,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

const ts = (s) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${sec.toFixed(2).padStart(5, '0')}`;
};

// 取景四角：L 形，缩进 28，臂长 46，线宽 2
const corners = (dur, alpha = '60') => {
  const A = `\\1c${WHITE}\\1a&H${alpha}&\\bord0\\shad0`;
  const L = 46, t = 2, x = 28, y = 28, W = 1280, H = 720;
  const arm = (px, py, dx, dy) =>
    `{\\an7\\pos(${px},${py})\\p1${A}}m 0 0 l ${dx * L} 0 l ${dx * L} ${dy * t} l ${dx * t} ${dy * t} l ${dx * t} ${dy * L} l 0 ${dy * L}{\\p0}`;
  return [
    arm(x, y, 1, 1),
    arm(W - x, y, -1, 1),
    arm(x, H - y, 1, -1),
    arm(W - x, H - y, -1, -1),
  ].map((d) => `Dialogue: 0,${ts(0)},${ts(dur)},M,,0,0,0,,${d}`).join('\n');
};

// 左下时间码 + 右上段名(合并实录角标，避开左上游戏UI与右上IGN水印)；右下速度
const hud = (dur, { tc, seg, tag, speed }) => {
  const out = [];
  if (tc) out.push(`Dialogue: 1,${ts(0.15)},${ts(dur)},M,,0,0,0,,{\\an7\\pos(40,646)\\fs24\\1c${AMBER}\\bord1\\3c&H000000&\\3a&H80&\\fad(120,120)}${tc}`);
  if (seg) out.push(`Dialogue: 1,${ts(0.15)},${ts(dur)},Y,,0,0,0,,{\\an9\\pos(1240,150)\\fs23\\1c${WHITE}\\bord1\\3c&H000000&\\3a&H80&\\fad(120,120)}${seg}${tag ? `　[ ${tag} ]` : ''}`);
  if (speed) out.push(`Dialogue: 1,${ts(0.15)},${ts(dur)},M,,0,0,0,,{\\an3\\pos(1240,646)\\fs30\\1c${AMBER}\\bord1\\3c&H000000&\\3a&H80&\\fad(120,120)}${speed}`);
  return out.join('\n');
};

// 底部断言条：半透明黑条 + 断言句 + 副注
const claim = (dur, line, sub) => {
  const bar = `Dialogue: 1,${ts(0.2)},${ts(dur - 0.05)},M,,0,0,0,,{\\an7\\pos(150,586)\\p1\\1c&H000000&\\1a&H58&\\bord0\\shad0}m 0 0 l 980 0 l 980 96 l 0 96{\\p0}`;
  const l = `Dialogue: 2,${ts(0.2)},${ts(dur - 0.05)},Y,,0,0,0,,{\\an8\\pos(640,596)\\fs31\\1c${WHITE}\\bord0\\shad0\\fad(180,180)}${line}`;
  const s = sub ? `Dialogue: 2,${ts(0.28)},${ts(dur - 0.05)},Y,,0,0,0,,{\\an8\\pos(640,644)\\fs19\\1c${GRAY}\\bord0\\shad0\\fad(180,180)}${sub}` : '';
  return [bar, l, s].filter(Boolean).join('\n');
};

const card = ({ dur, title, kicker, meta, foot, big = 44 }) => {
  const out = [
    `Dialogue: 3,${ts(0.25)},${ts(dur)},Y,,0,0,0,,{\\an5\\pos(640,316)\\fs${big}\\b1\\1c${WHITE}\\bord0\\shad0\\fad(300,320)}${title}`,
  ];
  if (kicker) out.push(`Dialogue: 3,${ts(0.55)},${ts(dur)},M,,0,0,0,,{\\an5\\pos(640,268)\\fs20\\1c${AMBER}\\bord0\\shad0\\fad(300,320)}${kicker}`);
  if (meta) out.push(`Dialogue: 3,${ts(0.75)},${ts(dur)},M,,0,0,0,,{\\an5\\pos(640,378)\\fs20\\1c${GRAY}\\bord0\\shad0\\fad(300,320)}${meta}`);
  if (foot) out.push(`Dialogue: 3,${ts(0.95)},${ts(dur)},Y,,0,0,0,,{\\an5\\pos(640,414)\\fs18\\1c${GRAY}\\bord0\\shad0\\fad(300,320)}${foot}`);
  return out.join('\n');
};

const segs = [
  { id: 's0', dur: 2.6, body: card({
      dur: 2.6, kicker: '取 证 试 片 · 非 成 片',
      title: '紫冥剑 · 壹',
      meta: '302.40 – 305.40s　|　30fps　|　源 640×360',
      foot: '5 处实录 · 2 处推断 · 3 处不可取证', big: 46 }) },
  { id: 's1', dur: 1.1667, body: [
      hud(1.1667, { tc: '05:02.45', seg: '01 原速 · 观众所见', tag: '实录', speed: '× 1.00' }),
      claim(1.1667, '游戏里，这一秒就是这样过去的。', '35 帧 · 302.45–303.62'),
    ].join('\n') },
  { id: 's2', dur: 1.7778, body: [
      hud(1.7778, { tc: '05:02.57', seg: '02 蓄力 · 剑光之前', tag: '实录', speed: '× 0.15' }),
      claim(1.7778, '剑光出现之前，身体已经转完了。', '8 帧 · 302.57–302.83 · 提速后仅剩 4 帧可见'),
    ].join('\n') },
  { id: 's3', dur: 1.8889, body: [
      hud(1.8889, { tc: '05:02.97', seg: '03 贴地 · 两道剑光之间', tag: '实录', speed: '× 0.30' }),
      claim(1.8889, '两道剑光之间，他蹲下去了半秒。', '17 帧 · 302.97–303.53 · 撩必有压'),
    ].join('\n') },
  { id: 's4', dur: 1.7333, body: [
      hud(1.7333, { tc: '05:03.53', seg: '04 跪抡 · 不是站着劈的', tag: '实录', speed: '× 0.25' }),
      claim(1.7333, '这一招不是站着劈的，是跪着抡的。', '13 帧 · 303.53–303.97 · 整段由高到低'),
    ].join('\n') },
  { id: 's5', dur: 1.2, body: [
      hud(1.2, { tc: '05:03.87', seg: '05 殿后 · 光散之后', tag: '实录', speed: '× 0.25' }),
      claim(1.2, '光散了，他还在滑。', '9 帧 · 303.87–304.17 · 动画长于特效'),
    ].join('\n') },
  { id: 's6', dur: 4.0, body: card({
      dur: 4.0, kicker: '取 证 结 论',
      title: '这一剑的力量，在剑光之前就完成了。',
      meta: '实录 5　推断 2　不可取证 3', foot: 'loop29 · 逐帧取证', big: 34 }) },
];

for (const s of segs) {
  const txt = HEAD + s.body + '\n' + corners(s.dur) + '\n';
  writeFileSync(join(OUT, `cap_${s.id}.ass`), txt, 'utf8');
  console.log('ok', s.id, s.dur);
}
