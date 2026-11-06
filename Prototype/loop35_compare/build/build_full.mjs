// loop35 完整版：左右分屏四组对位 + 片头卡 + 片尾「殺」字卡对位 + 中国风 BGM（总约 17s）
// 结构对齐 fmt 参考片：硬切、无旁白、克制标注。全流程分段独立渲染 → concat demuxer（坑33/34 铁律）
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const R = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const FF = join(R, 'Workspace/deps/ffmpeg/ffmpeg.exe');
const T = join(R, 'Workspace/tmp/loop35_compare');
const B = dirname(fileURLToPath(import.meta.url));
const j = s => (s.includes(' ') ? JSON.stringify(s) : s);
const run = (cmd, cwd = B) => { console.error('[run]', cmd.slice(0, 120)); execSync(cmd, { stdio: ['ignore', 'ignore', 'inherit'], cwd }); };

const DUR = 3.2;                        // 每组时长
// 每组：左右起止 + 竖裁 x + 语义标签（左=中式，右=西式）
const PAIRS = [
  { yzl: [59.4, 540],  gow: [55.2, 480],  tag: ['泼染', '糊屏'] },   // 色彩：写意大色块 vs 写实怼脸
  { yzl: [69.2, 460],  gow: [23.8, 480],  tag: ['爆发', '劈杀'] },   // 爆发：火焰泼染 vs 大斧劈杀
  { yzl: [151.5, 560], gow: [26.8, 420],  tag: ['收势', '怒吼'] },   // 杀后：静立留白 vs 仰天咆哮
  { yzl: [94.5, 480],  gow: [159.5, 520], tag: ['刺杀', '屠戮'] },   // 终结：夜战一刺 vs 地狱屠戮
];
const TAIL = { yzl: [170.8, 480], dur: 2.2 };   // 片尾：真实「殺」书法字卡 vs 黑屏

// ASS 颜色 &HBBGGRR&：琥珀 RGB(FFC850)→50C8FF；红 RGB(FF6B5A)→5A6BFF；灰 C8B890→90B8C8
const AMBER = '50C8FF', RED = '5A6BFF', GRAY = '90B8C8';
const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: N,Microsoft YaHei,40,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,1.6,0,7,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

const dlg = (t0, t1, txt, o) => {
  const ts = s => `0:${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(2).padStart(5, '0')}`;
  const { size = 40, color, x = 40, y = 56, align = 7 } = o;
  return `Dialogue: 0,${ts(t0)},${ts(t1)},N,,0,0,0,,{\\an${align}\\pos(${x},${y})\\fs${size}\\1c&H${color}&\\bord1.6\\3c&H000000&\\3a&H50&}${txt}`;
};

// 对位段 ASS：每侧语义大字 + 片名小字
const pairAss = (p, i) => header + '\n' + [
  dlg(0.05, DUR, p.tag[0], { size: 42, color: AMBER, x: 40, y: 60 }),
  dlg(0.05, DUR, '影之刃零', { size: 24, color: GRAY, x: 44, y: 112 }),
  dlg(0.05, DUR, p.tag[1], { size: 42, color: RED, x: 1004, y: 60 }),
  dlg(0.05, DUR, '战神4', { size: 24, color: GRAY, x: 1008, y: 112 }),
].join('\n');

// 片头卡 ASS：黑底双标题
const HEAD_DUR = 2.0;
const headAss = header + '\n' + [
  dlg(0.1, HEAD_DUR, '中式武术美学', { size: 60, color: AMBER, x: 480, y: 460, align: 5 }),
  dlg(0.1, HEAD_DUR, '影之刃零 · 杀是术', { size: 26, color: GRAY, x: 480, y: 550, align: 5 }),
  dlg(0.1, HEAD_DUR, '西方暴力美学', { size: 60, color: RED, x: 1440, y: 460, align: 5 }),
  dlg(0.1, HEAD_DUR, '战神4 · 杀是果', { size: 26, color: GRAY, x: 1440, y: 550, align: 5 }),
  dlg(0.1, HEAD_DUR, '处决对位', { size: 24, color: GRAY, x: 960, y: 950, align: 5 }),
].join('\n');

const segments = [];
const ENC_MID = '-c:v libx264 -preset fast -crf 16 -an -pix_fmt yuv420p';

// --- 片头卡（纯黑 lavfi + ASS）---
writeFileSync(join(B, 'ass_head.ass'), headAss, 'utf8');
run(`${j(FF)} -y -f lavfi -i color=black:s=1920x1080:d=${HEAD_DUR}:r=30 -vf ass=ass_head.ass,format=yuv420p ${ENC_MID} ${j(join(B, 'seg_00.mp4'))}`);
segments.push('seg_00.mp4');

// --- 四组对位 ---
PAIRS.forEach((p, i) => {
  const idx = String(i + 1).padStart(2, '0');
  writeFileSync(join(B, `ass_${idx}.ass`), pairAss(p, i), 'utf8');
  const [yt0, yx] = p.yzl, [gt0, gx] = p.gow;
  run([
    j(FF), '-y',
    '-ss', String(yt0), '-i', j(join(T, 'yzl_exec.mp4')),
    '-ss', String(gt0), '-i', j(join(T, 'gow.mp4')),
    '-filter_complex',
    `[0:v]trim=duration=${DUR},setpts=PTS-STARTPTS,crop=960:1080:${yx}:0[l];` +
    `[1:v]trim=duration=${DUR},setpts=PTS-STARTPTS,crop=960:1080:${gx}:0[r];` +
    `[l][r]hstack,drawbox=x=957:y=0:w=6:h=1080:color=black:t=fill,ass=ass_${idx}.ass,format=yuv420p[v]`,
    '-map', '[v]', ENC_MID, j(join(B, `seg_${idx}.mp4`)),
  ].join(' '));
  segments.push(`seg_${idx}.mp4`);
});

// --- 片尾：真实「殺」字卡 vs 黑屏 ---
{
  const [tt0, tx] = TAIL.yzl;
  run([
    j(FF), '-y',
    '-ss', String(tt0), '-i', j(join(T, 'yzl_exec.mp4')),
    '-f', 'lavfi', '-i', 'color=black:s=960x1080:r=30',
    '-filter_complex',
    `[0:v]trim=duration=${TAIL.dur},setpts=PTS-STARTPTS,crop=960:1080:${tx}:0[l];` +
    `[l][1:v]hstack,drawbox=x=957:y=0:w=6:h=1080:color=black:t=fill,format=yuv420p[v]`,
    '-map', '[v]', '-t', String(TAIL.dur), ENC_MID, j(join(B, 'seg_05.mp4')),
  ].join(' '));
  segments.push('seg_05.mp4');
}

// --- concat 拼接（正斜杠，坑33）---
writeFileSync(join(B, 'concat.txt'), segments.map(s => `file '${B.replace(/\\/g, '/')}/${s}'`).join('\n'), 'utf8');
run(`${j(FF)} -y -f concat -safe 0 -i ${j(join(B, 'concat.txt'))} -c copy ${j(join(B, 'full_novideo_audio.mp4'))}`);

// --- BGM：fmt 参考片中国风配乐 0-17s + 尾部淡出 ---
const TOTAL = HEAD_DUR + DUR * 4 + TAIL.dur;
run([
  j(FF), '-y',
  '-i', j(join(B, 'full_novideo_audio.mp4')),
  '-ss', '0', '-t', String(TOTAL), '-i', j(join(T, 'fmt.mp4')),
  '-map', '0:v', '-map', '1:a',
  '-af', `afade=t=out:st=${(TOTAL - 1.6).toFixed(1)}:d=1.5`,
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest',
  '-movflags', '+faststart', j(join(B, 'out_compare_full.mp4')),
].join(' '));
console.log('OK', join(B, 'out_compare_full.mp4'), `total=${TOTAL.toFixed(1)}s`);
