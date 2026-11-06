// 拼装 v4：每段独立贴 ASS 标注 → concat demuxer 无损拼接（loop29 模式）
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const FF = 'F:/AgentWorkArea/WorkBuddy/VideoFactory/Workspace/deps/ffmpeg/ffmpeg.exe';
const B = 'F:/AgentWorkArea/WorkBuddy/VideoFactory/Prototype/loop33_rephoto/build';
const OUT = 'F:/AgentWorkArea/WorkBuddy/VideoFactory/Prototype/loop33_rephoto/out_rephoto_test.mp4';
const j = s => s.includes(' ') ? JSON.stringify(s) : s;   // 仅含空格者加引号（cmd.exe 语义）

const AMBER = 'FFC850', GRAY = 'C8B890', DIM = '8A7F6A';
const mkAss = lines => {
  const st = (txt, { size = 30, color = 'FFFFFF', align = 7, x = 40, y = 170 } = {}) =>
    `Dialogue: 0,0:00:00.05,0:00:09.00,N,,0,0,0,,{\\an${align}\\pos(${x},${y})\\fs${size}\\1c&H${color}&\\bord1.2\\3c&H000000&\\3a&H60&}${txt}`;
  return `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: N,Microsoft YaHei,30,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,1.2,0,7,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${lines.map(l => Array.isArray(l) ? st(l[0], l[1] || {}) : st(l)).join('\n')}
`;
};

const assDefs = {
  card1: [
    ['镜头语言重加工实验', { size: 68, color: AMBER, align: 5, x: 960, y: 430 }],
    ['素材：影之刃零·紫冥剑 299.0−302.2s（3.2 秒 · 动作内容零修改）', { size: 30, color: GRAY, align: 5, x: 960, y: 540 }],
    ['同一动作 · 四种镜头语言', { size: 24, color: DIM, align: 5, x: 960, y: 600 }],
  ],
  mark_o: ['① 原镜头 · 游戏内固定机位'],
  mark_v1: ['② 推轨近景 · 推近 1.0→1.4 · 跟随摇移 · 2.35:1 遮幅'],
  mark_v2: ['③ 多机位伪造 · 单一素材切成 5 个景别硬切'],
  mark_v3: ['④ 速度斜坡 · 剑光段 0.35× · 拖影 · 冷调'],
  card2: [
    ['人物与动作一帧未改 · 只改镜头语言', { size: 36, color: GRAY, align: 5, x: 960, y: 500 }],
    ['loop33 · 数字重摄影实验', { size: 22, color: DIM, align: 5, x: 960, y: 575 }],
  ],
};
for (const [k, lines] of Object.entries(assDefs)) writeFileSync(join(B, k + '.ass'), mkAss(lines), 'utf8');

const ENC = '-c:v libx264 -preset medium -crf 19 -an';
const jobs = [
  [['-f', 'lavfi', '-i', 'color=c=0x141210:s=1920x1080:r=30:d=2', '-vf', 'ass=card1.ass'], 'seg_card1.mp4'],
  [['-i', 'clip_src.mp4', '-vf', 'ass=mark_o.ass'], 'seg_o.mp4'],
  [['-i', 'v1_push.mp4', '-vf', 'ass=mark_v1.ass'], 'seg_v1.mp4'],
  [['-i', 'v2_multicam.mp4', '-vf', 'ass=mark_v2.ass'], 'seg_v2.mp4'],
  [['-i', 'v3_ramp.mp4', '-vf', 'ass=mark_v3.ass'], 'seg_v3.mp4'],
  [['-f', 'lavfi', '-i', 'color=c=0x141210:s=1920x1080:r=30:d=2', '-vf', 'ass=card2.ass'], 'seg_card2.mp4'],
];
for (const [args, out] of jobs) {
  const cmd = `${j(FF)} -y ${args.map(j).join(' ')} -pix_fmt yuv420p ${ENC} ${j(out)}`;
  execSync(cmd, { stdio: ['ignore', 'ignore', 'inherit'], cwd: B });
  console.log('seg ok:', out);
}

writeFileSync(join(B, 'concat.txt'),
  jobs.map(x => `file '${x[1].replace(/\\/g, '/')}'`).join('\n'), 'utf8');
execSync(`${j(FF)} -y -f concat -safe 0 -i ${j(join(B, 'concat.txt'))} -c copy ${j(OUT)}`,
  { stdio: ['ignore', 'ignore', 'inherit'], cwd: B });
console.log('assembled:', OUT);
