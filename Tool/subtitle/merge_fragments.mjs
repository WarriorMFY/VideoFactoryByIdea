#!/usr/bin/env node
// merge_fragments.mjs —— 把"中文无对应译文"的英文碎片句并回前一句
//
// 症状（小循环 14 EP-B 实测）：TED 官方 zh 是按逗号切的短 cue，en 对齐后是句级，
// 一个中文 cue 常横跨两个英文句。若按"唯一归属"分配，尾半句就拿不到中文，
// 字幕会出现"只有英文没有中文"的空行。
// 事实：那半句的中文语义已经完整存在于前一句的译文里 —— 所以正确修法是把英文并回前句
// （时间窗同时延长），而不是硬翻一遍造成重复字幕。
//
// 用法：node Tool/subtitle/merge_fragments.mjs aligned.json zh_official.json --out aligned_merged.json
import fs from 'node:fs';

const args = process.argv.slice(2);
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const ALIGN = args[0], ZH = args[1];
const OUT = getOpt('--out', 'aligned_merged.json');
const MAX_WORDS = Number(getOpt('--max-words', '26'));

const j = JSON.parse(fs.readFileSync(ALIGN, 'utf8'));
const zh = JSON.parse(fs.readFileSync(ZH, 'utf8'));
const S = j.sentences;
const merged = [];
let merges = 0, skipped = [];

for (const s of S) {
  const hasZh = zh[s.text] && String(zh[s.text]).trim() !== '';
  const prev = merged[merged.length - 1];
  if (!hasZh && prev && (prev.n + s.n) <= MAX_WORDS) {
    prev.text = prev.text.replace(/\s*$/,'') + ' ' + s.text.replace(/^\s*/, '');
    prev.end = s.end; prev.w1 = s.w1; prev.n += s.n;
    merges++;
  } else if (!hasZh) {
    skipped.push(s);   // 自身过长，不能并；留给人工补译
    merged.push({ ...s });
  } else {
    merged.push({ ...s });
  }
}

j.sentences = merged;
fs.writeFileSync(OUT, JSON.stringify(j, null, 1));
console.log(`[merge] ${S.length} → ${merged.length} 句（并回 ${merges} 个碎片，仍有 ${skipped.length} 句无译文且超长）`);
for (const s of skipped) console.log(`  ! ${s.start.toFixed(1)}s ${s.text}`);
