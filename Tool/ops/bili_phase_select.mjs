#!/usr/bin/env node
/**
 * bili_phase_select.mjs — 从时间线选「早期 vs 成熟期」代表视频（小循环 25 升格，源自 loop25/s2_select.mjs）
 *
 * 抽样规则（默认值来自 loop25 实盘）：
 *   早期   = 开号头 --early-n 条里播放最高且时长在区间内（起步期最好成绩），取 --cands 个候选
 *   成熟期 = 最近 --late-years 年播放前 --cands（当前剪辑语言）
 *   时长窗口 60–900s：过滤直播回放/切片/超长合集，纯短评/花絮也排掉
 *
 * 用法：
 *   node Tool/ops/bili_phase_select.mjs --dir History/loops/loop25
 * 参数：--dir（timeline_*.json 所在目录，必填） --out（默认 <dir>/selection.json）
 *       --early-n 15 --late-years 4 --min-len 60 --max-len 900 --cands 3
 * 输出：selection.json（每人 early/late 各 --cands 条候选，下载失败按序补位）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const DIR = arg('dir');
if (!DIR || !fs.existsSync(DIR)) { console.error('用法: node bili_phase_select.mjs --dir <timeline目录> [--out x.json] [--early-n 15] [--late-years 4]'); process.exit(2); }
const OUT = arg('out', path.join(DIR, 'selection.json'));
const EARLY_N = +arg('early-n', 15);
const LATE_YEARS = +arg('late-years', 4);
const MIN_LEN = +arg('min-len', 60), MAX_LEN = +arg('max-len', 900), CANDS = +arg('cands', 3);

const files = fs.readdirSync(DIR).filter((f) => /^timeline_\d+\.json$/.test(f));
if (!files.length) { console.error(`${DIR} 里没有 timeline_<mid>.json（先跑 bili_up_timeline.mjs）`); process.exit(1); }

const sel = [];
for (const f of files) {
  const j = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  const ok = (v) => v.length_s >= MIN_LEN && v.length_s <= MAX_LEN && v.play > 0;
  const early = j.all.slice(0, EARLY_N).filter(ok).sort((a, b) => b.play - a.play).slice(0, CANDS)
    .map((v) => ({ ...pick(v), phase: 'early' }));
  const recent = j.all.slice(-200).filter((v) => new Date(v.created * 1000).getFullYear() >= new Date().getFullYear() - LATE_YEARS);
  const late = recent.filter(ok).sort((a, b) => b.play - a.play).slice(0, CANDS)
    .map((v) => ({ ...pick(v), phase: 'late' }));
  if (!early.length || !late.length) { console.log(`⚠ ${j.name}: 候选为空（early ${early.length} / late ${late.length}），检查时长窗口`); continue; }
  sel.push({ name: j.name, mid: j.mid, total: j.total, first_date: new Date(j.all[0].created * 1000).toISOString().slice(0, 10), early, late });
  console.log(j.name, '| early:', early[0]?.title.slice(0, 24), '| late:', late[0]?.title.slice(0, 24));
}
function pick(v) {
  return { bvid: v.bvid, title: v.title, date: new Date(v.created * 1000).toISOString().slice(0, 10), len_s: v.length_s, play: v.play };
}
fs.writeFileSync(OUT, JSON.stringify(sel, null, 1));
console.log('完成 →', OUT);
