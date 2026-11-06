// recam.mjs —— 镜头语言重加工工具（数字重摄影：动作内容零改动，只改镜头）
// 由 loop33 三版实验（V1 推轨近景 / V2 多机位伪造 / V3 速度斜坡）提炼。
//
// 用法: node recam.mjs <input.mp4> <shots.json> [output.mp4]
//
// shots.json 结构（相对路径相对 JSON 文件所在目录解析）:
// {
//   "source": { "in": 299.0, "dur": 3.2 },      // 可选：从长源片切干净中间段（双 seek 精确到帧）
//   "out":    { "w": 1920, "h": 1080, "fps": 30, "crf": 19 },
//   "look":   { "letterbox": 2.39, "vignette": true,          // 全局观感（可省略）
//               "temperature": 9500, "saturation": 0.82 },
//   "shots": [
//     // ① 全景（原画幅直出）
//     { "t": [0, 0.45], "cam": { "type": "full" } },
//     // ② 固定窗景别（特写/中景/低机位）：win=[w,h] from=[x,y]
//     { "t": [0.45, 0.72], "cam": { "type": "crop", "win": [1344, 756], "from": [380, 0] } },
//     // ③ 摇移/跟随：窗口尺寸不变、位置从 from 缓动到 to
//     { "t": [0.72, 1.10], "cam": { "type": "crop", "win": [1728, 972], "from": [40, 90], "to": [160, 90], "ease": "inout" } },
//     // ④ 推近/拉远：窗口从 from 缓动缩放到 to（内部 2x 超采防抖）
//     { "t": [1.10, 1.45], "cam": { "type": "zoom", "from": [1728, 972, 40, 90], "to": [1152, 648, 300, 250], "ease": "inout" } },
//     // ⑤ 速度斜坡：speed<1 慢放（时长自动延长），blur=混合帧数拖影，look 逐镜覆盖
//     { "t": [0.9, 1.55], "speed": 0.35, "blur": 3,
//       "cam": { "type": "full" }, "look": { "temperature": 9500, "saturation": 0.82 } },
//     // 每镜可带字幕标注（ass 铁律：UTF-8 文件 + 相对路径，per-shot 独立时间轴）
//     { "t": [0, 1.0], "cam": { "type": "full" },
//       "label": { "text": "② 推轨近景", "size": 34, "color": "FFC850", "pos": [40, 170] } }
//   ]
// }
// ease: "linear" | "in" | "out" | "inout"（默认 linear）
//
// 坑位约定（ops.md 25-33）：中文一律 ass 文件滤镜、filter_complex 走脚本文件、
// execSync 只给含空格参数加引号、concat 段各自贴字幕再 demuxer 拼接。
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const FF = join(ROOT, 'Workspace/deps/ffmpeg/ffmpeg.exe');
const FFPROBE = join(ROOT, 'Workspace/deps/ffmpeg/ffprobe.exe');

const [, , inputArg, shotsArg, outArg] = process.argv;
if (!inputArg || !shotsArg) {
  console.error('用法: node recam.mjs <input.mp4> <shots.json> [output.mp4]');
  process.exit(1);
}
const j = s => (s.includes(' ') ? JSON.stringify(s) : s); // cmd.exe 引号语义：仅含空格者加引号
const run = (cmd, cwd) => execSync(cmd, { stdio: ['ignore', 'ignore', 'inherit'], cwd });

const CFG_PATH = resolve(shotsArg);
const CFG = JSON.parse(readFileSync(CFG_PATH, 'utf8'));
const CFG_DIR = dirname(CFG_PATH);
const B = join(CFG_DIR, 'recam_build');            // 构建目录（ass 相对路径的 cwd）
mkdirSync(B, { recursive: true });
const OUT = resolve(outArg || join(CFG_DIR, 'recam_out.mp4'));
// 输入优先按 cwd 解析，其次相对 JSON 目录
const INPUT = [resolve(inputArg), resolve(CFG_DIR, inputArg)].find(p => existsSync(p));

// ---------- 参数 ----------
const O = { w: 1920, h: 1080, fps: 30, crf: 19, ...CFG.out };
const GLOOK = CFG.look || {};
const src = CFG.source || {};                      // {in, dur} 可选
const SRC_IN = src.in ?? 0, SRC_DUR = src.dur ?? null;
const ENC = crf => ['-c:v', 'libx264', '-preset', 'medium', '-crf', String(crf), '-an'];

// ---------- Step A: 干净中间段（PTS 归零、CFR），坑33 铁律 ----------
const CLIP = join(B, 'clip_clean.mp4');
{
  const coarse = Math.max(0, Math.floor(SRC_IN) - 1);
  const fine = SRC_IN - coarse;
  const args = [j(FF), '-y'];
  if (coarse > 0) args.push('-ss', String(coarse));
  args.push('-i', j(INPUT));
  if (fine > 0.001) args.push('-ss', fine.toFixed(4));
  if (SRC_DUR) args.push('-t', String(SRC_DUR));
  args.push('-vf', `setpts=PTS-STARTPTS,fps=${O.fps}`, ...ENC(16), j(CLIP));
  run(args.map(j).join(' '));
}

// ---------- 探测中间段实际参数 ----------
const probe = JSON.parse(execSync(
  `${j(FFPROBE)} -v quiet -print_format json -show_streams ${j(CLIP)}`, { encoding: 'utf8' }));
const v = probe.streams.find(s => s.codec_type === 'video');
const SW = v.width, SH = v.height;
const SDUR = Number(v.duration);
console.log(`干净段: ${SW}x${SH} ${SDUR.toFixed(3)}s @${O.fps}fps`);

// ---------- 缓动表达式 ----------
const easeExpr = (ease, p) => {
  switch (ease) {
    case 'in': return `(${p})*(${p})`;
    case 'out': return `1-(1-(${p}))*(1-(${p}))`;
    case 'inout': return `if(lt(${p},0.5),2*(${p})*(${p}),1-pow(-2*(${p})+2,2)/2)`;
    default: return `(${p})`; // linear
  }
};

// 冲击震动：衰减正弦位移（港式重击震镜），t 为本镜输出时间
const shakeExpr = (shake, base, t) => {
  if (!shake) return base;
  const { amp = 20, decay = 0.25, freq = 14 } = shake;
  const osc = `(${amp})*exp(-${t}/${decay})*sin(2*PI*${freq}*${t})`;
  return base === null ? osc : `(${base})+(${osc})`;
};

// ---------- 滤镜生成（逐镜独立文件 → 逐镜加工 → concat demuxer，坑33 铁律） ----------
// 坑33 实测：split+trim 大滤镜图中慢滤镜（zoompan@4K）会令上游帧队列堆积直至 OOM，
// 故不走 filter_complex，逐镜单独渲染。
const shots = CFG.shots;
const SS = 2;                                      // zoom 镜超采倍率
const hasLabel = shots.some(s => s.label);
const report = [];
let outT = 0;

shots.forEach((shot, i) => {
  const [t0, t1] = shot.t;
  const speed = shot.speed ?? 1;
  const rawDur = t1 - t0;
  const outDur = rawDur / speed;
  const look = { ...GLOOK, ...(shot.look || {}) };
  const cam = shot.cam || { type: 'full' };
  // 坑34（实测）：zoompan 之后接 setpts 拉伸 + fps 复制会触发该构建的
  // 「Cannot allocate memory」bug → 慢放一律放在相机链之前。
  let f = '';
  if (speed !== 1) f += `setpts=${(1 / speed).toFixed(5)}*PTS,fps=${O.fps},`;

  if (cam.type === 'zoom') {
    // 推近/拉远：窗口 [x,y,w,h] from→to，2x 超采后 zoompan（坑：zoompan 需大图防抖动）
    // cam.snap: 急推变焦（crash zoom，邵氏招牌）——前 snap 秒内完成推进，之后保持
    const N = Math.max(2, Math.round(outDur * O.fps));
    const pDenom = cam.snap ? `(${cam.snap} * ${O.fps})` : `${N - 1}`;
    const p = `min(on/${pDenom},1)`;
    const ep = easeExpr(cam.ease, p);
    const zw = (SS * SW) / cam.from[2], zz = (SS * SW) / cam.to[2];   // zoom 因子（相对超采图）
    const x0 = cam.from[0] * SS, x1 = cam.to[0] * SS;
    const y0 = cam.from[1] * SS, y1 = cam.to[1] * SS;
    // zoompan 表达式无 t 变量，用 on/fps 折算时间
    const tOn = `(on/${O.fps})`;
    const shxZ = shakeExpr(cam.shake, `${x1}+(${x0 - x1})*(${ep})`, tOn);
    const shyZ = shakeExpr(cam.shake, `${y1}+(${y0 - y1})*(${ep})`, tOn);
    const clampX = e => `clip(${e},0,in_w-in_w/zoom)`;
    const clampY = e => `clip(${e},0,in_h-in_h/zoom)`;
    f += `scale=${SW * SS}:${SH * SS}:flags=lanczos,` +
      `zoompan=z='${zw.toFixed(4)}+(${(zz - zw).toFixed(4)})*(${ep})':` +
      `x='${clampX(shxZ)}':y='${clampY(shyZ)}':` +
      `d=1:s=${O.w}x${O.h}:fps=${O.fps}`;
  } else {
    // full / crop：crop 逐帧求值 x,y（窗口恒尺寸），位置可缓动摇移
    // t 为本镜输出时间轴（慢放后 0..outDur），进度分母用 outDur
    const p = `min(t/${outDur.toFixed(4)},1)`;
    const cropChain = cam.type === 'crop'
      ? (() => {
        const [w, h] = cam.win;
        const [x0, y0] = cam.from, [x1 = x0, y1 = y0] = cam.to || [];
        const ep = easeExpr(cam.ease, p);
        const x = x0 === x1 ? x0 : `(${x0})+(${x1 - x0})*(${ep})`;
        const y = y0 === y1 ? y0 : `(${y0})+(${y1 - y0})*(${ep})`;
        const shx = shakeExpr(cam.shake, x, 't');
        const shy = shakeExpr(cam.shake, y, 't');
        return `crop=${w}:${h}:x='${shx}':y='${shy}',scale=${O.w}:${O.h}:flags=lanczos`;
      })()
      : `scale=${O.w}:${O.h}:flags=lanczos`;
    f += cropChain;
  }

  // 港式重击白闪/黑闪（fade 帧级渐变）：flashin 紧跟相机链（闪画面不闪字幕）
  if (shot.flashin) f += `,fade=t=in:st=0:d=${shot.flashin.d ?? 0.08}:color=${shot.flashin.color || 'white'}`;

  // 拖影（慢放后混合相邻帧）
  if (shot.blur > 1) f += `,tmix=frames=${shot.blur}:weights='${Array(shot.blur).fill(1).join(' ')}'`;
  // 逐镜调色（全局 look 已并入）
  if (look.temperature) f += `,colortemperature=temperature=${look.temperature}`;
  if (look.saturation != null) f += `,eq=saturation=${look.saturation}`;
  if (look.contrast != null) f += `,eq=contrast=${look.contrast}`;
  if (look.vignette) f += `,vignette=PI/4.5`;
  if (look.letterbox) {
    const barH = Math.round((O.h - O.w / look.letterbox) / 2);
    f += `,drawbox=x=0:y=0:w=${O.w}:h=${barH}:color=black:t=fill,drawbox=x=0:y=${O.h - barH}:w=${O.w}:h=${barH}:color=black:t=fill`;
  }
  // 逐镜 ASS 标注（独立时间轴，坑33 模式内置化）
  if (shot.label) {
    const lb = shot.label;
    const [lx, ly = 170] = lb.pos || [40, 170];
    const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: ${O.w}
PlayResY: ${O.h}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: N,Microsoft YaHei,${lb.size || 30},&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,1.2,0,7,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.05,0:${String(Math.floor(outDur / 60)).padStart(2, '0')}:${(outDur % 60).toFixed(2).padStart(5, '0')},N,,0,0,0,,{\\an${lb.align || 7}\\pos(${lx},${ly})\\fs${lb.size || 30}\\1c&H${lb.color || 'FFFFFF'}&\\bord1.2\\3c&H000000&\\3a&H60&}${lb.text}
`;
    writeFileSync(join(B, `shot_${i}.ass`), ass, 'utf8');
    f += `,ass=shot_${i}.ass`;
  }
  if (shot.flashout) f += `,fade=t=out:st=${Math.max(0, outDur - (shot.flashout.d ?? 0.08)).toFixed(3)}:d=${shot.flashout.d ?? 0.08}:color=${shot.flashout.color || 'white'}`;
  f += `,format=yuv420p`;

  // Step B: 逐镜渲染 —— trim 切段 + 相机链，单输入单输出（crf16 中间件）
  const seg = join(B, `seg_${String(i).padStart(2, '0')}.mp4`);
  run(`${j(FF)} -y -i ${j(CLIP)} -vf "trim=start=${t0}:end=${t1},setpts=PTS-STARTPTS,${f}" ` +
    `${ENC(16).map(j).join(' ')} -pix_fmt yuv420p ${j(seg)}`, B);

  const tc = s => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
  report.push(`  镜${i + 1} ${tc(outT)}-${tc(outT + outDur)}  ${cam.type}${cam.type === 'crop' ? ' ' + cam.win.join('x') : ''}${speed !== 1 ? '  ' + speed + 'x' : ''}${shot.blur > 1 ? '  拖影' + shot.blur : ''}${shot.label ? '  [标注]' : ''}`);
  outT += outDur;
});

// ---------- Step C: concat demuxer 拼接 ----------
const LIST = join(B, 'concat.txt').replace(/\\/g, '/');
writeFileSync(join(B, 'concat.txt'),
  shots.map((_, i) => `file 'seg_${String(i).padStart(2, '0')}.mp4'`).join('\n'), 'utf8');

// ---------- 渲染 ----------
console.log('镜头表:\n' + report.join('\n'));
console.log(`输出时长约 ${outT.toFixed(2)}s → ${OUT}`);
run(`${j(FF)} -y -f concat -safe 0 -i ${j(LIST)} -c copy ${j(OUT)}`, B);
console.log('完成:', OUT);
