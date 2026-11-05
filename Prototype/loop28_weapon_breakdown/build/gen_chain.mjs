#!/usr/bin/env node
/**
 * loop28 v2 —— 动力链逐帧 ASS 生成器
 *
 * 原理：人工在关键帧上标定「足/腰/肩/手/剑尖」五个锚点（640x360 源坐标），
 * 相邻关键帧之间 smoothstep 插值 → Catmull-Rom 拟合成一条"发力链"平滑弧，
 * 每个动作小节内弧线从足部生长到剑尖（对应发力顺序），尾端带箭头 + 流动光点，
 * 逐帧输出 ASS drawing 事件（1280x720 PlayRes），烧录到 0.25x 慢放画面上。
 *
 * 用法：node gen_chain.mjs   →  build/chainA.ass / chainB.ass / chainC.ass
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FPS = 30;

/* ---------------- 段规格：源窗口 + 动作小节 + 锚点关键帧 ---------------- */
/* 锚点格式 [foot, hip, shoulder, hand, tip]，640x360 源坐标，y 向下 */
const SEGS = {
  A: {
    t0: 302.4, dur: 3.0,
    acts: [
      { name: '壹之① 横撩起手 —— 力从地起', s: 0.0, e: 1.05 },
      { name: '壹之② 低位连环 —— 腰马合一', s: 1.05, e: 2.0 },
      { name: '壹之③ 回旋劈杀 —— 力达剑锋', s: 2.0, e: 3.0 },
    ],
    keys: [
      { t: 302.50, p: [[225, 344], [219, 255], [213, 190], [243, 142], [273, 101]] },
      { t: 302.90, p: [[296, 356], [302, 290], [296, 243], [355, 219], [580, 184]] },
      { t: 303.30, p: [[243, 326], [255, 266], [243, 219], [219, 254], [166, 296]] },
      { t: 303.90, p: [[356, 337], [332, 272], [320, 243], [284, 254], [190, 178]] },
      { t: 304.50, p: [[320, 337], [320, 290], [310, 266], [355, 278], [420, 302]] },
      { t: 305.20, p: [[302, 337], [308, 284], [302, 231], [344, 190], [533, 160]] },
    ],
  },
  B: {
    t0: 319.5, dur: 2.0,
    acts: [
      { name: '贰之① 金环贯斩 —— 拧腰成环', s: 0.0, e: 0.75 },
      { name: '贰之② 杀气凝聚 —— 沉气蓄劲', s: 0.75, e: 1.2 },
      { name: '贰之③ 斜裂大劈 —— 全身放箭', s: 1.2, e: 2.0 },
    ],
    keys: [
      { t: 319.60, p: [[302, 314], [302, 260], [296, 219], [272, 195], [178, 178]] },
      { t: 320.00, p: [[243, 337], [249, 272], [243, 219], [296, 178], [403, 112]] },
      { t: 320.40, p: [[296, 337], [308, 296], [302, 254], [237, 243], [166, 237]] },
      { t: 320.90, p: [[296, 337], [290, 284], [284, 237], [332, 207], [500, 70]] },
    ],
  },
  C: {
    t0: 378.4, dur: 2.5,
    acts: [
      { name: '叁之① 引剑问龙 —— 意在剑先', s: 0.0, e: 0.9 },
      { name: '叁之② 金丝缠身 —— 气贯长虹', s: 0.9, e: 1.7 },
      { name: '叁之③ 栖龙剑阵成 —— 万剑归一', s: 1.7, e: 2.5 },
    ],
    keys: [
      { t: 378.60, p: [[266, 326], [270, 254], [266, 195], [296, 178], [337, 136]] },
      { t: 379.20, p: [[272, 337], [278, 266], [272, 213], [308, 195], [390, 130]] },
      { t: 379.80, p: [[243, 348], [249, 284], [243, 225], [278, 207], [391, 106]] },
      { t: 380.40, p: [[225, 348], [231, 290], [225, 231], [266, 213], [462, 130]] },
    ],
  },
};
const SLOW = 4; // 0.25x 慢放

/* ---------------- 几何工具 ---------------- */
const smooth = t => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
const lerpPt = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];

/** 锚点插值：给定源相对时间，返回 5 锚点 */
function anchorsAt(seg, tRel) {
  const ks = seg.keys;
  if (tRel <= ks[0].t - seg.t0) return ks[0].p;
  if (tRel >= ks[ks.length - 1].t - seg.t0) return ks[ks.length - 1].p;
  for (let i = 0; i < ks.length - 1; i++) {
    const a = ks[i].t - seg.t0, b = ks[i + 1].t - seg.t0;
    if (tRel >= a && tRel <= b) {
      const u = smooth((tRel - a) / (b - a));
      return ks[i].p.map((p, j) => lerpPt(p, ks[i + 1].p[j], u));
    }
  }
  return ks[ks.length - 1].p;
}

/** Chaikin 切角平滑（无过冲，Catmull-Rom 在近距锚点间会折返——踩过） */
function chaikin(pts, iter = 3) {
  let p = pts;
  for (let k = 0; k < iter; k++) {
    const q = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i], b = p[i + 1];
      q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      q.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    q.push(p[p.length - 1]);
    p = q;
  }
  return p;
}
/** 动力链曲线：5 锚点 → 密集平滑折线（用于 ASS drawing） */
function chainCurve(pts) { return chaikin(pts, 3); }

/**
 * 带状闭合多边形：libass 的 drawing 是「填充多边形」语义——m/l 路径自动闭合，
 * \bord 描的是闭合轮廓而非开放曲线（踩过：平滑折线直接 bord 描边会渲染成闭合 V 形）。
 * 要画"开放的线"，必须沿曲线法向偏移出上下沿、构造成闭合带再 fill。
 */
function ribbon(pts, halfW) {
  const up = [], dn = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const L = Math.hypot(dx, dy) || 1;
    dx /= L; dy /= L;
    up.push([pts[i][0] - dy * halfW, pts[i][1] + dx * halfW]);
    dn.push([pts[i][0] + dy * halfW, pts[i][1] - dx * halfW]);
  }
  const all = [...up, ...dn.reverse()];
  return all.map((p, i) => `${i === 0 ? 'm' : 'l'} ${Math.round(p[0])} ${Math.round(p[1])}`).join(' ');
}

/** 折线按比例截断（progress 0-1），返回截断点列 */
function truncate(line, prog) {
  const n = Math.max(2, Math.round(line.length * prog));
  return line.slice(0, n);
}

/* ---------------- ASS 输出工具 ---------------- */
function tass(s) {
  const cs = Math.max(0, Math.round(s * 100));
  const h = Math.floor(cs / 360000), m = Math.floor(cs / 6000) % 60, sec = Math.floor(cs / 100) % 60, c = cs % 100;
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}

/** 小圆点 drawing（以 0,0 为圆心，r=3） */
const DOT = 'm 3 0 b 3 1.7 1.7 3 0 3 b -1.7 3 -3 1.7 -3 0 b -3 -1.7 -1.7 -3 0 -3 b 1.7 -3 3 -1.7 3 0';

let evId = 0;
function dial(start, end, layer, style, text) {
  return `Dialogue: ${layer},${tass(start)},${tass(end)},${style},,0,0,0,,${text}`;
}

/* ---------------- 主生成 ---------------- */
function genAss(key) {
  const seg = SEGS[key];
  const durDisp = seg.dur * SLOW;
  const frames = Math.round(durDisp * FPS);
  const ev = [];
  const header = [
    '[Script Info]', 'ScriptType: v4.00+', 'PlayResX: 1280', 'PlayResY: 720', 'WrapStyle: 0', 'ScaledBorderAndShadow: yes', '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    // 注意：drawing 事件样式必须 BorderStyle 1；Borderstyle 3 会给 drawing 画不透明底盒（踩过）
    'Style: Chain,Microsoft YaHei,10,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,7,0,0,0,1',
    'Style: Mark,Microsoft YaHei,10,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,2,0,7,0,0,0,1',
    'Style: FrameNo,Consolas,22,&H00E8DFD2,&H000000FF,&H96000000,&H00000000,1,0,0,0,100,100,1,0,3,4,0,9,20,20,20,1',
    'Style: ActName,Microsoft YaHei,38,&H00FFFFFF,&H000000FF,&H96000000,&H00000000,1,0,0,0,100,100,2,0,3,6,0,8,60,0,52,1',
    'Style: Legend,Microsoft YaHei,24,&H00D8CFBF,&H000000FF,&H96000000,&H00000000,0,0,0,0,100,100,1,0,3,5,0,2,60,0,40,1',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  // 图例（每段开头 1.8s）
  ev.push(dial(0.2, 2.0, 2, 'Legend', '发力链解读：足 → 腰 → 肩 → 剑 ｜ 弧线生长方向 = 力的传递方向'));

  for (let f = 0; f < frames; f++) {
    const tDisp = f / FPS;
    const tRel = tDisp / SLOW; // 源相对秒
    const srcFrame = Math.round((seg.t0 + tRel) * FPS);
    const anchors = anchorsAt(seg, tRel).map(([x, y]) => [x * 2, y * 2]); // → 1280x720
    const line = chainCurve(anchors);

    // 找当前动作小节
    const act = seg.acts.find(a => tRel >= a.s && tRel < a.e) || seg.acts[seg.acts.length - 1];
    const aRel = (tRel - act.s) / (act.e - act.s); // 小节内进度 0-1
    // 发力进度：小节前 55% 完成 0→1（快起缓收），之后保持
    const prog = aRel < 0.55 ? smooth(aRel / 0.55) : 1;
    // 淡出：小节最后 18%
    const fade = aRel > 0.82 ? Math.max(0, 1 - (aRel - 0.82) / 0.18) : 1;
    const alpha3 = fade < 1 ? Math.round((1 - fade) * 0xB0) : 0;
    const aTag = alpha3 > 0 ? `\\alpha&H${alpha3.toString(16).padStart(2, '0')}&` : '';

    const shown = truncate(line, prog);
    const band = ribbon(shown, 1.6);
    // 光晕层（宽带+大模糊+半透明）
    ev.push(dial(tDisp, tDisp + 1 / FPS, 0, 'Chain',
      `{\\p1\\bord0\\1c&HFFFFFF&\\1a&H70&${aTag}\\blur3}${ribbon(shown, 4)}{\\p0}`));
    // 主线（细带，亮）
    ev.push(dial(tDisp, tDisp + 1 / FPS, 0, 'Chain',
      `{\\p1\\bord0\\1c&HFFFFFF&\\1a&H18&${aTag}\\blur0.3}${band}{\\p0}`));

    // 锚点节点：足/腰/肩/手 4 点 + 剑尖大点
    const names = ['足', '腰', '肩', '手'];
    anchors.slice(0, 4).forEach((p, i) => {
      ev.push(dial(tDisp, tDisp + 1 / FPS, 1, 'Mark',
        `{\\p1\\bord0\\1c&HFFFFFF&\\1a&H${Math.round(0x30 + 0x20 * i).toString(16).padStart(2, '0')}&${aTag}\\pos(${Math.round(p[0])},${Math.round(p[1])})}${DOT}{\\p0}`));
      if (f % (FPS * 2) === 0) { // 每 2s 提示一次节点名（避免刷屏，仅在整帧时刻）
        // 节点名跟随点太吵，略
      }
    });
    // 剑尖：实心亮点
    const tip = anchors[4];
    ev.push(dial(tDisp, tDisp + 1 / FPS, 1, 'Mark',
      `{\\p1\\bord0\\1c&HFFFFFF&\\1a&H${Math.round(0x10 + (1 - fade) * 0xA0).toString(16).padStart(2, '0')}&\\pos(${Math.round(tip[0])},${Math.round(tip[1])})}${DOT}{\\p0}`));

    // 箭头：弧末端的切线方向小 V
    if (prog > 0.35) {
      const e1 = shown[shown.length - 2], e2 = shown[shown.length - 1];
      const dx = e2[0] - e1[0], dy = e2[1] - e1[1], L = Math.hypot(dx, dy) || 1;
      const ux = dx / L, uy = dy / L; // 切线单位向量
      const px = -uy, py = ux;
      const ah = 14, aw = 7;
      const a1 = [e2[0] - ux * ah + px * aw, e2[1] - uy * ah + py * aw];
      const a2 = [e2[0] - ux * ah - px * aw, e2[1] - uy * ah - py * aw];
      ev.push(dial(tDisp, tDisp + 1 / FPS, 1, 'Chain',
        `{\\p1\\bord0\\1c&HFFFFFF&\\1a&H18&${aTag}\\blur0.5}m ${Math.round(a1[0])} ${Math.round(a1[1])} l ${Math.round(e2[0])} ${Math.round(e2[1])} l ${Math.round(a2[0])} ${Math.round(a2[1])} l ${Math.round(e2[0] - ux * ah * 0.45)} ${Math.round(e2[1] - uy * ah * 0.45)} l ${Math.round(a1[0])} ${Math.round(a1[1])}{\\p0}`));
    }

    // 流动光点：两个光珠沿已生长弧线滚动
    for (let k = 0; k < 2; k++) {
      const ph = ((tDisp * 0.55) + k * 0.5) % 1;
      const idx = Math.min(shown.length - 1, Math.floor(ph * shown.length));
      const q = shown[idx];
      ev.push(dial(tDisp, tDisp + 1 / FPS, 1, 'Mark',
        `{\\p1\\bord0\\1c&HFFFFFF&\\1a&H30&\\blur3\\pos(${Math.round(q[0])},${Math.round(q[1])})}${DOT}{\\p0}`));
    }

    // 帧号角标（右上）
    ev.push(dial(tDisp, tDisp + 1 / FPS, 2, 'FrameNo',
      `逐帧 FRAME ${String(srcFrame).padStart(4, '0')} · ${SLOW}× SLOW-MO`));

    // 动作小标（小节开头 1.1s 显示，淡入淡出）
    const actStartDisp = act.s * SLOW;
    const dt = tDisp - actStartDisp;
    if (dt >= 0 && dt < 1.1) {
      const aIn = Math.min(1, dt / 0.15), aOut = Math.min(1, (1.1 - dt) / 0.25);
      const al = Math.round((1 - Math.min(aIn, aOut)) * 0xFF);
      ev.push(dial(tDisp, tDisp + 1 / FPS, 2, 'ActName',
        `{\\alpha&H${al.toString(16).padStart(2, '0')}&\\t(0,120,\\fscx100\\fscy100)\\fscx${Math.round(92 + 8 * aIn)}}${act.name}{\\alpha}`));
    }
  }

  const out = [...header, ...ev].join('\n') + '\n';
  const file = path.join(HERE, `chain${key}.ass`);
  fs.writeFileSync(file, out);
  console.log(`${file}: ${ev.length} events / ${durDisp.toFixed(1)}s disp`);
}

for (const k of Object.keys(SEGS)) genAss(k);
console.log('done');
