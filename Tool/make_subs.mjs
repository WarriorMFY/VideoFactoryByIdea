#!/usr/bin/env node
/**
 * make_subs.mjs — 字幕流水线：ASR transcript → 句子 → 翻译 → 显示行(cues) → SRT
 *
 * 关键设计（都是踩坑后改的）：
 *   1. **先按句子翻译，再按显示宽度切行**。若先切成半句再翻译，机翻只看到半句上下文，
 *      会出现"第二，把...第三归一化"这类串行错位。
 *   2. **句界用 DP 求最优切分**：在停顿最大处断句，同时限制单句长度；不能只靠"固定停顿阈值"，
 *      因为素材的句间停顿可能只有 0.3~0.4s（实测本用例就是 0.35s）。
 *   3. 显示行：中文按 --max-zh 字切、英文按 --max-en 字符切，行内时间按字数比例分配。
 *   4. 机翻后跑术语表（--glossary），修 LUFS/码率这类专业词被译坏的问题。
 *
 * 用法：
 *   node Tool/make_subs.mjs <transcript.json> --out <dir> [--mt mymemory|agent|none]
 *        [--zh-file 精译.json] [--glossary glossary.json]
 * 输出：cues.json、en.srt、zh.srt、bilingual.srt
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/ff.mjs';

const args = process.argv.slice(2);
if (!args[0]) { console.error('用法: node Tool/make_subs.mjs <transcript.json> --out <dir> [--mt mymemory|agent|none]'); process.exit(2); }
const TRANSCRIPT = path.resolve(args[0]);
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const OUT = path.resolve(ROOT, getOpt('--out', 'History/subs'));
const MT = getOpt('--mt', 'mymemory');
const ZHFILE = getOpt('--zh-file', '');
const GLOSSARY = getOpt('--glossary', '');
const TH = {
  pause: Number(getOpt('--pause', 0.3)),        // 句界停顿阈值（秒）
  maxSent: Number(getOpt('--max-sent', 110)),   // 单句最多字符
  minSentChars: Number(getOpt('--min-sent', 24)),// 单句最少字符（过短则合并）
  maxZh: Number(getOpt('--max-zh', 18)),        // 单行中文字数
  maxEn: Number(getOpt('--max-en', 64)),        // 单行英文字符
  minCue: Number(getOpt('--min-cue', 0.8)),     // 单行最短时长
};
fs.mkdirSync(OUT, { recursive: true });

const tr = JSON.parse(fs.readFileSync(TRANSCRIPT, 'utf8'));
const words = tr.words || [];
if (!words.length) { console.error('transcript 没有词级时间戳'); process.exit(1); }

// ---------- 1. 词 → 句子 ----------
// 策略（简单、可预测）：
//   a) 候选断点 = 词间停顿 ≥ --pause（默认 0.30s）处；
//   b) 若整段几乎没有停顿（如等间隔 TTS），退化为"按 --max-sent 长度切"；
//   c) 合并过短片段（< --min-sent 字符）与相邻片段；
//   d) 单句不得超过 --max-sent 字符（防机翻跑偏）。
function buildSentences(words) {
  const gapAfter = (i) => (words[i + 1] ? Math.max(0, words[i + 1].start - words[i].end) : 0);
  const chunks = [];
  let cur = [];
  const pushChunk = () => { if (cur.length) { chunks.push({ words: cur, start: cur[0].start, end: cur[cur.length - 1].end }); cur = []; } };
  for (let i = 0; i < words.length; i++) {
    cur.push(words[i]);
    const len = cur.reduce((a, w, k) => a + w.word.length + (k ? 1 : 0), 0);
    const gap = gapAfter(i);
    const atPause = gap >= TH.pause;
    const atLen = len >= TH.maxSent;
    if (!words[i + 1] || atPause || atLen) pushChunk();
  }
  pushChunk();
  // 过短片段与后一段合并（末尾则与前一段合并）
  const merged = [];
  for (const c of chunks) {
    const len = c.words.reduce((a, w, k) => a + w.word.length + (k ? 1 : 0), 0);
    if (merged.length && len < TH.minSentChars) {
      const last = merged[merged.length - 1];
      const newLen = last.words.reduce((a, w, k) => a + w.word.length + (k ? 1 : 0), 0) + 1 + len;
      if (newLen <= TH.maxSent) {
        last.words = last.words.concat(c.words); last.end = c.end; continue;
      }
    }
    merged.push({ words: c.words.slice(), start: c.start, end: c.end });
  }
  return merged.map((s) => ({ start: s.start, end: s.end, words: s.words, en: s.words.map((w) => w.word).join(' ') }));
}
const sentences = buildSentences(words);

// ---------- 2. 翻译（句子级） ----------
const CACHE_PATH = path.join(ROOT, 'History', 'asr', 'mt_cache.json');
const cache = fs.existsSync(CACHE_PATH) ? JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')) : {};
const saveCache = () => { fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true }); fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2)); };

async function mymemory(text) {
  const key = `en|zh-CN|${text}`;
  if (cache[key]) return cache[key];
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|zh-CN`;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(25000) });
      const j = await r.json();
      const out = j?.responseData?.translatedText;
      if (out && typeof out === 'string' && !/MYMEMORY WARNING|QUERY LENGTH LIMIT|INVALID/i.test(out)) {
        cache[key] = out; saveCache(); return out;
      }
      await new Promise((res) => setTimeout(res, 900));
    } catch { await new Promise((res) => setTimeout(res, 900)); }
  }
  throw new Error('MyMemory 翻译失败: ' + text.slice(0, 50));
}

const glossary = GLOSSARY && fs.existsSync(GLOSSARY) ? JSON.parse(fs.readFileSync(GLOSSARY, 'utf8')) : {};
function applyGlossary(zh) {
  let out = zh;
  for (const [from, to] of Object.entries(glossary)) {
    if (!from || from.startsWith('_')) continue;
    out = out.split(from).join(to);
  }
  return out;
}

let zhMap = {};
if (MT === 'agent') {
  if (!ZHFILE) { console.error('--mt agent 需要 --zh-file'); process.exit(2); }
  const raw = JSON.parse(fs.readFileSync(ZHFILE, 'utf8'));
  zhMap = raw.map || raw;
}
for (const s of sentences) {
  if (MT === 'none') { s.zh = ''; continue; }
  if (MT === 'agent') {
    const v = zhMap[s.en];
    if (!v) throw new Error('精译文件缺少该句: ' + s.en);
    s.zh = v;
  } else s.zh = applyGlossary(await mymemory(s.en));
}

// ---------- 3. 句子 → 显示行 ----------
function splitZhSent(zh) {
  if (!zh) return [];
  const chars = [...zh];
  const parts = [];
  let i = 0;
  while (i < chars.length) {
    let end = Math.min(chars.length, i + TH.maxZh);
    if (end < chars.length) {
      for (let j = end; j > i + TH.maxZh * 0.55; j--) if ('，。；：、？！,.;:?!'.includes(chars[j - 1])) { end = j; break; }
    }
    parts.push(chars.slice(i, end).join(''));
    i = end;
  }
  const total = chars.length || 1;
  let acc = 0;
  return parts.map((t) => { const w0 = acc / total; acc += [...t].length; return { text: t, w0, w1: acc / total }; });
}
function splitEnSent(en) {
  const ws = en.split(/\s+/).filter(Boolean);
  const parts = [];
  let cur = [];
  for (const w of ws) {
    if (cur.length && (cur.join(' ').length + 1 + w.length) > TH.maxEn) { parts.push(cur.join(' ')); cur = []; }
    cur.push(w);
  }
  if (cur.length) parts.push(cur.join(' '));
  const total = ws.length || 1;
  let acc = 0;
  return parts.map((t) => {
    const n = t.split(/\s+/).filter(Boolean).length;
    const w0 = acc / total; acc += n;
    return { text: t, w0, w1: acc / total };
  });
}
const mapByRange = (parts, r0, r1) => parts.filter((p) => p.w1 > r0 + 1e-6 && p.w0 < r1 - 1e-6 && p.text.trim()).map((p) => p.text.trim()).join('');

const cues = [];
for (const s of sentences) {
  const dur = Math.max(0.2, s.end - s.start);
  const zhParts = splitZhSent(s.zh);
  const enParts = splitEnSent(s.en);
  const n = Math.max(zhParts.length, enParts.length, 1);
  for (let k = 0; k < n; k++) {
    const r0 = k / n, r1 = (k + 1) / n;
    const zhText = zhParts.length === n ? zhParts[k].text : mapByRange(zhParts, r0, r1);
    const enText = enParts.length === n ? enParts[k].text : mapByRange(enParts, r0, r1);
    let start = s.start + dur * r0, end = s.start + dur * r1;
    if (end - start < TH.minCue) {
      const mid = (start + end) / 2;
      start = Math.max(s.start, mid - TH.minCue / 2);
      end = Math.min(s.end + 0.35, mid + TH.minCue / 2);
    }
    cues.push({
      start: Number(start.toFixed(3)), end: Number(end.toFixed(3)),
      en: enText, zh: zhText,
      conf: s.words.length ? Number((s.words.reduce((a, w) => a + (w.conf || 0), 0) / s.words.length).toFixed(3)) : null,
      sent_en: s.en,
    });
  }
}
const finalCues = cues.filter((c) => (c.en || '').trim() || (c.zh || '').trim());

// ---------- 4. SRT ----------
function ts(sec) {
  const ms = Math.round(sec * 1000);
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000), r = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(r).padStart(3, '0')}`;
}
const toSrt = (list, pick) => list.map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${pick(c).filter(Boolean).join('\n')}\n`).join('\n');
fs.writeFileSync(path.join(OUT, 'en.srt'), toSrt(finalCues, (c) => [c.en]));
if (MT !== 'none') {
  fs.writeFileSync(path.join(OUT, 'zh.srt'), toSrt(finalCues, (c) => [c.zh]));
  fs.writeFileSync(path.join(OUT, 'bilingual.srt'), toSrt(finalCues, (c) => [c.zh, c.en]));
}
fs.writeFileSync(path.join(OUT, 'cues.json'), JSON.stringify({
  generated_at: new Date().toISOString(), transcript: TRANSCRIPT, mt_backend: MT, params: TH,
  stats: { sentences: sentences.length, cues: finalCues.length, words: words.length },
  sentences, cues: finalCues,
}, null, 2));

console.log(`[subs] ${sentences.length} 句 → ${finalCues.length} 行字幕（MT=${MT}）`);
for (const s of sentences) console.log(`   句 ${s.start.toFixed(2)}–${s.end.toFixed(2)}  ${s.en.slice(0, 70)}\n              → ${s.zh || ''}`);
console.log(`[subs] -> ${path.relative(ROOT, OUT)}`);
