#!/usr/bin/env node
/**
 * remap_subs.mjs — 把字幕时间轴重映射到「剪辑后」的成片时间轴
 *
 * 为什么必须单独一步：字幕是在**原片时间轴**上识别出来的，但成片经过了删减与转场，
 * 直接烧原时间轴的字幕会整体错位（删得越多错得越狠）。这里按 EDL 的保留段做映射：
 *   - 完全落在保留段内 → 平移时间
 *   - 跨切点的行 → 按保留部分拆成两条（文本按词级时间分给两边）
 *   - 大部分被切掉的行（保留 < 35%）→ 丢弃，避免"半句话"出现
 *   - 映射后过短的行（<0.6s）→ 向后延到 0.6s（不越过下一条），保证可读
 *
 * 用法：node Tool/remap_subs.mjs <cues.json> <edits.json> --out <dir> [--style bilingual|zh|en]
 * 输出：<out>/out_<style>.srt、<out>/remap.json（映射明细与丢弃原因）
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../lib/ff.mjs';

const args = process.argv.slice(2);
if (args.length < 2) { console.error('用法: node Tool/remap_subs.mjs <cues.json> <edits.json> --out <dir> [--style bilingual|zh|en]'); process.exit(2); }
const CUES = path.resolve(args[0]);
const EDL = path.resolve(args[1]);
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const OUT = path.resolve(ROOT, getOpt('--out', 'History/subs/remapped'));
const STYLE = getOpt('--style', 'bilingual');
const MIN_DUR = Number(getOpt('--min-dur', 0.6));
fs.mkdirSync(OUT, { recursive: true });

const cuesFile = JSON.parse(fs.readFileSync(CUES, 'utf8'));
const cues = cuesFile.cues || cuesFile;
const edl = JSON.parse(fs.readFileSync(EDL, 'utf8'));
const kept = edl.kept.map((k) => ({ start: k.start, end: k.end }));
// 原件时间 → 成片时间 的偏移表
const spans = [];
let acc = 0;
for (const k of kept) { spans.push({ srcStart: k.start, srcEnd: k.end, outStart: acc, dur: k.end - k.start }); acc += k.end - k.start; }

const mapTime = (t) => {
  for (const s of spans) if (t >= s.srcStart - 1e-6 && t <= s.srcEnd + 1e-6) return s.outStart + (t - s.srcStart);
  // 落在被切掉的区间：吸附到最近保留段边界
  let best = null, bestD = Infinity;
  for (const s of spans) {
    for (const [edge, d] of [[s.srcStart, Math.abs(t - s.srcStart)], [s.srcEnd, Math.abs(t - s.srcEnd)]]) {
      if (d < bestD) { bestD = d; best = { s, edge, t }; }
    }
  }
  if (!best) return null;
  return best.edge === best.s.srcStart ? best.s.outStart : best.s.outStart + best.s.dur;
};

/** 把一条 cue 按保留段切成若干片段（每片带按词比例分到的文本部分） */
function mapCue(cue) {
  const pieces = [];
  const total = Math.max(1e-6, cue.end - cue.start);
  for (const s of spans) {
    const a = Math.max(cue.start, s.srcStart);
    const b = Math.min(cue.end, s.srcEnd);
    if (b - a <= 0.05) continue;
    pieces.push({ srcA: a, srcB: b, outA: s.outStart + (a - s.srcStart), outB: s.outStart + (b - s.srcStart), frac: (b - a) / total });
  }
  return pieces;
}

function textFraction(cue, fracFrom, fracTo) {
  // 中英文都按字符比例切（中文无空格，英文按词切再拼）
  const cut = (text, f0, f1) => {
    if (!text) return '';
    if (Array.isArray(cue.words) && cue.words.length && text === cue.words.map((w) => w.word).join(' ')) {
      const n = cue.words.length;
      const i0 = Math.floor(n * f0), i1 = Math.max(i0 + 1, Math.ceil(n * f1));
      return cue.words.slice(i0, i1).map((w) => w.word).join(' ');
    }
    const i0 = Math.floor(text.length * f0), i1 = Math.max(i0 + 1, Math.ceil(text.length * f1));
    return text.slice(i0, i1).trim();
  };
  return { en: cut(cue.en, fracFrom, fracTo), zh: cue.zh ? cut(cue.zh, fracFrom, fracTo) : '' };
}

const out = [];
const dropped = [];
cues.forEach((cue, ci) => {
  const pieces = mapCue(cue);
  const keptDur = pieces.reduce((a, p) => a + (p.outB - p.outA), 0);
  const srcDur = cue.end - cue.start;
  if (!pieces.length || keptDur / srcDur < 0.35) {
    dropped.push({ idx: ci, start: cue.start, end: cue.end, reason: `保留比例 ${(keptDur / Math.max(1e-6, srcDur) * 100).toFixed(0)}% < 35%，整行丢弃`, en: cue.en });
    return;
  }
  let pen = 0;
  for (const p of pieces) {
    const f0 = p.srcA - cue.start, f1 = p.srcB - cue.start;
    const txt = textFraction(cue, f0 / Math.max(1e-6, srcDur), f1 / Math.max(1e-6, srcDur));
    out.push({
      idx: out.length, src_cue: ci, start: Number(p.outA.toFixed(3)), end: Number(p.outB.toFixed(3)),
      en: txt.en || (pen === 0 ? cue.en : ''), zh: txt.zh, conf: cue.conf,
      split_from_cut: pieces.length > 1,
    });
    pen++;
  }
});

// 过短的行向后延（不越过下一条），再过短的合并到上一条
out.sort((a, b) => a.start - b.start);
for (let i = 0; i < out.length; i++) {
  const c = out[i], nxt = out[i + 1];
  if (c.end - c.start < MIN_DUR) {
    const limit = nxt ? nxt.start - 0.02 : c.start + MIN_DUR;
    c.end = Number(Math.max(c.end, Math.min(limit, c.start + MIN_DUR)).toFixed(3));
  }
}
for (let i = out.length - 2; i >= 0; i--) {
  if (out[i + 1].start - out[i].start < 0.45) {
    out[i].end = Math.max(out[i].end, out[i + 1].end);
    out[i].en = [out[i].en, out[i + 1].en].filter(Boolean).join(' ');
    out[i].zh = [out[i].zh, out[i + 1].zh].filter(Boolean).join('');
    out.splice(i + 1, 1);
  }
}
const totalOut = acc;
const overflow = out.filter((c) => c.end > totalOut + 0.05);
const overlap = out.filter((c, i) => i > 0 && c.start < out[i - 1].end - 0.02).length;

function ts(sec) {
  const ms = Math.round(sec * 1000);
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000), r = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(r).padStart(3, '0')}`;
}
const pick = (c) => (STYLE === 'en' ? [c.en] : STYLE === 'zh' ? [c.zh] : [c.zh, c.en]).filter(Boolean);
const srtPath = path.join(OUT, `out_${STYLE}.srt`);
fs.writeFileSync(srtPath, out.map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${pick(c).join('\n')}\n`).join('\n'));

const meta = {
  generated_at: new Date().toISOString(),
  cues_in: cues.length, cues_out: out.length, dropped,
  output_duration: Number(totalOut.toFixed(3)),
  style: STYLE,
  sanity: { overflow_cues: overflow.length, overlaps: overlap, min_dur: Math.min(...out.map((c) => Number((c.end - c.start).toFixed(3)))) },
  cues: out,
};
fs.writeFileSync(path.join(OUT, 'remap.json'), JSON.stringify(meta, null, 2));
console.log(`[remap] ${cues.length} 行 → ${out.length} 行（丢 ${dropped.length}） 成片时长 ${totalOut.toFixed(2)}s`);
for (const d of dropped) console.log(`   [drop] ${d.start.toFixed(2)}–${d.end.toFixed(2)} ${d.reason} :: ${d.en.slice(0, 50)}`);
for (const c of out) console.log(`   ${c.start.toFixed(2)}–${c.end.toFixed(2)}${c.split_from_cut ? ' (切点拆分)' : ''}  ${(c.en || '').slice(0, 56)}${c.zh ? `\n            → ${c.zh}` : ''}`);
console.log(`[remap] 越界 ${overflow.length} 条 / 重叠 ${overlap} 条 -> ${path.relative(ROOT, srtPath)}`);
