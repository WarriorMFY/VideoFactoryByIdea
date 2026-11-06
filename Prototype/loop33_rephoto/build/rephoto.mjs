// loop33 镜头语言重加工实验：数字重摄影（动作内容零改动）
// 素材：紫冥剑 299.0-302.2s（空中翻腾→落地横扫→收势），1080p 源
// 双 seek 绕坑30：input 粗跳 296 + output 精调 3.0
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const FF = 'F:/AgentWorkArea/WorkBuddy/VideoFactory/Workspace/deps/ffmpeg/ffmpeg.exe';
const SRC = 'F:/AgentWorkArea/WorkBuddy/VideoFactory/Workspace/tmp/ign_yt/source_1080.mp4';
const ROOT = 'F:/AgentWorkArea/WorkBuddy/VideoFactory/Prototype/loop33_rephoto';
const B = join(ROOT, 'build');
const CLIP = join(B, 'clip_src.mp4');   // 299.0-302.2s，PTS 从 0 起，96 帧
const IN = [JSON.stringify(FF), '-y', '-i', JSON.stringify(CLIP)];

// ---------- V1 推轨近景：zoompan 推近 + 跟随偏移 + 遮幅 + 暗角 ----------
const v1 = `${IN.join(' ')} -t 3.2 -vf "` +
  `scale=3840:2160:flags=lanczos,` +
  `zoompan=z='1+0.40*on/96':d=1:` +
  `x='iw/2-(iw/zoom/2)-120+240*on/96':y='ih/2-(ih/zoom/2)+60-120*on/96':s=1920x1080:fps=30,` +
  `vignette=PI/4.5,` +
  `drawbox=x=0:y=0:w=1920:h=131:color=black:t=fill,` +
  `drawbox=x=0:y=949:w=1920:h=131:color=black:t=fill,` +
  `format=yuv420p" ` +
  `-c:v libx264 -preset medium -crf 19 -an "${join(B, 'v1_push.mp4')}"`;

// ---------- V2 多机位伪造：5 段不同景别硬切（单素材五机位） ----------
// 角色 clip 内轨迹: 0(420,390)空翻 → 0.7(1400,170)右上 → 1.0(460,690)落地 → 1.3 剑光最宽 → 2.4(1300,940)站立
// 段1 0-0.45 全景 | 段2 0.45-0.72 中景右上(固定窗) | 段3 0.72-1.10 低机位
// 段4 1.10-1.45 剑光特写 | 段5 1.45-3.2 收势缓摇
const v2Filter = [
  `[0:v]split=5[s1][s2][s3][s4][s5]`,
  // 段1 全景
  `[s1]trim=start=0:end=0.45,setpts=PTS-STARTPTS,fps=30,scale=1920:1080,format=yuv420p[m1]`,
  // 段2 中景：右上区域固定窗（角色 1400,170 在窗口右上部）
  `[s2]trim=start=0.45:end=0.72,setpts=PTS-STARTPTS,fps=30,` +
    `crop=1344:756:x=380:y=0,scale=1920:1080:flags=lanczos,format=yuv420p[m2]`,
  // 段3 低机位：取画面中下部 1920x810，压低视平线（角色下落+横扫起手都在下半区）
  `[s3]trim=start=0.72:end=1.10,setpts=PTS-STARTPTS,fps=30,` +
    `crop=1920:810:x=0:y=200,scale=1920:1080:flags=lanczos,format=yuv420p[m3]`,
  // 段4 剑光特写：中央偏下 1152x648 放大（横扫最宽区 460,690）
  `[s4]trim=start=1.10:end=1.45,setpts=PTS-STARTPTS,fps=30,` +
    `crop=1152:648:x=100:y=400,scale=1920:1080:flags=lanczos,format=yuv420p[m4]`,
  // 段5 收势：缓摇向右（角色站位 1300,940）
  `[s5]trim=start=1.45:end=3.2,setpts=PTS-STARTPTS,fps=30,` +
    `crop=1728:972:x='40+120*t':y=90,scale=1920:1080:flags=lanczos,` +
    `vignette=PI/4.5,drawbox=x=0:y=0:w=1920:h=131:color=black:t=fill,` +
    `drawbox=x=0:y=949:w=1920:h=131:color=black:t=fill,format=yuv420p[m5]`,
  `[m1][m2][m3][m4][m5]concat=n=5:v=1:a=0[v]`,
].join(';');
writeFileSync(join(B, 'fg_v2.txt'), v2Filter);
const v2 = `${IN.join(' ')} -t 3.2 -filter_complex_script "${join(B, 'fg_v2.txt')}" ` +
  `-map "[v]" -c:v libx264 -preset medium -crf 19 -an "${join(B, 'v2_multicam.mp4')}"`;

// ---------- V3 速度斜坡：横扫段 0.35× + 拖影 + 冷调 ----------
const v3Filter = [
  `[0:v]split=3[a][b][c]`,
  `[a]trim=start=0:end=0.9,setpts=PTS-STARTPTS[f1]`,
  // 剑光段 0.65s → 0.35×（1.86s），3 帧混合拖影 + 冷调降饱和（子弹时间质感）
  `[b]trim=start=0.9:end=1.55,setpts=PTS-STARTPTS,setpts=2.857*PTS,fps=30,tmix=frames=3:weights='1 1 1',` +
    `colortemperature=temperature=9500,eq=saturation=0.82,format=yuv420p[f2]`,
  `[c]trim=start=1.55:end=3.2,setpts=PTS-STARTPTS[f3]`,
  `[f1][f2][f3]concat=n=3:v=1:a=0,drawbox=x=0:y=0:w=1920:h=131:color=black:t=fill,` +
    `drawbox=x=0:y=949:w=1920:h=131:color=black:t=fill[v]`,
].join(';');
writeFileSync(join(B, 'fg_v3.txt'), v3Filter);
const v3 = `${IN.join(' ')} -t 4.5 -filter_complex_script "${join(B, 'fg_v3.txt')}" ` +
  `-map "[v]" -c:v libx264 -preset medium -crf 19 -an "${join(B, 'v3_ramp.mp4')}"`;

for (const [name, cmd] of [['V1', v1], ['V2', v2], ['V3', v3]]) {
  console.log(`--- ${name} ---`);
  try { execSync(cmd, { stdio: ['ignore', 'ignore', 'inherit'] }); console.log('ok'); }
  catch (e) { console.error(name + ' FAILED: ' + String(e.stderr || '').slice(-500)); process.exit(1); }
}
