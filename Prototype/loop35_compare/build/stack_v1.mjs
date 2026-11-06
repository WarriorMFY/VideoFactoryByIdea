// loop35 第一版上下对比：中式写意泼染 VS 西式写实糊屏（3.2s 单对快出）
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const R = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const FF = join(R, 'Workspace/deps/ffmpeg/ffmpeg.exe');
const T = join(R, 'Workspace/tmp/loop35_compare');
const B = dirname(fileURLToPath(import.meta.url));
const j = s => (s.includes(' ') ? JSON.stringify(s) : s);

const YZL = { t0: 59.4, dur: 3.2, cropY: 270 };   // 红绸血雾跃杀
const GOW = { t0: 55.2, dur: 3.2, cropY: 270 };   // 瀑布贴脸拔角血糊

// ASS 颜色为 &HBBGGRR& 顺序：琥珀 RGB(FFC850)→BGR 50C8FF；红 RGB(FF6B5A)→5A6BFF；灰 C8B890→90B8C8
const AMBER = '50C8FF', RED = '5A6BFF', GRAY = '90B8C8';
const mkAss = () => {
  const line = (txt, { size = 34, color, x = 40, y }) =>
    `Dialogue: 0,0:00:00.05,0:00:03.20,N,,0,0,0,,{\\an7\\pos(${x},${y})\\fs${size}\\1c&H${color}&\\bord1.4\\3c&H000000&\\3a&H60&}${txt}`;
  return `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: N,Microsoft YaHei,34,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,1.4,0,7,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${line('中式武术美学 · 写意泼染', { color: AMBER, y: 44 })}
${line('影之刃零', { size: 24, color: GRAY, x: 44, y: 92 })}
${line('西方暴力美学 · 写实糊屏', { color: RED, y: 584 })}
${line('战神4', { size: 24, color: GRAY, x: 44, y: 632 })}
`;
};
writeFileSync(join(B, 'cmp.ass'), mkAss(), 'utf8');

const cmd = [
  j(FF), '-y',
  '-ss', String(YZL.t0), '-i', j(join(T, 'yzl_exec.mp4')),
  '-ss', String(GOW.t0), '-i', j(join(T, 'gow.mp4')),
  '-filter_complex',
  `[0:v]trim=duration=${YZL.dur},setpts=PTS-STARTPTS,crop=1920:540:0:${YZL.cropY}[a];` +
  `[1:v]trim=duration=${GOW.dur},setpts=PTS-STARTPTS,crop=1920:540:0:${GOW.cropY}[b];` +
  `[a][b]vstack,drawbox=x=0:y=537:w=1920:h=6:color=black:t=fill,ass=cmp.ass,format=yuv420p[v]`,
  '-map', '[v]', '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
  '-movflags', '+faststart', j(join(B, 'out_stack_v1.mp4')),
].join(' ');
execSync(cmd, { stdio: ['ignore', 'ignore', 'inherit'], cwd: B });
console.log('OK', join(B, 'out_stack_v1.mp4'));
