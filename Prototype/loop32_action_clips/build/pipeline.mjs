// loop32 紫冥剑动作单元拆解管线 v2
// 两层结构：标注段（目读校准边界）→ 段内帧差峰切动作事件
// 每个动作事件 = 独立 0.7× 动捕实速视频 + 发力代表帧
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = 'F:/AgentWorkArea/WorkBuddy/VideoFactory/Workspace/tmp/ign_yt/source_1080.mp4';
const FF = 'F:/AgentWorkArea/WorkBuddy/VideoFactory/Workspace/deps/ffmpeg/ffmpeg.exe';
const SP = 1.4, ATEMPO = (1 / SP).toFixed(4);

// 标注段表（边界经 labels_zmj.jpg + labels_gap.jpg 目读校准）
const SEGS = [
  ['01', '普通连段', 'XXXXX', 300.8, 312.0, '直刺衔接横抹的多段连击，两轮 XXXXX。loop29 取证首轮含三招：横撩起手（力从地起）→低位连环（撩后贴地换步半秒）→回旋劈杀（实为跪姿贴地回环）。'],
  ['02', '杀气连段·壹', 'YYY', 312.0, 333.8, '杀气资源短输入变体 YYY：步法进身+腾身回斩（loop28）。全程金色剑气特效覆盖，动作部分可辨。'],
  ['03', '杀气连段·贰', 'XXYY', 339.4, 355.8, '杀气连段中段变体 XXYY：两轻两重节奏型，与 YYY 变体对照可见同资源下的输入-节奏分层。'],
  ['04', '杀气连段·叁', 'XXXYY', 355.8, 367.9, '杀气连段收段变体 XXXYY：三轻两重，以大回环斩收束。'],
  ['05', '绝技·布局者运攻', 'LB+Y·X (LV5)', 367.9, 372.5, 'LV5 绝技「布局者:运攻」：剑气环绕起手，栖龙剑阵类大范围剑气演出的低等级形态。'],
  ['06', '绝技·布局者铁壁', 'LB+Y·B (LV25)', 372.5, 376.4, 'LV25 绝技「布局者:铁壁」：防御向布局变体，环形剑气盾。与运攻构成「同绝技位、双布局」设计。'],
  ['07', '绝技·栖龙剑阵演出', 'LT', 376.4, 382.8, '绝技完整演出段：剑气环绕成阵的大范围演出。浪漫化「阵」意象：公孙大娘剑器舞→七星剑阵。'],
  ['08', '处决技·壹', 'B', 384.5, 392.5, '处决技1：处决演出。loop29 C 段取证：金光烟尘全程覆盖，动作本体不可逐帧取证——特效层抹掉信息的典型样本。'],
  ['09', '处决技·贰', 'B', 395.0, 399.3, '处决技2：第二处决演出，双处决配置。'],
];

// 段内动作事件切分：帧差峰（段自适应阈值）
const ml = readFileSync('F:/AgentWorkArea/WorkBuddy/VideoFactory/Workspace/tmp/bili_yzld/motion.txt', 'utf8').split('\n');
let t = null; const mv = [];
for (const l of ml) {
  const m = l.match(/pts_time:([\d.]+)/); if (m) t = +m[1];
  const v = l.match(/YAVG=([\d.]+)/); if (v && t != null) mv.push([t, +v[1]]);
}
function findPeaks(s, e) {
  const seg = mv.filter(x => x[0] >= s && x[0] <= e);
  const mean = seg.reduce((a, b) => a + b[1], 0) / seg.length;
  const thr = mean * 1.6;
  const sm = mv.map((x, i) => {
    let a = 0, n = 0;
    for (let j = Math.max(0, i - 2); j <= Math.min(mv.length - 1, i + 2); j++) { a += mv[j][1]; n++; }
    return [mv[i][0], a / n];
  });
  const peaks = []; let inP = false, pt = 0, pv = 0;
  for (const [tt, vv] of sm) {
    if (tt < s + 0.3 || tt > e - 0.4) { if (inP) inP = false; continue; }
    if (vv > thr) { if (!inP) { inP = true; pt = tt; pv = vv; } else if (vv > pv) { pt = tt; pv = vv; } }
    else if (inP) { inP = false; if (!peaks.length || pt - peaks[peaks.length - 1] >= 1.2) peaks.push(pt); }
  }
  if (!peaks.length) peaks.push(s + (e - s) / 2); // 兜底：段中心
  return peaks;
}

// 代表帧/事件 QC 后的手工覆盖（目读修正，QC 见 README）
// id→峰时刻；段07 事件远景→重定 379.5（loop28 钟形罩窗口）
const PEAK_OVERRIDES = { '04': 317.0, '06': 324.4 };
const SEG_PEAK_OVERRIDE = { '07': 379.5 };

mkdirSync(join(ROOT, 'clips'), { recursive: true });
mkdirSync(join(ROOT, 'frames'), { recursive: true });

const rows = []; let n = 0;
for (const [sid, name, input, s, e, desc] of SEGS) {
  const peaks = findPeaks(s, e);
  console.log(`[段${sid}] ${name}: ${peaks.length} 个动作事件 (峰: ${peaks.map(p => p.toFixed(1)).join(' ')})`);
  if (SEG_PEAK_OVERRIDE[sid] != null) peaks[0] = SEG_PEAK_OVERRIDE[sid];
  peaks.forEach((pk, k) => {
    n++;
    const id = String(n).padStart(2, '0');
    if (PEAK_OVERRIDES[id] != null) pk = PEAK_OVERRIDES[id];
    const a = Math.max(s, pk - 1.8), b = Math.min(e, pk + 1.2);
    const dur = +(b - a).toFixed(2);
    const clip = join(ROOT, 'clips', `zmj_${id}.mp4`);
    const frame = join(ROOT, 'frames', `zmj_${id}.jpg`);
    execSync(`"${FF}" -hide_banner -loglevel error -y -ss ${a.toFixed(2)} -t ${dur} -i "${SRC}" -vf "drawtext=fontfile=C\\:/Windows/Fonts/arial.ttf:text='%{pts\\:hms}':x=24:y=24:fontsize=36:fontcolor=0xFFC850:box=1:boxcolor=black@0.55:boxborderw=5,setpts=${SP}*PTS" -af "atempo=${ATEMPO}" -c:v libx264 -preset medium -crf 19 -c:a aac -b:a 128k "${clip}"`, { stdio: ['ignore', 'ignore', 'inherit'] });
    execSync(`"${FF}" -hide_banner -loglevel error -y -ss ${pk.toFixed(2)} -i "${SRC}" -frames:v 1 -vf "scale=960:540:flags=lanczos" -q:v 3 "${frame}"`);
    rows.push({ id, seg: sid, name, input, a: a.toFixed(2), b: b.toFixed(2), pk: pk.toFixed(2), dur, desc });
  });
}

const csv = ['序号,武器,招式段,输入序列,动作区间(源),发力峰(源),原速时长,动作帧,动作视频,招式说明'];
for (const r of rows) {
  csv.push([r.id, '紫冥剑', r.name, r.input, `${r.a}-${r.b}s`, `${r.pk}s`, `${r.dur}s → ${(r.dur * SP).toFixed(1)}s@0.7x`, `frames/zmj_${r.id}.jpg`, `clips/zmj_${r.id}.mp4`, `"${r.desc.replace(/"/g, '""')}"`].join(','));
}
writeFileSync(join(ROOT, 'table.csv'), '\uFEFF' + csv.join('\n'), 'utf8');
writeFileSync(join(ROOT, 'build', 'events.json'), JSON.stringify(rows, null, 1));
console.log(`done: ${rows.length} events`);
