#!/usr/bin/env node
/**
 * restore_punct.mjs — 给 ASR 结果补标点与大小写（无模型、纯规则、可复现）
 *
 * 为什么需要：Vosk 输出是"小写、无标点、无大小写"的一串词。这会带来三个实际损失：
 *   1) 机翻质量下降（实测：`minus sixteen lufs` 被译成 "luf"；补标点+大写后变成 "LUFS"）；
 *   2) 断句只能靠停顿，长句被硬切、短句被并句，翻译上下文被破坏；
 *   3) 字幕观感差（没有句号问号、I 是小写 i）。
 *
 * 做法（全部规则化，参数可调，便于回归）：
 *   · 断句：停顿 > --sent-pause 硬断；句长 ≥ --max-sent 且停顿 > --soft-pause 断；超长句在并列/从属连词前断；
 *   · 大写：句首、代词 I、术语表词、--proper 列表里的专名；
 *   · 句末标点：疑问句（wh- 开头或助动词倒装）→ `?`；感叹词开头且短句 → `!`；其余 → `.`；
 *   · 逗号：连词（and/but/so/because…）前；句首状语（however/finally/first…）后。
 *
 * 用法：
 *   node Tool/subtitle/restore_punct.mjs <transcript.json> [--out transcript_punct.json]
 *        [--glossary Tool/subtitle/glossary_zh.json] [--proper proper.json]
 * 输出：在输入基础上补 `sentences[].text`（带标点）、`text`（全文），并保留原 `words`（时间戳不变）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../lib/ff.mjs';

const args = process.argv.slice(2);
if (!args[0]) { console.error('用法: node Tool/subtitle/restore_punct.mjs <transcript.json> [--out out.json]'); process.exit(2); }
const IN = path.resolve(args[0]);
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const OUT = path.resolve(getOpt('--out', IN.replace(/\.json$/, '.punct.json')));
const GLOSSARY = getOpt('--glossary', '');
const PROPER = getOpt('--proper', '');
const TH = {
  sentPause: Number(getOpt('--sent-pause', 0.55)),   // 超过该停顿直接断句
  softPause: Number(getOpt('--soft-pause', 0.28)),   // 长句内可断句的最小停顿
  maxSent: Number(getOpt('--max-sent', 110)),        // 单句最大字符
  hardSent: Number(getOpt('--hard-sent', 170)),      // 再长就必须断（找连词）
};

const doc = JSON.parse(fs.readFileSync(IN, 'utf8'));
const words = (doc.words || []).map((w) => ({ ...w }));
if (!words.length) { console.error('transcript 里没有 words'); process.exit(1); }

// ---- 词典 ----
const WH = new Set(['what', 'why', 'how', 'when', 'where', 'who', 'whom', 'whose', 'which']);
const AUX = new Set(['is', 'are', 'was', 'were', 'do', 'does', 'did', 'can', 'could', 'will', 'would', 'should', 'shall', 'have', 'has', 'had', 'am', 'may', 'might', 'must']);
const EXCL = new Set(['oh', 'wow', 'no', 'yes', 'hey', 'god', 'damn', 'whoa', 'whoaaa', 'abort', 'cut', 'stop']);
const CONJ_COMMA = new Set(['but', 'so', 'because', 'although', 'though', 'whereas', 'while', 'unless', 'since', 'yet', 'and']);
// 只有"序数/句子连接副词"才补逗号；today/now/later/also 这类时间副词在英语里通常不加
const ORDINAL_ADV = new Set(['first', 'firstly', 'second', 'secondly', 'third', 'thirdly', 'finally', 'next', 'then', 'however', 'actually', 'basically', 'instead', 'therefore', 'meanwhile', 'otherwise']);
const DETERMINER = new Set(['the', 'a', 'an', 'my', 'your', 'his', 'her', 'their', 'our', 'this', 'that', 'these', 'those', 'one']);
const RELATIVE = new Set(['which', 'who', 'whom', 'whose']);
const LEAD_ADVERB = ORDINAL_ADV;   // 兼容旧命名（超长句回退断句时用）
const KEEP_LOWER = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'as', 'by', 'from']);

const glossary = GLOSSARY && fs.existsSync(GLOSSARY) ? JSON.parse(fs.readFileSync(GLOSSARY, 'utf8')) : {};
const proper = PROPER && fs.existsSync(PROPER) ? JSON.parse(fs.readFileSync(PROPER, 'utf8')) : [];
// 术语表里出现的英文词（值里的中文不算），用于大写保护
const glossaryTerms = new Set();
for (const k of Object.keys(glossary)) {
  for (const w of String(k).replace(/[^A-Za-z ]+/g, ' ').split(/\s+/)) if (w.length > 1) glossaryTerms.add(w.toLowerCase());
}
const properSet = new Set([...proper.map((x) => String(x).toLowerCase()), ...glossaryTerms]);

// ---- 1. 切句（保留词索引区间，便于下游按词对齐时间） ----
const gapAfter = (i) => (words[i + 1] ? Math.max(0, words[i + 1].start - words[i].end) : 0);
// 断句阈值自适应：不同素材的词间停顿分布差异极大（TTS：句内 0、句间 0.35；影视：句内 0.2–0.5、句间 0.5–1.5）。
// 用**分位数（p80）**而不是中位数：句间停顿位于分布尾部。
// 早期用 median×3：TTS 上得到 0.28 能用，但影视素材上会把 "you don't / long as i can remember" 切成两句（实测）。
const allGaps = [];
for (let i = 0; i < words.length - 1; i++) allGaps.push(gapAfter(i));
allGaps.sort((a, b) => a - b);
const medianGap = allGaps.length ? allGaps[Math.floor(allGaps.length / 2)] : 0.1;
const p80Gap = allGaps.length ? allGaps[Math.floor(allGaps.length * 0.8)] : 0.1;
const autoSentPause = Math.min(0.7, Math.max(0.3, p80Gap > 0 ? p80Gap : 0.35));
const SENT_PAUSE = args.includes('--sent-pause') ? TH.sentPause : autoSentPause;
console.log(`[punct] 词间停顿 中位数 ${medianGap.toFixed(3)}s / p80 ${p80Gap.toFixed(3)}s → 断句阈值 ${SENT_PAUSE.toFixed(2)}s`);
const chunkLen = (a, b) => words.slice(a, b + 1).reduce((n, w, k) => n + w.word.length + (k ? 1 : 0), 0);
const ranges = [];
let s0 = 0;
const pushRange = (a, b) => { if (b >= a) ranges.push({ w0: a, w1: b }); };
for (let i = 0; i < words.length; i++) {
  const gap = gapAfter(i);
  const len = chunkLen(s0, i);
  const isLast = i === words.length - 1;
  let brk = isLast || gap >= SENT_PAUSE || (len >= TH.maxSent && gap > TH.softPause);
  if (!brk && len >= TH.hardSent) {
    // 超长句：回退到最近的连词处断（避免一个句子横跨十几秒）
    for (let j = i; j > s0 + 3; j--) {
      if (CONJ_COMMA.has(words[j].word) || LEAD_ADVERB.has(words[j].word)) { i = j - 1; brk = true; break; }
    }
    if (!brk) brk = true;
  }
  if (brk) { pushRange(s0, i); s0 = i + 1; }
}

// ---- 2. 逐句上标点/大小写 ----
const cap = (w, { sentenceStart = false } = {}) => {
  if (!w) return w;
  const bare = w.replace(/[^A-Za-z']/g, '');
  if (bare.toLowerCase() === 'i') return w.replace(/i/g, 'I');           // 代词 I
  if (sentenceStart) return w.charAt(0).toUpperCase() + w.slice(1);
  if (properSet.has(bare.toLowerCase())) return w.charAt(0).toUpperCase() + w.slice(1); // 术语/专名
  return w;
};

const sentences = [];
for (const { w0, w1 } of ranges) {
  const ws = words.slice(w0, w1 + 1);
  const raw = ws.map((w) => w.word);
  const first = raw[0].toLowerCase();
  const isQ = WH.has(first) || AUX.has(first);
  const isE = EXCL.has(first) && ws.length <= 6;
  const endMark = isQ ? '?' : isE ? '!' : '.';

  const out = [];
  for (let k = 0; k < ws.length; k++) {
    const w = ws[k];
    const t = cap(w.word, { sentenceStart: k === 0 });
    const low = t.toLowerCase();
    const prevLow = k > 0 ? raw[k - 1].toLowerCase() : '';
    // 逗号 A：连词 / 关系代词前（不在句首；and 不单独加逗号）
    if (k > 0 && ((CONJ_COMMA.has(low) && low !== 'and') || RELATIVE.has(low))) out.push(',');
    out.push(t);
    // 逗号 B：序数/连接副词之后（但 "the first render" 这类被限定词修饰的不加）
    const nextLow = raw[k + 1] ? raw[k + 1].toLowerCase() : '';
    if (ORDINAL_ADV.has(low) && nextLow && !DETERMINER.has(prevLow)) out.push(',');
  }
  let text = out.join(' ').replace(/\s+,/g, ',').replace(/\s+\./g, '.');
  text = text.charAt(0).toUpperCase() + text.slice(1) + endMark;
  sentences.push({
    w0, w1,
    start: Number(ws[0].start.toFixed(3)),
    end: Number(ws[ws.length - 1].end.toFixed(3)),
    text,
    words: ws.map((w, k) => ({ word: ws[k].word, start: w.start, end: w.end, conf: w.conf })),
    end_punct: endMark,
    is_question: isQ,
  });
}

const fullText = sentences.map((s) => s.text).join(' ');
const outDoc = {
  ...doc,
  punct_restored_at: new Date().toISOString(),
  punct_rules: TH,
  text: fullText,
  sentences: sentences.map(({ w0, w1, start, end, text, end_punct, is_question }) => ({ w0, w1, start, end, text, end_punct, is_question })),
  sentences_with_words: sentences,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(outDoc, null, 2));

console.log(`[punct] ${words.length} 词 → ${sentences.length} 句 → ${path.relative(ROOT, OUT)}`);
for (const s of sentences) console.log(`   ${s.start.toFixed(2)}–${s.end.toFixed(2)}  ${s.text}`);
