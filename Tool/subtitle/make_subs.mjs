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
 *        [--zh-file 精译.json] [--glossary glossary.json] [--punct] [--dump-en 待译模板.json]
 *   --dump-en：只导出待译句子模板（`{ "英文原句": "" }`）后退出，不翻译、不产出 cues。
 * 输出：cues.json、en.srt、zh.srt、bilingual.srt
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../lib/ff.mjs';
import { writeSrtSet } from '../lib/srt.mjs';

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
  minSentChars: Number(getOpt('--min-sent', 12)),// 单句最少字符（过短则并到相邻句；真实对白常是短句，默认值调小）
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
// 断句来源：
//   · 默认：按停顿 + 长度自动切（无标点，机翻质量较差）；
//   · `--punct`：使用 restore_punct.mjs 产出的"带标点句子"（tr.sentences 里有 w0/w1），
//     翻译直接吃带标点/大小写的整句 → 实测机翻质量明显提升（术语 luf → LUFS、句末语气正确）。
const PUNCT = args.includes('--punct');
let sentences;
if (PUNCT && Array.isArray(tr.sentences) && tr.sentences.length && Number.isFinite(tr.sentences[0].w0)) {
  sentences = tr.sentences.map((s) => ({
    start: s.start,
    end: s.end,
    words: words.slice(s.w0, s.w1 + 1),
    en: s.text,                       // 带标点/大小写
    punctuated: true,
  }));
  console.log(`[subs] 使用标点恢复后的断句：${sentences.length} 句（--punct）`);
} else {
  if (PUNCT) console.warn('[subs] --punct 但输入里没有 sentences[].w0，回退为自动断句');
  sentences = buildSentences(words);
}

// ---------- 2. 翻译（句子级） ----------
const CACHE_PATH = path.join(ROOT, 'History', 'asr', 'mt_cache.json');
const cache = fs.existsSync(CACHE_PATH) ? JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')) : {};
const saveCache = () => { fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true }); fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2)); };

async function mymemory(text) {
  const key = `en|zh-CN|${text}`;
  if (cache[key]) return cache[key];
  // MyMemory 单次查询上限 500 字符（超了返回 403 QUERY LENGTH LIMIT）→ 超长句先拆成两半再拼
  if (text.length > 480) {
    const cut = text.lastIndexOf(' ', 240) > 80 ? text.lastIndexOf(' ', 240) : 240;
    const a = await mymemory(text.slice(0, cut).trim());
    const b = await mymemory(text.slice(cut).trim());
    const joined = a + b;
    cache[key] = joined; saveCache();
    return joined;
  }
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
// 源端术语纠错（`_source_fixes`）：ASR 常把专名/单位拆坏（实测 LUFS 被听成 "l u fs"）。
// 在**送翻译之前**把源句里的坏写法改回规范写法，机翻才不会把 "l u fs" 当成乱词。
// 注意：必须**精确取** `_source_fixes` 这个键。之前用 startsWith 匹配，结果命中了
// `_source_fixes_note`（说明文字），遍历字符串字符做替换，等于没生效（实测 LUFS 仍被译坏）。
const sourceFixes = glossary._source_fixes || {};
function fixSource(en) {
  let out = en;
  for (const [from, to] of Object.entries(sourceFixes)) out = out.split(from).join(to);
  return out;
}
function applyGlossary(zh) {
  let out = zh;
  for (const [from, to] of Object.entries(glossary)) {
    if (!from || from.startsWith('_')) continue;
    out = out.split(from).join(to);
  }
  return out;
}

// ---------- 2.5 精译稿模板（--dump-en） ----------
// 发布级译文走 `--mt agent --zh-file`，但人工/LLM 得先知道"要译哪些句"。
// 把断句结果导出成 `{ "英文原句": "" }` 模板（**已做源端术语纠错**，如 `l u fs`→`LUFS`），
// 填好中文再传回来；缺句会直接报错（见下面 agent 分支），不会静默退回机翻。
// 放在这里而不是断句之后：模板要对源端纠错后的句子，得等术语表加载完。
const DUMP_EN = getOpt('--dump-en', '');
if (DUMP_EN) {
  const out = path.resolve(ROOT, DUMP_EN);
  const tpl = {};
  for (const s of sentences) tpl[fixSource(s.en)] = '';
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(tpl, null, 2));
  console.log(`[subs] 已导出待译 ${sentences.length} 句 → ${out}`);
  console.log(`[subs] 填好中文后：--mt agent --zh-file ${DUMP_EN}`);
  process.exit(0);
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
    // 精译文件按"标点恢复后的原句"做 key。候选顺序：原句 → 源端纠错后的原句
    // （`--dump-en` 导出的模板用的是纠错后文本，见上一节）→ 去掉句末标点的版本。
    const fixed = fixSource(s.en);
    const v = zhMap[s.en] || zhMap[fixed]
      || zhMap[s.en.replace(/[.,!?]+$/, '')] || zhMap[fixed.replace(/[.,!?]+$/, '')];
    if (!v) throw new Error('精译文件缺少该句: ' + s.en);
    s.zh = v;
  } else {
    s.mt_input = fixSource(s.en);      // 记录实际送翻译的文本，便于审计
    s.zh = applyGlossary(await mymemory(s.mt_input));
  }
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

// ---------- 3.5 阅读速度（CPS）节流 ----------
// 字幕"读不完"是发布级字幕的硬伤：中文超过约 20 字/秒就来不及看。
// 做法（不改变音画对齐，只调显示时长）：
//   ① 先尝试把该条字幕的结束时间往后延（不越过下一条开始）；
//   ② 仍超标就按标点/字数把它拆成两条，按字数比例分配时间（不切到一半的词）。
const CPS = Number(getOpt('--cps', 20));
const before = finalCues.map((c) => ([...String(c.zh || '')].length) / Math.max(0.2, c.end - c.start));
const retimed = [];
for (let i = 0; i < finalCues.length; i++) {
  const c = finalCues[i];
  const nextStart = finalCues[i + 1] ? finalCues[i + 1].start : Infinity;
  const chars = [...String(c.zh || '')].length;
  if (!chars || chars / Math.max(0.2, c.end - c.start) <= CPS) { retimed.push(c); continue; }
  // ① 延长时间
  const need = chars / CPS;
  const maxEnd = Math.min(nextStart - 0.02, c.start + need * 1.6);
  let end = Math.max(c.end, Math.min(maxEnd, c.start + need));
  // ② 还不够就拆成两条
  if (chars / Math.max(0.2, end - c.start) > CPS && nextStart - c.start > 0.8) {
    const mid = Math.floor(chars / 2);
    const zhA = [...String(c.zh || '')].slice(0, mid).join('');
    const zhB = [...String(c.zh || '')].slice(mid).join('');
    const total = end - c.start;
    const cut = c.start + total * (mid / chars);
    retimed.push({ ...c, end: cut, zh: zhA });
    retimed.push({ ...c, start: cut, end, zh: zhB, en: '' });
    continue;
  }
  retimed.push({ ...c, end });
}
finalCues.length = 0;
retimed.forEach((c) => finalCues.push(c));
const after = finalCues.map((c) => ([...String(c.zh || '')].length) / Math.max(0.2, c.end - c.start));
const maxBefore = before.length ? Math.max(...before) : 0;
const maxAfter = after.length ? Math.max(...after) : 0;
const overAfter = after.filter((v) => v > CPS).length;
// 诚实说明：时间窗物理上不够时（下一条已经压上来）无法强行达标，只能尽量延/拆；所以这里**报告超标条数**。
console.log(`[subs] 阅读速度：上限 ${CPS} 字/秒　峰值 ${maxBefore.toFixed(1)} → ${maxAfter.toFixed(1)} 字/秒，超标 ${overAfter}/${finalCues.length} 条（${finalCues.length} 条字幕）`);

// ---------- 4. SRT ----------
writeSrtSet(finalCues, OUT, { mt: MT });
fs.writeFileSync(path.join(OUT, 'cues.json'), JSON.stringify({
  generated_at: new Date().toISOString(), transcript: TRANSCRIPT, mt_backend: MT, params: TH,
  stats: { sentences: sentences.length, cues: finalCues.length, words: words.length },
  sentences, cues: finalCues,
}, null, 2));

console.log(`[subs] ${sentences.length} 句 → ${finalCues.length} 行字幕（MT=${MT}）`);
for (const s of sentences) console.log(`   句 ${s.start.toFixed(2)}–${s.end.toFixed(2)}  ${s.en.slice(0, 70)}\n              → ${s.zh || ''}`);
console.log(`[subs] -> ${path.relative(ROOT, OUT)}`);
