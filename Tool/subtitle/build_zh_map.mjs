#!/usr/bin/env node
// build_zh_map.mjs —— 用官方中文 VTT 的 cue 给英文句级时间轴做中译直灌
//
// 为什么需要：TED 官方 zh-cn 的翻译质量远高于机翻且与 en 同源。但 zh 是"逗号级"短 cue，
// en 对齐后是句级，两边粒度不同。小循环 14 EP-B 实测两个必须避开的坑：
//   坑A 唯一归属：一个 zh cue 横跨两个 en 句时整段只给重叠多的那句 → 另一句中文缺失。
//   坑B 整段硬塞：按坑A 修完会出现语义错位，如 en="9am to 9pm, six days a week" 只配到"每周六天"。
//
// v2 做法（本文件）：
//   1) 把每个 zh cue 按中文标点切成 **clause**（保留标点）；
//   2) clause 在该 cue 时间窗内按字符数比例分到子时间区间；
//   3) 每个 clause 归属到与子区间重叠最多的 en 句 —— 于是长 cue 能自然地跨句拆开。
// 兜底：无任何 clause 归属的句子记为 null 并列出；如需更贴合可再跑 merge_fragments 并回。
//
// 用法：
//   node Tool/subtitle/build_zh_map.mjs aligned.json cues_zh.json \
//        --out zh_official.json --report zh_map_report.md
import fs from 'node:fs';

const args = process.argv.slice(2);
const getOpt = (k, d) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] ? args[i + 1] : d; };

const ALIGN = args[0];
const ZH = args[1];
const OUT = getOpt('--out', 'zh_official.json');
const REPORT = getOpt('--report', '');
const MIN_OVERLAP = Number(getOpt('--min-overlap', '0.08'));

const aligned = JSON.parse(fs.readFileSync(ALIGN, 'utf8'));
const zhCues = JSON.parse(fs.readFileSync(ZH, 'utf8'));
const sents = aligned.sentences || [];

// —— 1) cue → clauses（按中文标点切，标点跟随前一 clause）
const splitClauses = (text) => {
  const out = [];
  let buf = '';
  for (const ch of text) {
    buf += ch;
    if ('，。；：？！、,.;:?!'.includes(ch)) { out.push(buf); buf = ''; }
  }
  if (buf.trim()) out.push(buf);
  return out.filter(s => s.trim());
};

const buckets = sents.map(() => []);
let orphanCue = 0, clauseCount = 0, droppedClause = 0;

for (const c of zhCues) {
  const clauses = splitClauses(c.text.replace(/\s+/g, ''));
  if (!clauses.length) continue;
  clauseCount += clauses.length;
  const totalChars = clauses.reduce((a, s) => a + s.length, 0);
  const dur = c.end - c.start;
  let t = c.start;
  let any = false;
  for (const cl of clauses) {
    const span = dur * (cl.length / totalChars);
    const s0 = t, s1 = t + span;
    t = s1;
    // 归属重叠最多的 en 句
    let best = -1, bestOv = 0;
    for (let i = 0; i < sents.length; i++) {
      const ov = Math.min(s1, sents[i].end) - Math.max(s0, sents[i].start);
      if (ov > bestOv) { bestOv = ov; best = i; }
    }
    if (best >= 0 && bestOv >= MIN_OVERLAP) { buckets[best].push({ start: s0, text: cl }); any = true; }
    else droppedClause++;
  }
  if (!any) orphanCue++;
}

const map = {};
const missing = [];
const rows = [];
for (let i = 0; i < sents.length; i++) {
  const s = sents[i];
  buckets[i].sort((a, b) => a.start - b.start);
  const zh = buckets[i].map(x => x.text).join('').replace(/\s+/g, '');
  if (!zh) { missing.push(i); map[s.text] = null; }
  else map[s.text] = zh;
  rows.push({ i, start: s.start, en: s.text, zh });
}

fs.writeFileSync(OUT, JSON.stringify(map, null, 1));
const filled = rows.length - missing.length;
console.log(`[zh-map v2] 句=${rows.length} 命中=${filled} 缺失=${missing.length} | clause=${clauseCount} 丢弃=${droppedClause} 孤儿cue=${orphanCue}`);

if (REPORT) {
  const md = [
    `# 官方中译直灌报告（v2 · clause 级分配）`,
    ``,
    `- 输入：\`${ALIGN}\`（${rows.length} 句） + \`${ZH}\`（${zhCues.length} cue / ${clauseCount} clause）`,
    `- 结果：**命中 ${filled} / ${rows.length}**，缺失 ${missing.length}，未归属 clause ${droppedClause}`,
    `- 分配规则：cue 按中文标点切 clause → clause 按字符数比例分时间子区间 → 归属重叠最多的 en 句（重叠 ≥ ${MIN_OVERLAP}s）`,
    ``,
    `## 缺失句（需补译）`,
    ``,
    ...(missing.length ? missing.map(i => `- \`${sents[i].start.toFixed(1)}s\` ${sents[i].text}`) : ['（无）']),
  ].join('\n');
  fs.writeFileSync(REPORT, md);
  console.log(`[zh-map] 报告 → ${REPORT}`);
}
