#!/usr/bin/env node
/**
 * s2_select.mjs — loop25 S3：为每位UP选「早期 vs 成熟期」代表视频（各 3 个候选，下载失败按序补位）
 *
 * 早期 = 开号头 15 条里播放最高且时长 60–900s（起步期最好成绩）
 * 成熟期 = 最近 4 年播放前 5、时长 60–900s（当前剪辑语言）
 * 输出 History/loops/loop25/selection.json
 */
import fs from 'node:fs';
import path from 'node:path';

const OUT = new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const files = fs.readdirSync(OUT).filter((f) => /^timeline_\d+\.json$/.test(f));

const sel = [];
for (const f of files) {
  const j = JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8'));
  const ok = (v) => v.length_s >= 60 && v.length_s <= 900 && v.play > 0;
  const early = j.all.slice(0, 15).filter(ok).sort((a, b) => b.play - a.play).slice(0, 3)
    .map((v) => ({ ...pick(v), phase: 'early' }));
  const recent = j.all.slice(-200).filter((v) => new Date(v.created * 1000).getFullYear() >= new Date().getFullYear() - 4);
  const late = recent.filter(ok).sort((a, b) => b.play - a.play).slice(0, 3)
    .map((v) => ({ ...pick(v), phase: 'late' }));
  sel.push({ name: j.name, mid: j.mid, total: j.total, first_date: new Date(j.all[0].created * 1000).toISOString().slice(0, 10), early, late });
  console.log(j.name, '| early:', early[0]?.title.slice(0, 24), '| late:', late[0]?.title.slice(0, 24));
}
function pick(v) {
  return { bvid: v.bvid, title: v.title, date: new Date(v.created * 1000).toISOString().slice(0, 10), len_s: v.length_s, play: v.play };
}
fs.writeFileSync(path.join(OUT, 'selection.json'), JSON.stringify(sel, null, 1));
