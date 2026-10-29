#!/usr/bin/env node
/**
 * make_ass.mjs — 双语 + 随语流逐词彩色高亮（karaoke 风格）字幕，输出 ASS
 *
 * 为什么必须用 ASS 而不是 SRT：
 *   · SRT 只有整行起止时间，无法表达"词级"时间；
 *   · ASS 支持样式/颜色/描边/位置，且 libass 逐帧渲染可靠；
 *   · "只高亮当前词"（而不是已唱过的词累计变色）用 ASS 的 \k 做不到（\k 是累计的），
 *     所以这里采用**逐词重绘**：每个词窗口发一条事件，把整句英文重画一遍、只给当前词上色。
 *     事件数 = 词数（本工程素材量级在几百以内，libass 无压力）。
 *
 * 用法：
 *   node Tool/subtitle/make_ass.mjs <cues.json> [--edl edits.json] --out out.ass
 *        [--hl 33E6C8] [--style bilingual|en|zh] [--zh-size 44] [--en-size 40]
 *        [--wrap-zh 16] [--wrap-en 44] [--spoken-color ""]
 *
 * 输入约定（由 Tool/subtitle/make_subs.mjs 产出）：
 *   cues.json.sentences[] = { start, end, en, zh, words:[{word,start,end}] }
 * 若给了 --edl，则把词级时间按保留段重映射到剪辑后的时间轴（跨切点拆词窗口、被切掉的词跳过）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../lib/ff.mjs';

const args = process.argv.slice(2);
if (!args[0]) { console.error('用法: node Tool/subtitle/make_ass.mjs <cues.json> [--edl edits.json] --out out.ass'); process.exit(2); }
const CUES = path.resolve(args[0]);
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const OUT = path.resolve(ROOT, getOpt('--out', 'History/subs/karaoke/out.ass'));
const EDL = getOpt('--edl', '');
const HL = getOpt('--hl', '33E6C8');                 // 当前词高亮色（RRGGBB）
const SPOKEN = getOpt('--spoken-color', '');          // 已唱过的词（可选，默认不变色）
const STYLE = getOpt('--style', 'bilingual');         // bilingual | en | zh
const ZH_SIZE = Number(getOpt('--zh-size', 40));
const EN_SIZE = Number(getOpt('--en-size', 36));
const WRAP_ZH = Number(getOpt('--wrap-zh', 14));
const WRAP_EN = Number(getOpt('--wrap-en', 40));
const ZH_MARGIN_MODE = getOpt('--zh-margin-mode', 'fixed');   // fixed=全片统一（不抖动）| dynamic=按每句英文行数
const EN_MARGIN = Number(getOpt('--en-margin', 26));
const HOLD_TAIL = Number(getOpt('--hold-tail', 0.25));  // 句末词高亮最多再延长多久（秒）
const MIN_SHOW = Number(getOpt('--min-show', 0.067));   // 句末事件最短显示（2 帧 @30fps）
const MERGE_WORD = Number(getOpt('--merge-word', 0.18)); // 词时长 < 该值时并入相邻 tile 一起高亮（防高频跳色）
const W = Number(getOpt('--width', 1280));
const H = Number(getOpt('--height', 720));

const doc = JSON.parse(fs.readFileSync(CUES, 'utf8'));
const sentences = doc.sentences || [];
if (!sentences.length) { console.error('cues.json 里没有 sentences'); process.exit(1); }

// ---------- 1. 时间映射（原片 → 剪辑后） ----------
const spans = [];
if (EDL) {
  const edl = JSON.parse(fs.readFileSync(path.resolve(EDL), 'utf8'));
  let acc = 0;
  for (const k of edl.kept) { spans.push({ srcStart: k.start, srcEnd: k.end, outStart: acc }); acc += k.end - k.start; }
}
const mapPieces = (a, b) => {
  if (!spans.length) return [{ a, b }];
  const pieces = [];
  for (const s of spans) {
    const x = Math.max(a, s.srcStart), y = Math.min(b, s.srcEnd);
    if (y - x <= 0.02) continue;
    pieces.push({ a: s.outStart + (x - s.srcStart), b: s.outStart + (y - s.srcStart) });
  }
  return pieces;
};

// ---------- 2. 文本换行（手工，WrapStyle=2 关闭自动换行） ----------
function wrapZh(text, n) {
  const chars = [...(text || '')];
  const lines = [];
  let rest = chars;
  const isPunct = (ch) => '，。；：、？！,.;:?!'.includes(ch);
  while (rest.length > n) {
    // 优先在标点处断行（窗口内最后 40% 位置），否则硬切
    let cut = -1;
    for (let i = Math.min(rest.length - 1, n); i >= Math.ceil(n * 0.6); i--) {
      if (isPunct(rest[i])) { cut = i + 1; break; }
    }
    if (cut <= 0) cut = n;
    lines.push(rest.slice(0, cut).join(''));
    rest = rest.slice(cut);
  }
  if (rest.length) lines.push(rest.join(''));
  return lines.join('\\N');
}
function wrapEnWords(words) {
  // words: [{word, idx}] —— 按宽度换行，但保留词边界，便于后续上色定位
  const lines = [];
  let cur = [], len = 0;
  for (const w of words) {
    const add = (cur.length ? 1 : 0) + w.word.length;
    if (len + add > WRAP_EN && cur.length) { lines.push(cur); cur = [w]; len = w.word.length; }
    else { cur.push(w); len += add; }
  }
  if (cur.length) lines.push(cur);
  return lines;
}

// ---------- 3. ASS 组装 ----------
const hexToAss = (rrggbb) => {
  const r = rrggbb.slice(0, 2), g = rrggbb.slice(2, 4), b = rrggbb.slice(4, 6);
  return `&H${b}${g}${r}&`.toUpperCase();
};
const ts = (sec) => {
  const cs = Math.max(0, Math.round(sec * 100));
  const h = Math.floor(cs / 360000), m = Math.floor((cs % 360000) / 6000), s = Math.floor((cs % 6000) / 100), c = cs % 100;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
};

const HEADER = `[Script Info]
; 双语 + 逐词高亮（karaoke）—— 由 Tool/subtitle/make_ass.mjs 生成
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 2
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: ZH,SimHei,${ZH_SIZE},&H00FFFFFF,&H00FFFFFF,&H00141414,&H78000000,0,0,0,0,100,100,0,0,1,2.4,1.0,2,48,48,${EN_MARGIN + Math.round(2 * EN_SIZE * 1.30) + 14},1
Style: EN,Arial,${EN_SIZE},&H00FFFFFF,&H00FFFFFF,&H00141414,&H78000000,-1,0,0,0,100,100,0,0,1,2.0,0.8,2,48,48,${EN_MARGIN},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

const events = [];
let wordCount = 0, skipped = 0, remappedSplit = 0;

// 中文行垂直位置：
//  - fixed（默认）：全片统一取"最大英文行数"算一次 → 跨句时中文不上下移动（旧版逐句计算，实测跨句跳动 41px，观感像字幕在抖）
//  - dynamic：按每句英文实际行数抬高（贴合更紧，但跨句会跳）
const enLineCounts = sentences.map((s) => {
  const ws = (s.words || []).filter((w) => w && w.word && Number.isFinite(w.start) && Number.isFinite(w.end));
  return ws.length ? wrapEnWords(ws.map((w, i) => ({ word: w.word, idx: i }))).length : 0;
});
const maxEnLines = Math.max(1, ...enLineCounts);
const zhMarginFixed = EN_MARGIN + Math.round(maxEnLines * EN_SIZE * 1.30) + 14;

for (const s of sentences) {
  const words = (s.words || []).filter((w) => w && w.word && Number.isFinite(w.start) && Number.isFinite(w.end));
  if (!words.length) { skipped++; continue; }

  // 英文排版行数（dynamic 模式下中文的垂直位置要用）
  const lines = wrapEnWords(words.map((w, i) => ({ word: w.word, idx: i })));
  const enLines = lines.length;
  const flat = lines.map((l) => l.map((x) => x.idx));
  // 每个词落在第几行（合并短词时禁止跨行合并——否则会出现"行尾词+下一行行首词"同时高亮，观感很怪）
  const rowOf = new Map();
  lines.forEach((line, li) => line.forEach((x) => rowOf.set(x.idx, li)));

  // 中文行：整句静态显示（时间 = 句子的映射后区间并集）
  // 垂直排版：英文贴底（EN_MARGIN），中文在其上方；位置模式见文件顶部说明。
  const zhMarginV = ZH_MARGIN_MODE === 'fixed'
    ? zhMarginFixed
    : EN_MARGIN + Math.round(enLines * EN_SIZE * 1.30) + 14;
  const zhPieces = mapPieces(s.start, s.end);
  if (STYLE !== 'en' && s.zh) {
    for (const p of zhPieces) {
      events.push({ layer: 0, start: p.a, end: p.b, style: 'ZH', marginV: zhMarginV, text: wrapZh(s.zh, WRAP_ZH) });
    }
  }
  if (STYLE === 'zh') continue;

  // 英文行的"铺砖"规则（修抖动的核心，两轮迭代后的版本）：
  //   · 旧行为：[word.start, word.end] 各自铺 → 词间空档（可达 0.2s）没有事件覆盖，英文整行消失几帧 = 闪断；
  //   · 新行为：每个 tile 一直显示到下一个 tile 开始，**整句无缝**；同一时刻只有一个事件 → 不会重影；
  //   · 另外把"过短词"并入相邻 tile 一起高亮（如 ASR 把 I 听成 i、或 the/a 一闪而过）：
  //     否则高亮每 0.06–0.1s 跳一次，观感就是"抖"，而且单字母的高亮像素太少几乎看不出来。
  const windows = [];
  words.forEach((w, wi) => {
    const pieces = mapPieces(w.start, w.end);
    if (!pieces.length) { skipped++; return; }
    if (pieces.length > 1) remappedSplit++;
    for (const p of pieces) windows.push({ wi, a: p.a, b: Math.max(p.b, p.a + 0.04) });
  });
  const sentPieces = mapPieces(s.start, s.end);
  const sentOutStart = sentPieces.length ? sentPieces[0].a : null;
  const sentOutEnd = sentPieces.length ? sentPieces[sentPieces.length - 1].b : null;
  windows.sort((x, y) => x.a - y.a || x.wi - y.wi);

  // 合并过短窗口：与当前 tile 起点相差 < MERGE_WORD 的词，并进同一 tile（同一帧里一起高亮）；
  // 单/双字母的极短词（ASR 把 LUFS 拆成 "l u f s" 这种）也强制合并——否则高亮只有几个像素，等于没亮，观感像抖。
  // 限制：**只在同一行内合并**。跨行合并会出现"行尾词 + 下一行行首词"同时变色，观感很差（实测 "per"/"second"）。
  const tiles = [];
  for (const w of windows) {
    const last = tiles[tiles.length - 1];
    const txt = (words[w.wi] && words[w.wi].word) || '';
    const tiny = txt.replace(/[^A-Za-z0-9]/g, '').length <= 2 && (w.b - w.a) < 0.3;
    const sameRow = last ? [...last.hl].every((idx) => rowOf.get(idx) === rowOf.get(w.wi)) : false;
    if (last && sameRow && (w.a - last.a < MERGE_WORD || tiny)) { last.hl.add(w.wi); last.lastB = Math.max(last.lastB, w.b); }
    else tiles.push({ a: w.a, b: w.b, lastB: w.b, hl: new Set([w.wi]) });
  }
  // 句首补齐：第一个 tile 从句子起点开始（ASR 首词常比句子晚 30–100ms，否则句首会空一帧）
  if (tiles.length && sentOutStart !== null) tiles[0].a = Math.min(tiles[0].a, sentOutStart);

  for (let i = 0; i < tiles.length; i++) {
    const cur = tiles[i], nxt = tiles[i + 1];
    let end;
    if (nxt && nxt.a > cur.a) {
      end = nxt.a;                                              // 无缝：显示到下一个 tile 开始
    } else if (nxt) {
      end = Math.max(cur.b, cur.a + 0.04);
    } else {
      end = sentOutEnd ? Math.min(cur.lastB + HOLD_TAIL, sentOutEnd) : cur.lastB + HOLD_TAIL;
      end = Math.max(end, cur.a + MIN_SHOW);                    // 只有句末补最小显示，避免与下一条重叠
    }
    end = Math.max(end, cur.a + 0.01);
    const en = lines.map((line, li) => line.map((x) => {
      const isCur = cur.hl.has(x.idx);
      const txt = x.word;
      if (isCur) return `{\\c${hexToAss(HL)}}${txt}{\\r}`;
      if (SPOKEN && x.idx < Math.max(...cur.hl) && flat[li].some((idx) => idx < Math.max(...cur.hl))) return `{\\c${hexToAss(SPOKEN)}}${txt}{\\r}`;
      return txt;
    }).join(' ')).join('\\N');
    events.push({ layer: 1, start: cur.a, end, style: 'EN', marginV: 0, text: en });
    wordCount++;
  }
}

events.sort((a, b) => a.start - b.start || a.layer - b.layer);
const body = events.map((e) => `Dialogue: ${e.layer},${ts(e.start)},${ts(e.end)},${e.style},,0,0,${e.marginV || 0},,${e.text}`).join('\n');
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, HEADER + '\n' + body + '\n');

const dur = events.reduce((m, e) => Math.max(m, e.end), 0);
console.log(`[ass] ${sentences.length} 句 / ${wordCount} 个词级事件 / 跳过 ${skipped} 个被剪掉的词 / 跨切点拆词 ${remappedSplit}`);
console.log(`[ass] 高亮色 #${HL}${SPOKEN ? ` 已唱色 #${SPOKEN}` : ''} / 中文 ${ZH_SIZE}px / 英文 ${EN_SIZE}px / 画布 ${W}x${H} / 覆盖到 ${dur.toFixed(2)}s`);
console.log(`[ass] -> ${path.relative(ROOT, OUT)}`);
