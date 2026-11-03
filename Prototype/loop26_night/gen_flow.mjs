#!/usr/bin/env node
/**
 * gen_flow.mjs — loop26 v2《AI工坊的一夜》：推理流终端页生成器
 * 视觉语言（人裁决）：除时间帧外，全片只用一个小黑 bash 框——
 * 推理思路（? 行）与工具调用（$ 行 + 输出）以框内一行行文字呈现。
 * 所有内容均来自真实会话记录（loop25/loop26 实际发生的推理与调用），无编造。
 * 产出 flow/*.html，供 render_cards 截图（元素固定高度，尺寸=视口）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'flow');
fs.mkdirSync(OUT, { recursive: true });

// 行类型：think 推理 / cmd 命令 / out 输出 / ok / warn / err
const C = { think: '#e0b45c', cmd: '#5fb3ff', out: '#c9d4dd', ok: '#7ec97e', warn: '#e0905c', err: '#e06c6c', dim: '#6b7683' };
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function scene(id, title, lines, font = 34) {
  const lh = 1.75;
  const bodyH = Math.ceil(lines.length * font * lh) + 48;
  const H = bodyH + 48;   // + 标题栏
  const body = lines.map(([t, s]) => `<div class="${t}">${esc(s)}</div>`).join('');
  const css = `*{margin:0;padding:0;box-sizing:border-box}
body{background:#050607;font:${font}px/${lh} "Cascadia Mono","Consolas",monospace}
.win{background:#0d1013;border:1px solid #262c33;border-radius:12px;overflow:hidden;box-shadow:0 30px 90px rgba(0,0,0,.7);display:flex;flex-direction:column}
.bar{flex:0 0 48px;display:flex;align-items:center;gap:9px;background:#141920;padding:0 18px;border-bottom:1px solid #262c33}
.dot{width:13px;height:13px;border-radius:50%}
.dot:nth-child(1){background:#ff5f57}.dot:nth-child(2){background:#febc2e}.dot:nth-child(3){background:#28c840}
.bar span{margin-left:12px;color:#7d8894;font-size:${Math.round(font * 0.7)}px}
.body{padding:24px 32px;white-space:pre-wrap;word-break:break-all}
.think{color:${C.think}}.cmd{color:${C.cmd}}.out{color:${C.out}}.ok{color:${C.ok}}.warn{color:${C.warn}}.err{color:${C.err}}.dim{color:${C.dim}}
.cmd::before{content:'$ ';color:#54636f}
.think::before{content:'? ';color:#8a6d3b}`;
  // 矮场景：包进 1080 黑底居中（成片整屏 card）；高场景：页面=框本身（成片 pan-d 滚动）
  const CENTER = H <= 960;
  const html = CENTER
    ? `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}
.b{width:1920px;height:1080px;display:flex;align-items:center;justify-content:center;background:#050607}
</style></head><body><div class="b" id="${id}"><div class="win" style="width:1640px"><div class="bar"><div class="dot"></div><div class="dot"></div><div class="dot"></div><span>${esc(title)}</span></div><div class="body">${body}</div></div></div></body></html>`
    : `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}
.win{width:1920px;height:${H}px}
</style></head><body><div class="win" id="${id}"><div class="bar"><div class="dot"></div><div class="dot"></div><div class="dot"></div><span>${esc(title)}</span></div><div class="body">${body}</div></div></body></html>`;
  fs.writeFileSync(path.join(OUT, `${id}.html`), html);
  console.log(`${id}  ${CENTER ? '1920x1080 居中' : `1920x${H} 滚动`}  ${lines.length} 行`);
}

function timecard(id, time, note, sub = '') {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
.b{width:1920px;height:1080px;background:#050607;position:relative;display:flex;align-items:center;justify-content:center}
.tm{font:220px/1 "Cascadia Mono","Consolas",monospace;color:#e8d9b8;letter-spacing:14px;text-shadow:0 0 80px rgba(232,201,160,.25)}
.nt{position:absolute;bottom:200px;left:0;right:0;text-align:center;font:34px/1 "Cascadia Mono","Consolas",monospace;color:#8a7a5c;letter-spacing:10px}
.sb{position:absolute;bottom:130px;left:0;right:0;text-align:center;font:22px/1 "Cascadia Mono","Consolas",monospace;color:#5a5142;letter-spacing:4px}
</style></head><body><div class="b" id="${id}"><div class="tm">${time}</div><div class="nt">${note}</div>${sub ? `<div class="sb">${sub}</div>` : ''}</div></body></html>`;
  fs.writeFileSync(path.join(OUT, `${id}.html`), html);
  console.log(`${id}  1920x1080`);
}

// ============ 剧本（全部真实） ============
scene('s01_wake', 'agent — 开工 · 接令', [
  ['dim',  '23:14 · 工作站接收人令'],
  ['out',  '「锚定B站剪辑区优秀up主5位，观察他们的历史发展史，'],
  ['out',  '  总结出可以复现的技术成长路径图谱」'],
  ['think','这不是看热闹，要拆的是「人是怎么变强的」这个结构。'],
  ['think','先查自己的选种纪律：三判据 = 剪辑承载信息 / 技术可拆解 / 技术可迁移。'],
  ['think','坑 9 教训：视野不能锁死在单一赛道。跨内容域选人。'],
  ['cmd',  'Skill/edit-craft-scouting → S1 选种启动'],
  ['think','五域布点：影视技术流 / 知识区快切 / 游戏叙事 / 氛围长镜 / 鬼畜对位。'],
  ['think','每个域只取头部的那个，控变量。'],
]);

scene('s02_seed', 'agent — S1 选种 · 解析 mid', [
  ['cmd',  'search bili_user 影视飓风   → mid=946974   fans=1890w ✓'],
  ['cmd',  'search bili_user 硬核的半佛仙人 → mid=37663924 fans=771w ✓'],
  ['cmd',  'search bili_user 老番茄     → mid=546195   fans=2087w ✓'],
  ['cmd',  'search bili_user 李子柒     → mid=19577966 fans=1026w ✓'],
  ['cmd',  'search bili_user 伊丽莎白鼠 → mid=375375   fans=716w ✓'],
  ['ok',   '5/5 解析成功 → up_resolved.json'],
  ['think','五个 mid，五条完全不同的剪辑路线。接下来拉全量投稿时间线。'],
]);

scene('s03_risk', 'agent — 翻车 0.5：风控', [
  ['cmd',  'GET x/space/wbi/arc/search?mid=546195&pn=1'],
  ['err',  'code -352 风控拦截，退避 4s'],
  ['warn', '重试 ×3 … 仍然 -352'],
  ['think','不是频率问题——游客 cookie 根本过不了空间接口。'],
  ['think','想起发布脚本有现成的登录态浏览器 profile。'],
  ['cmd',  'launchProfile(Workspace/run/bili_profile) → ctx.request 重发'],
  ['ok',   'code 0 · 通道打通，开始全量采集'],
]);

scene('s04_crawl', 'agent — 全量时间线 · 2432 条', [
  ['cmd',  'wbi 签名 → x/space/wbi/arc/search (ps=50, order=pubdate)'],
  ['out',  '影视飓风   p1/40 +50 … p40/40 +37   （上限 2000 条，防失控）'],
  ['out',  '硬核的半佛仙人 p1/33 +50 … 全量 1652 条'],
  ['out',  '老番茄 … 李子柒 … 伊丽莎白鼠 …'],
  ['ok',   '五人合计 2432 条投稿，按时间正序重排'],
  ['think','光有列表没有用，要找的是「爬坡点」。'],
  ['think','定义：播放量 > 前5条均值 ×8 且 ≥50w —— 突变才有信息量。'],
  ['cmd',  '年度聚合 + 爬坡点扫描 → timeline_<mid>.json ×5'],
]);

scene('s05_wrong', 'agent — 翻车一：同名小号', [
  ['cmd',  'search bili_user "半佛仙人"'],
  ['out',  '命中 → mid=24189353  fans=11'],
  ['warn', '11 个粉？这不对。'],
  ['think','搜索命中了同名的旁观者小号，不是本人。'],
  ['think','根因：解析逻辑是「精确匹配失败就取首位结果」——这里埋着雷。'],
  ['cmd',  'search bili_user "硬核的半佛仙人" → mid=37663924 fans=771w'],
  ['ok',   '这才对。给采集器加「降级命中」告警，下次先报再降。'],
]);

scene('s06_quant', 'agent — 量化判卷 · 早期 vs 成熟期', [
  ['cmd',  '下载 10 条代表样本 → shot_profile ×10'],
  ['out',  '影视飓风  ASL 13.38 → 3.79    p90 34.4 → 7.4'],
  ['out',  '李子柒    ASL  8.60 → 2.29    p90 23.0 → 3.5'],
  ['out',  '老番茄    ASL  2.02 → 2.84    （2013 首年即成熟）'],
  ['out',  '半佛      ASL  2.75 → 2.98    （7 年几乎不动）'],
  ['think','意外的发现：成熟不是整体变快，是分布收窄——p90 塌缩。'],
  ['think','基本功是集中练成的，没有渐进曲线。老番茄开号那天就是 2 秒。'],
  ['cmd',  '抽帧拼图 ×10 → 人工目验交叉核对'],
]);

scene('s07_verdict', 'agent — 图谱成形 · 交人闸门', [
  ['think','T0 基本功 → T1 差异化（首爬 8-15×）→ T2 结构化 → T3 工业化。'],
  ['think','半佛反例：剪辑可以是固定配方，成长杠杆转移到产能与选题。'],
  ['out',  '给我们自己拟了 A-D 四条路径 → 停在人闸门'],
  ['out',  '人类裁决：「B」—— 氛围过程美学。'],
  ['out',  '选题投票：「AI工坊的一夜」—— 拍这条流水线自己。'],
  ['think','方向定了：无解说、纯过程、环境音。素材零摆拍，全用真实产物。'],
]);

scene('s08_build', 'agent — 建造', [
  ['cmd',  'gen_screens.mjs → 终端窗 / 代码窗 HTML ×5'],
  ['cmd',  'render_cards → 截图 → img / cards 归位'],
  ['cmd',  'make_essay --spec loop26_night --no-bgm'],
  ['think','预检发现纵向滚动感不够：pan 固定 z=1.10，行程只有 10%。'],
  ['cmd',  'make_essay 升级：新增运镜变焦语法 pan-d@1.35'],
  ['think','氛围音走另一条线：手写 PCM —— 底噪、风扇、键盘簇、上线铃。'],
  ['cmd',  'gen_ambience.mjs 69.8s → ambience.wav'],
]);

scene('s09_crash', 'agent — 翻车二：渲染失败', [
  ['cmd',  'make_essay 重渲'],
  ['err',  'clip c2_01_code 渲染失败'],
  ['err',  "Invalid too big or non positive size for width '1920' or height '2600'"],
  ['think','spec 里的 crop 写了 2600 —— 我以为截图是视口尺寸。'],
  ['think','实测五张截图：boot 588 / encode 588 / code 1448 / manifest 681 / api 100'],
  ['think','render_cards 截的是元素实际高度，不是视口。假设错了。'],
  ['warn', 'api 只有 100px？JSON 是压缩单行，没有换行就没有高度。'],
  ['think','两个修复：窗体固定高度+字号缩放；JSON pretty-print。'],
]);

scene('s10_fix', 'agent — 修复与通过', [
  ['cmd',  'gen_screens 加 height / font 参数 → 重生成 ×5'],
  ['cmd',  '重截 → 1920x1080 / 2160 / 1448 全部对齐，无告警'],
  ['cmd',  'make_essay 重渲'],
  ['out',  '[56.5s] 29 个 clip · [57.2s] concat 校验 69.80s'],
  ['ok',   '[70.8s] 成片 69.80s · 13.4MB（视频流校验通过）'],
  ['cmd',  'amix：whoosh/impact + ambience → loudnorm → final.mp4'],
]);

scene('s11_qc', 'agent — 天亮验收', [
  ['cmd',  'shot_profile → ASL 3.33s · 短镜 66.7% · 切点 17.2/min'],
  ['out',  'loop23 基线   ASL 7.1s  · 短镜 22%'],
  ['out',  '李子柒基准   ASL 2.29s · 短镜 83%'],
  ['think','形态在向目标收敛。QC 14 格目验全过。'],
  ['think','内容密度还不够——人反馈：配图太常规，推理和调用才是主角。'],
]);

scene('s12_wait', 'agent — v2 · 等待', [
  ['think','于是有了这一版：全片只剩一个小黑框，'],
  ['think','推理一行行想，工具一个个调，翻车一次次修。'],
  ['out',  '成片已就绪，发布决策移交人类。'],
  ['dim',  '… waiting for human …'],
]);

// 时间帧
timecard('t1', '23:14', '接 令', '人令：锚定五位剪辑强UP，拆他们的成长史');
timecard('t2', '23:47', '采 集', '2432 条投稿，正在穿过风控');
timecard('t3', '00:41', '翻 车 一', '同名小号，11 个粉');
timecard('t4', '01:58', '判 卷', 'A-D 四条路径，人类选了 B');
timecard('t5', '03:26', '翻 车 二', 'crop 2600 > 1448，渲染失败');
timecard('t6', '05:58', '天 亮', '69.8s 成片 · 视频流校验通过');

console.log('全部生成 →', OUT);
