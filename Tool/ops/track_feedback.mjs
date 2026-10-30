#!/usr/bin/env node
/**
 * track_feedback.mjs — 市场反馈追踪与迭代建议（把"交付了然后呢"变成可执行动作）
 *
 * 输入：一张手工/脚本填的反馈表（CSV），每次采集一行快照：
 *   date,duration_s,views,avg_watch_s,likes,favorites,comments,shares,new_followers,notes
 *   其中 notes 写评论区高频反馈（自由文本，用 / 分隔，如 "字幕太小/前3秒无聊/求系列"）
 *
 * 输出：① 指标（完播率、点赞率、收藏率、评论率、涨粉/千播）② 与上一次快照的环比
 *      ③ **可执行迭代动作**（规则驱动，阈值都写在代码里，可改）④ markdown 报告
 *
 * 设计原则：不猜。没有数据就说"待采集"，不编数字；--selftest 用**明确标注的合成数据**只验证规则能跑。
 *
 * 用法：node Tool/ops/track_feedback.mjs --csv Deliverables/ep01_editing_tips/feedback.csv --out Deliverables/ep01_editing_tips/feedback_report.md
 *       node Tool/ops/track_feedback.mjs --selftest      # 用合成数据验证规则（输出标注 DRY-RUN）
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../lib/ff.mjs';

const args = process.argv.slice(2);
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const csvPath = getOpt('--csv', '');
const outPath = getOpt('--out', '');
const SELFTEST = args.includes('--selftest');

const COLS = ['date', 'duration_s', 'views', 'avg_watch_s', 'likes', 'favorites', 'comments', 'shares', 'new_followers', 'notes'];
const parseCsv = (text) => {
  const lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
  const rows = [];
  for (const line of lines) {
    const cells = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += ch; continue; }
      if (ch === '"') { inQ = true; continue; }
      if (ch === ',') { cells.push(cur); cur = ''; continue; }
      cur += ch;
    }
    cells.push(cur);
    rows.push(cells);
  }
  const header = rows.shift().map((h) => h.trim().toLowerCase());
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
};

const num = (v) => { const n = Number(String(v).replace(/[,\s]/g, '')); return Number.isFinite(n) ? n : null; };

// ---------- 规则 ----------
function analyze(rows) {
  const snaps = rows.map((r) => {
    const views = num(r.views) ?? 0;
    const dur = num(r.duration_s) ?? 0;
    const watch = num(r.avg_watch_s) ?? 0;
    const like = num(r.likes) ?? 0, fav = num(r.favorites) ?? 0, cmt = num(r.comments) ?? 0, share = num(r.shares) ?? 0, fans = num(r.new_followers) ?? 0;
    return {
      date: r.date, views, duration_s: dur, avg_watch_s: watch,
      retention: dur > 0 ? watch / dur : null,
      like_rate: views > 0 ? like / views : null,
      fav_rate: views > 0 ? fav / views : null,
      comment_rate: views > 0 ? cmt / views : null,
      share_rate: views > 0 ? share / views : null,
      fans_per_1k: views > 0 ? (fans / views) * 1000 : null,
      notes: String(r.notes || ''),
      raw: r,
    };
  });
  const last = snaps[snaps.length - 1] || null;
  const prev = snaps.length > 1 ? snaps[snaps.length - 2] : null;
  const actions = [];
  const add = (pri, act, why) => actions.push({ priority: pri, action: act, because: why });

  if (!last) {
    add('P0', '先采集第一批数据', '反馈表没有任何数据行（T+1 播放/完播/互动）');
    return { snaps, last, prev, actions };
  }
  // 主指标：完播率（B 站知识区，<35% 说明开头没抓住）
  if (last.retention == null) add('P0', '补 avg_watch_s / duration_s', '完播率算不出来，无法判断内容是否被看完');
  else if (last.retention < 0.35) add('P0', '重做前 3 秒钩子（结论前置 / 强对比画面）', `完播率 ${(last.retention * 100).toFixed(1)}% < 35%`);
  else if (last.retention < 0.5) add('P1', '把最有价值的技巧提前到第 1 章，首屏加"清单"预告', `完播率 ${(last.retention * 100).toFixed(1)}% 介于 35–50%`);
  else add('—', '内容留存正常，优先解决"被发现"的问题（标题/封面/分区）', `完播率 ${(last.retention * 100).toFixed(1)}% ≥ 50%`);

  // 互动结构
  if (last.like_rate != null && last.like_rate < 0.03) add('P1', '改标题/封面（点击进来的人不买账）', `点赞率 ${(last.like_rate * 100).toFixed(2)}% < 3%`);
  if (last.fav_rate != null && last.fav_rate >= 0.05) add('P1', '这是"工具型内容"信号：做成系列 / 出配套清单', `收藏率 ${(last.fav_rate * 100).toFixed(2)}% ≥ 5%`);
  if (last.comment_rate != null && last.comment_rate >= 0.008) add('P2', '置顶评论抛问题，收评论议题做下期选题', `评论率 ${(last.comment_rate * 100).toFixed(2)}% ≥ 0.8%`);

  // 文本反馈
  const notes = last.notes.toLowerCase();
  if (/字幕|字号|太小|太大|看不清/.test(notes)) add('P0', '调字幕：字号 / 底边距 / 每行字数（make_ass 参数）', '评论区提到字幕可读性');
  if (/太快|来不及|跟不|语速/.test(notes)) add('P1', '降 CPS 上限（--cps 18→15）并拆行', '评论提到语速/阅读跟不上');
  if (/翻译|错|机翻|语句不通/.test(notes)) add('P0', '走精译校对：export_review → 人改 → apply_review，再重发', '评论提到译文质量问题');
  if (/前3秒|开头|无聊|节奏/.test(notes)) add('P0', '重剪开头 3 秒（把最强结论/对比放前面）', '评论提到开头节奏');
  if (/系列|下一期|求|多来/.test(notes)) add('P1', '按"系列"排期（同一母题拆 3–5 期）', '评论区出现续作需求');

  // 环比
  if (prev && prev.retention != null && last.retention != null) {
    const d = last.retention - prev.retention;
    if (d <= -0.05) add('P0', '本次改动是负向：回退上一版改动', `完播率环比 ${(d * 100).toFixed(1)}pp`);
    else if (d >= 0.05) add('P2', '本次改动正向，把这套做法沉淀到模板', `完播率环比 +${(d * 100).toFixed(1)}pp`);
  }
  return { snaps, last, prev, actions };
}

// ---------- 自检模式（合成数据，明确标注） ----------
if (SELFTEST) {
  const demo = [
    { date: '2026-10-31', duration_s: '37', views: '1200', avg_watch_s: '11', likes: '18', favorites: '6', comments: '4', shares: '1', new_followers: '2', notes: '字幕太小/前3秒无聊' },
    { date: '2026-11-02', duration_s: '37', views: '2600', avg_watch_s: '26', likes: '120', favorites: '48', comments: '22', shares: '9', new_followers: '15', notes: '求系列/清单很有用' },
  ];
  const res = analyze(demo);
  const lines = [];
  lines.push('# 反馈追踪 —— DRY-RUN（合成数据，仅验证规则能跑，不代表真实市场表现）\n');
  for (const s of res.snaps) lines.push(`- ${s.date}: 播放 ${s.views} / 完播 ${s.retention == null ? '—' : (s.retention * 100).toFixed(1) + '%'} / 点赞率 ${s.like_rate == null ? '—' : (s.like_rate * 100).toFixed(2) + '%'} / 收藏率 ${s.fav_rate == null ? '—' : (s.fav_rate * 100).toFixed(2) + '%'}`);
  lines.push('\n## 迭代动作（按优先级）\n');
  for (const a of res.actions) lines.push(`- **${a.priority}** ${a.action}　_(${a.because})_`);
  const out = lines.join('\n') + '\n';
  const p = path.resolve(ROOT, getOpt('--out', 'History/loops/loop12/feedback_selftest.md'));
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, out, 'utf8');
  console.log(out);
  console.log(`[track] dry-run → ${path.relative(ROOT, p)}`);
  process.exit(0);
}

// ---------- 正常模式 ----------
if (!csvPath) { console.error('用法: node Tool/ops/track_feedback.mjs --csv feedback.csv --out report.md ｜ 或 --selftest'); process.exit(2); }
const abs = path.resolve(ROOT, csvPath);
if (!fs.existsSync(abs)) { console.error('反馈表不存在:', abs); process.exit(1); }
const rows = parseCsv(fs.readFileSync(abs, 'utf8')).filter((r) => Object.values(r).some((v) => v));
const res = analyze(rows);
const pct = (v) => (v == null ? '—' : `${(v * 100).toFixed(2)}%`);
const L = [];
L.push('# 市场反馈报告\n');
L.push(`> 反馈表：\`${csvPath}\`　快照数：${res.snaps.length}\n`);
if (!res.last) {
  L.push('**状态：待采集** —— 表里还没有数据行。\n');
  L.push('采集口径（建议）：\n');
  L.push('| 时间点 | 采什么 |');
  L.push('| --- | --- |');
  L.push('| T+1 天 | 播放、平均播放时长、点赞、收藏、评论、分享、涨粉 |');
  L.push('| T+3 天 | 同上（看是否进入推荐流） |');
  L.push('| T+7 天 | 同上 + 评论区高频词（写进 notes，用 / 分隔） |');
  L.push('');
} else {
  L.push('## 指标（最后一次快照）\n');
  L.push('| 指标 | 值 |');
  L.push('| --- | --- |');
  L.push(`| 播放 | ${res.last.views} |`);
  L.push(`| 完播率 | ${pct(res.last.retention)} |`);
  L.push(`| 点赞率 | ${pct(res.last.like_rate)} |`);
  L.push(`| 收藏率 | ${pct(res.last.fav_rate)} |`);
  L.push(`| 评论率 | ${pct(res.last.comment_rate)} |`);
  L.push(`| 分享率 | ${pct(res.last.share_rate)} |`);
  L.push(`| 每千播涨粉 | ${res.last.fans_per_1k == null ? '—' : res.last.fans_per_1k.toFixed(1)} |`);
  L.push('');
  if (res.prev) {
    const d = (k) => (res.last[k] != null && res.prev[k] != null ? `${((res.last[k] - res.prev[k]) * 100).toFixed(2)}pp` : '—');
    L.push(`## 环比（${res.prev.date} → ${res.last.date}）\n`);
    L.push(`- 完播率：${d('retention')}　点赞率：${d('like_rate')}　收藏率：${d('fav_rate')}　评论率：${d('comment_rate')}`);
    L.push('');
  }
  L.push('## 迭代动作（按优先级）\n');
  for (const a of res.actions) L.push(`- **${a.priority}** ${a.action}　_(${a.because})_`);
  L.push('');
}
const out = path.resolve(ROOT, outPath || path.join(path.dirname(abs), 'feedback_report.md'));
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, L.join('\n') + '\n', 'utf8');
fs.writeFileSync(out.replace(/\.md$/, '') + '.json', JSON.stringify({ generated_at: new Date().toISOString(), csv: csvPath, ...res, snaps: res.snaps.map((s) => ({ ...s, raw: undefined })) }, null, 2));
console.log(L.join('\n'));
console.log(`[track] -> ${path.relative(ROOT, out)}`);
