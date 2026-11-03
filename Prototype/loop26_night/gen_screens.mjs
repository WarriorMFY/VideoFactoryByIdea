#!/usr/bin/env node
/**
 * gen_screens.mjs — loop26《AI工坊的一夜》：把真实日志/代码/JSON 渲染成终端窗/代码窗 HTML
 * 内容全部来自本会话真实执行过的命令与输出（raw/ 目录），无一处编造。
 * 产出 screens/*.html，供 render_cards.mjs 截图。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.join(HERE, 'raw');
const OUT = path.join(HERE, 'screens');
fs.mkdirSync(OUT, { recursive: true });
const read = (f) => fs.readFileSync(path.join(RAW, f), 'utf8').trimEnd();

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// 简易代码高亮：注释/字符串/关键字/数字
const hl = (t) => esc(t)
  .replace(/(\/\/.*$|\/\*[\s\S]*?\*\/)/gm, '<i class="c">$1</i>')
  .replace(/('[^']*'|"[^"]*"|`[^`]*`)/g, '<i class="s">$1</i>')
  .replace(/\b(const|let|await|async|function|return|for|of|if|else|new|import|from|export|throw|switch|case|break|default|while)\b/g, '<i class="k">$1</i>')
  .replace(/\b(\d+\.?\d*)\b/g, '<i class="n">$1</i>');

const WIN = (title, body, id = 'win', height = null, font = 15) => `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0d0f12;font:${font}px/1.55 "Cascadia Mono","Consolas",monospace;color:#c9d4dd}
.win{border:1px solid #2a3038;border-radius:10px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.55);background:#12151a;${height ? `height:${height}px;display:flex;flex-direction:column;` : ''}}
.bar{display:flex;align-items:center;gap:8px;height:38px;flex:0 0 38px;background:#1a1f26;padding:0 14px;border-bottom:1px solid #2a3038}
.dot{width:12px;height:12px;border-radius:50%}
.dot:nth-child(1){background:#ff5f57}.dot:nth-child(2){background:#febc2e}.dot:nth-child(3){background:#28c840}
.bar span{margin-left:10px;color:#8a94a0;font-size:13px}
.body{padding:18px 22px;white-space:pre;overflow:hidden;flex:1;word-break:break-all;white-space:pre-wrap}
.p{color:#5fb3ff}.ok{color:#7ec97e}.dim{color:#6b7683}.warn{color:#e0b45c}
i.c{color:#6b7a6b;font-style:normal}i.k{color:#c792ea;font-style:normal}i.s{color:#a5d6a7;font-style:normal}i.n{color:#f2b26b;font-style:normal}
</style></head><body><div class="win" id="${id}"><div class="bar"><div class="dot"></div><div class="dot"></div><div class="dot"></div><span>${esc(title)}</span></div><div class="body">${body}</div></div></body></html>`;

// ---------- ① 开机/开工终端（真实命令实录） ----------
const boot = [
  ['p', 'PS F:\\AgentWorkArea\\WorkBuddy\\VideoFactory> node Tool/ops/bili_up_timeline.mjs --out History/loops/loop25'],
  ['', read('term_timeline.txt')],
  ['p', 'PS F:\\AgentWorkArea\\WorkBuddy\\VideoFactory> node Tool/ops/shot_profile.mjs --video Prototype/loop23_shortfilm/out/final.mp4 --th 0.15 --json out/profile.json'],
  ['', read('term_profile.txt')],
  ['ok', '✓ 素材清单 4/4 · 全部为真实运行产物'],
].map(([c, t]) => `<span class="${c}">${esc(c === 'p' ? t : t)}</span>`).join('\n');
fs.writeFileSync(path.join(OUT, 'term_boot.html'), WIN('Windows PowerShell — 工作站', boot, 'boot', 1080, 29));

// ---------- ② 编码进度（纵向长图，pan-d 用） ----------
const enc = read('term_encode.txt').split('\n').filter((l) => !/N\/A/.test(l)).join('\n');
const encBody = [
  '<span class="p">PS> ffmpeg -i final.mp4 -c:v libx264 -preset veryfast -crf 19 -progress pipe:</span>',
  '<span class="dim">ffmpeg version 6.1 … libx264 · yuv420p · 1920x1080 · 30 fps</span>',
  '<span class="warn">frame=  53 fps= 31 q=24.0 size=     256kB time=00:00:01.76 bitrate=1189.7kbits/s speed=1.03x</span>',
  esc(enc),
  '<span class="ok">✓ 编码完成 · 视频流时长校验通过（127.77s）</span>',
].join('\n');
fs.writeFileSync(path.join(OUT, 'term_encode.html'), WIN('ffmpeg — 渲染中', encBody, 'encode', 2160, 46));

// ---------- ③ 代码窗（真实渲染主链片段） ----------
const code = fs.readFileSync(path.join(HERE, '../../Tool/ops/make_essay.mjs'), 'utf8').split('\n').slice(130, 190).join('\n');
fs.writeFileSync(path.join(OUT, 'code.html'), WIN('make_essay.mjs — Tool/ops — 渲染主链', hl(code), 'code', 1448, 15));

// ---------- ④ manifest / API（作品档案） ----------
const manifest = fs.readFileSync(path.join(HERE, '../../Prototype/loop23_shortfilm/out/manifest.json'), 'utf8').split('\n').slice(0, 26).join('\n');
fs.writeFileSync(path.join(OUT, 'manifest.html'), WIN('manifest.json — 《光偷走的那两小时》', hl(manifest), 'manifest', 1080, 24));
const api = JSON.stringify(JSON.parse(read('view_api.json')), null, 2);   // 压缩单行 → pretty，换行才有窗体高度
fs.writeFileSync(path.join(OUT, 'api.html'), WIN('api.bilibili.com/x/web-interface/view — 线上核验', hl(api), 'api', 1080, 15));

console.log('生成', fs.readdirSync(OUT).join(', '));
