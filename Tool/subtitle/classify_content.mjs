#!/usr/bin/env node
/**
 * classify_content.mjs — 内容形态分诊：给一条视频算几个**可计算**的信号，输出"当前策略建议"
 *
 * 重要：这不是给工厂定边界，而是**当前版本的能力画像**（会随模型/规则升级而变化）。
 * 它的用途只有一个：交付前先说清"这条内容现在能自动到什么程度"，而不是事后解释。
 *
 * 信号（都能量化、都能复现）：
 *   speech_ratio     识别词覆盖的时长 / 总时长      —— 语音是否"铺满"（教学/旁白高，剧情片低）
 *   asr_conf         识别平均置信度                  —— 干净近场麦高，影混音低
 *   dyn_spread_db    音频帧能量的 p90−p10           —— 配乐/音效/爆炸多则大
 *   short_ratio      1–3 词短句 / 总句数             —— 剧情片/喊叫多则高（短句最容易被漏）
 *   words_per_sent   句均词数                        —— 教学口播句子长而完整
 *   term_per_100w    术语/数字单位密度（每 100 词）  —— 知识型内容高，且是"自动发布"最靠得住的信号
 *
 * 输出：class = knowledge | mixed | narrative + 建议（CPS 上限、翻译后端、是否需要人工校对/精译）
 *
 * 用法：node Tool/subtitle/classify_content.mjs <media> [--transcript t.json] [--json out.json] [--no-audio]
 */
import fs from 'node:fs';
import path from 'node:path';
import { ffmpeg, durationOf, ROOT } from '../lib/ff.mjs';

const args = process.argv.slice(2);
if (!args[0]) { console.error('用法: node Tool/subtitle/classify_content.mjs <media> [--transcript t.json] [--json out.json] [--no-audio]'); process.exit(2); }
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const MEDIA = path.resolve(ROOT, args[0]);
const TR = getOpt('--transcript', '') ? path.resolve(ROOT, getOpt('--transcript', '')) : '';
const JSON_OUT = getOpt('--json', '');
const NO_AUDIO = args.includes('--no-audio');
const WORK = path.join(ROOT, 'History', 'asr', '.classify', `run_${process.pid}`);

const dur = durationOf(MEDIA, path.join(ROOT, 'History', 'runs', '_logs', 'cls_dur.log'));
if (!dur) { console.error('读不到媒体时长:', MEDIA); process.exit(1); }

// ---------- 音频能量分布 ----------
// 关键信号 `music_ratio`：**有声但没有词**的帧占比。
// 为什么用它：TTS/口播里"有声音=有人在说话"，而影视混音里"有声音"大半是配乐/音效。
// 实测（小循环 11）：l2 教学片 ~0.1，TOS 90s ~0.7 —— 比"动态范围"稳得多
// （动态范围会反向：TTS 的词间起伏大、配乐反而平稳，容易把两者判反）。
let dynSpread = null;
let speechEnergyRatio = null;
let musicRatio = null;
{
  // 先把词区间读出来（帧级判断"这一帧有没有人在说话"要用）
  const tr0 = TR ? JSON.parse(fs.readFileSync(TR, 'utf8')) : null;
  const spans = (tr0?.words || []).map((w) => [Number(w.start), Number(w.end)]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a);
  if (!NO_AUDIO) {
    fs.mkdirSync(WORK, { recursive: true });
    const pcmFile = path.join(WORK, 'a.pcm');
    const r = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-i', MEDIA, '-vn', '-ac', '1', '-ar', '16000',
      '-f', 's16le', '-acodec', 'pcm_s16le', pcmFile], path.join(WORK, 'ff.log'));
    if (r.status === 0 && fs.existsSync(pcmFile)) {
      const pcm = fs.readFileSync(pcmFile);
      const FRAME = 320;                       // 20ms
      const n = Math.floor(pcm.length / 2 / FRAME);
      const db = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        let sum = 0;
        const off = i * FRAME * 2;
        for (let j = 0; j < FRAME; j++) { const v = pcm.readInt16LE(off + j * 2) / 32768; sum += v * v; }
        db[i] = 20 * Math.log10(Math.sqrt(sum / FRAME) + 1e-9);
      }
      const sorted = Float32Array.from(db).sort();
      const pct = (q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))];
      const thr = pct(0.10) + 10;
      const active = [...db].filter((v) => v > thr).sort((a, b) => a - b);
      const apct = (q) => (active.length ? active[Math.min(active.length - 1, Math.max(0, Math.round(q * (active.length - 1))))] : 0);
      dynSpread = active.length ? Number((apct(0.9) - apct(0.2)).toFixed(1)) : null;
      speechEnergyRatio = Number((active.length / Math.max(1, db.length)).toFixed(3));
      if (spans.length) {
        let actNoWord = 0;
        for (let i = 0; i < n; i++) {
          if (db[i] <= thr) continue;
          const t0 = i * 0.02, t1 = t0 + 0.02;
          const hasWord = spans.some(([a, b]) => b > t0 && a < t1);
          if (!hasWord) actNoWord++;
        }
        musicRatio = Number((actNoWord / Math.max(1, active.length)).toFixed(3));
      }
      fs.rmSync(WORK, { recursive: true, force: true });
    }
  }
}

// ---------- 文本侧信号 ----------
let tr = null;
if (TR) tr = JSON.parse(fs.readFileSync(TR, 'utf8'));
const sentences = tr ? (tr.sentences || []).map((s) => String(s.text ?? s.en ?? '')) : [];
const words = tr ? (tr.words || []).map((w) => w.word) : (sentences.join(' ').split(/\s+/).filter(Boolean));
const wordSpans = tr ? (tr.words || []) : [];
const speechDur = wordSpans.length ? wordSpans.reduce((a, w) => a + Math.max(0, w.end - w.start), 0) : null;
const speechRatio = speechDur != null ? Number(Math.min(1, speechDur / dur).toFixed(3)) : null;
const asrConf = tr?.stats?.avg_conf ?? null;
const sentWordCounts = sentences.map((s) => s.split(/\s+/).filter(Boolean).length).filter((n) => n > 0);
const wordsPerSent = sentWordCounts.length ? Number((sentWordCounts.reduce((a, b) => a + b, 0) / sentWordCounts.length).toFixed(1)) : null;
const shortRatio = sentWordCounts.length ? Number((sentWordCounts.filter((n) => n <= 3).length / sentWordCounts.length).toFixed(3)) : null;
// 术语/单位密度从**句子文本**里算（words[] 是 ASR 原始分词，`l u fs` 会被拆成三个词，算不出来）；
// 优先用规范化后的句子（`−16 LUFS` / `15 Mbps` 这种书写形式）。
const textForTerms = sentences.length ? sentences.join(' ') : words.join(' ');
const unitTerms = (textForTerms.match(/\b(?:[A-Z]{2,6}|[0-9]+(?:\.[0-9]+)?\s?(?:LUFS|dB|Mbps|fps|K|p))\b/g) || []).length;
const termPer100w = words.length ? Number(((unitTerms / words.length) * 100).toFixed(1)) : null;

// ---------- 打分（启发式，权重写明白，方便以后调） ----------
// 每个信号给 0..1 的"像不像知识型"分，再按权重合成。
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const scores = [];
const add = (name, value, weight, note) => { if (value != null) scores.push({ name, value: Number(value.toFixed(3)), weight, note }); };
if (speechRatio != null) add('speech_ratio', clamp01((speechRatio - 0.35) / 0.45), 0.25, `${(speechRatio * 100).toFixed(0)}% 时长有词（教学/旁白高；剧情片混音段低）`);
if (asrConf != null) add('asr_conf', clamp01((asrConf - 0.75) / 0.20), 0.25, `平均置信 ${asrConf}（干净近场麦高）`);
if (musicRatio != null) add('music_ratio', clamp01((0.65 - musicRatio) / 0.45), 0.20, `有声但无词 ${(musicRatio * 100).toFixed(0)}%（配乐/音效占比，影视混音高）`);
if (shortRatio != null) add('short_ratio', clamp01((0.35 - shortRatio) / 0.30), 0.15, `短句占比 ${(shortRatio * 100).toFixed(0)}%（喊叫/对话碎片多则高）`);
if (wordsPerSent != null) add('words_per_sent', clamp01((wordsPerSent - 4) / 8), 0.10, `句均 ${wordsPerSent} 词（口播句子长）`);
if (termPer100w != null) add('term_density', clamp01(termPer100w / 6), 0.05, `术语/单位 ${termPer100w}/100 词（知识型高）`);

const wsum = scores.reduce((a, s) => a + s.weight, 0);
const knowledgeScore = wsum ? scores.reduce((a, s) => a + s.value * s.weight, 0) / wsum : null;
const klass = knowledgeScore == null ? 'unknown' : knowledgeScore >= 0.62 ? 'knowledge' : knowledgeScore >= 0.40 ? 'mixed' : 'narrative';

// ---------- 当前策略建议（会随版本变化，不是定义） ----------
const strategy = klass === 'knowledge'
  ? { mt: 'mymemory 可自动；术语表必开；发布前建议只抽检', cps: 20, review: 'optional', note: '信息主要在文字里，术语可枚举 → 自动链路最靠得住的一类' }
  : klass === 'mixed'
    ? { mt: '机翻 + 人工校对（export_review → apply_review）', cps: 18, review: 'recommended', note: '有配乐/多人/语气承载语义，建议过一遍校对表' }
    : klass === 'narrative'
      ? { mt: '精译（--mt agent，人/LLM 带剧情上下文）', cps: 16, review: 'required', note: '语气与画面承载语义，机翻只能当草稿' }
      : { mt: 'unknown', cps: 20, review: 'unknown', note: '信号不足（没有 transcript 时无法判断文本侧）' };

const out = {
  generated_at: new Date().toISOString(),
  media: path.relative(ROOT, MEDIA),
  transcript: TR ? path.relative(ROOT, TR) : null,
  duration_s: Number(dur.toFixed(2)),
  signals: {
    speech_ratio: speechRatio, asr_conf: asrConf, dyn_spread_db: dynSpread, energy_active_ratio: speechEnergyRatio, music_ratio: musicRatio,
    sentences: sentences.length || null, words: words.length || null, words_per_sent: wordsPerSent,
    short_ratio: shortRatio, term_per_100w: termPer100w,
  },
  breakdown: scores,
  knowledge_score: knowledgeScore == null ? null : Number(knowledgeScore.toFixed(3)),
  class: klass,
  strategy,
  disclaimer: '这是"当前版本"的策略建议，不是对内容类型的定义；分类器与阈值会随迭代调整。',
};
if (JSON_OUT) { const p = path.resolve(ROOT, JSON_OUT); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(out, null, 2)); }
console.log(`[classify] ${path.basename(MEDIA)} ${dur.toFixed(1)}s → class=${klass}（knowledge_score ${out.knowledge_score ?? '—'}）`);
for (const s of scores) console.log(`   · ${s.name}: ${s.value} (w=${s.weight}) ${s.note}`);
console.log(`   → 建议：${strategy.mt}｜CPS ${strategy.cps}｜人工校对 ${strategy.review}`);
console.log(`   ${strategy.note}`);
