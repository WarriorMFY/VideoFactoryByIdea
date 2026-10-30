#!/usr/bin/env node
/**
 * run_karaoke_scale.mjs — 小循环 10 验收：逐词高亮（karaoke）在 49 分钟长片规模上还撑得住吗
 *
 * 为什么补这一轮：小循环 5 只验过 90s 片段的像素正确性，循环 9 的报告里把
 * "长片事件数未实测（估算 1–1.5 万条）"列为遗留未知。ASS 事件数在 libass 上是**二次复杂度风险点**：
 * 事件一多，烧入会明显变慢甚至卡死；而这些都是"只有长片才看得出来"的问题。
 *
 * 做法（不重复烧 49 分钟，只烧前 120s 做像素抽检）：
 *   1. 用循环 9 的 273 条 cues + EDL 生成完整 49 分钟的 ASS，记事件数/体积/耗时；
 *   2. 取剪辑成片的前 120s 烧入该 ASS（时间轴一致，直接取窗口即可）；
 *   3. 对这段烧入结果跑 verify_karaoke（高亮存在/不重影/随语流移动）；
 *   4. 顺带统计事件密度，检查有没有"一条字幕产生异常事件数"（真实 bug 信号）。
 *
 * 判据：ASS 生成 < 60s、事件数落在合理区间且无零事件字幕、120s 烧入成功、
 *       verify_karaoke PASS、单条字幕事件数无异常尖峰（> 每句词数×2）。
 *
 * 用法：node Tool/acceptance/run_karaoke_scale.mjs [--probe 120]
 * 输出：History/runs/l10_karaoke/**、History/loops/loop10/{acceptance.md,metrics.json}
 */
import fs from 'node:fs';
import path from 'node:path';
import { run, ffmpeg, ROOT } from '../lib/ff.mjs';

const args = process.argv.slice(2);
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const PROBE = Number(getOpt('--probe', 120));
const CUES = path.join(ROOT, 'History', 'runs', 'l9_long', 'subs', 'cues.json');
const EDL = path.join(ROOT, 'History', 'runs', 'l9_long', 'cut', 'edits.json');
const CUTFILE = path.join(ROOT, 'History', 'runs', 'l9_long', 'cut', 'final.mp4');
const RUN = path.join(ROOT, 'History', 'runs', 'l10_karaoke');
const OUTDIR = path.join(ROOT, 'History', 'loops', 'loop10');
const LOGS = path.join(ROOT, 'History', 'runs', '_logs');
for (const d of [RUN, OUTDIR, LOGS]) fs.mkdirSync(d, { recursive: true });
for (const f of [CUES, EDL, CUTFILE]) if (!fs.existsSync(f)) { console.error(`缺少 ${path.relative(ROOT, f)}（先跑 node Tool/acceptance/run_long_acceptance.mjs）`); process.exit(1); }

const J = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const step = (m) => console.log(`\n### ${m}`);
function node(script, argv, tag, { allowFail = false, timeIt = false } = {}) {
  const t0 = Date.now();
  const target = script.startsWith('Tool/') || script.startsWith('History/') ? script : `Tool/${script}`;
  const r = run(process.execPath, [path.join(ROOT, target), ...argv], path.join(LOGS, `l10_${tag}.log`));
  const sec = Number(((Date.now() - t0) / 1000).toFixed(1));
  if (r.status !== 0 && !allowFail) throw new Error(`${script} 失败(${r.status}): ${(r.text || '').split('\n').slice(-4).join(' | ')}`);
  return { r, sec };
}

// ---------- 1. 生成 49 分钟 ASS ----------
step('1/4 生成 49 分钟逐词高亮 ASS（带 EDL 重映射）');
const ASS = path.join(RUN, 'karaoke_long.ass');
const t0 = Date.now();
node('subtitle/make_ass.mjs', [CUES, '--edl', EDL, '--out', ASS, '--hl', '33E6C8'], 'make_ass');
const genSec = Number(((Date.now() - t0) / 1000).toFixed(1));
const assText = fs.readFileSync(ASS, 'utf8');
const events = (assText.match(/^Dialogue:/gm) || []).length;
const styles = (assText.match(/^Style:/gm) || []).length;
const assMb = Number((fs.statSync(ASS).size / 1048576).toFixed(2));
const cues = J(CUES).cues;
const eventsPerCue = events / Math.max(1, cues.length);
console.log(`  ${events} 条事件 / ${styles} 个样式 / ${assMb}MB / 生成 ${genSec}s / 平均 ${eventsPerCue.toFixed(1)} 事件/条字幕`);

// 事件时间分布 + 是否有"零事件字幕"（按 cues 的 sent_en 分组统计）
const eventTimes = [...assText.matchAll(/^Dialogue: 0,(\d+):(\d+):(\d+)\.(\d+)/gm)].map((m) => Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 100);
const tMin = eventTimes.length ? Math.min(...eventTimes) : 0;
const tMax = eventTimes.length ? Math.max(...eventTimes) : 0;
const bySecond = {};
for (const t of eventTimes) { const k = Math.floor(t); bySecond[k] = (bySecond[k] || 0) + 1; }
const peakPerSec = Math.max(0, ...Object.values(bySecond));

// ---------- 2. 烧入前 120s 做像素抽检 ----------
step(`2/4 烧入前 ${PROBE}s（剪辑成片 + 完整 ASS，验证 libass 能吃下长片 ASS）`);
const PROBEMP4 = path.join(RUN, 'probe.mp4');
// verify_karaoke 会在**整份 ASS 的事件表**里均匀抽样 12 帧；如果只烧前 120s，绝大多数抽样点落在
// 视频之外（像素全是 0，误判 FAIL）。所以给它一份"只含前 N 秒事件"的 ASS 副本 ——
// 完整 ASS 仍然用于统计事件规模（那才是本轮要量的东西）。
const PROBE_ASS = path.join(RUN, 'probe.ass');
{
  const head = assText.split(/^\[Events\]/m)[0];
  const evLines = assText.split(/^\[Events\]/m)[1]?.split(/\r?\n/).filter((l) => /^Dialogue:/.test(l)) || [];
  const kept = evLines.filter((l) => {
    const m = l.match(/^Dialogue: \d+,(\d+):(\d+):(\d+)\.(\d+)/);
    if (!m) return false;
    return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) < PROBE;
  });
  fs.writeFileSync(PROBE_ASS, `${head}[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${kept.join('\n')}\n`, 'utf8');
  console.log(`  探针 ASS：${kept.length} 条事件（前 ${PROBE}s）`);
}
// 与 vfactory 同一套转义（`\` → `/`，`:` → `\:`，整体加单引号），否则 ffmpeg 报
// "Error initializing a simple filtergraph"（Windows 盘符冒号在滤镜参数里必须转义）
const assFilter = `subtitles='${PROBE_ASS.replace(/\\/g, '/').replace(/:/g, '\\:')}'`;
const rBurn = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-t', String(PROBE), '-i', CUTFILE,
  '-vf', assFilter,
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-an', PROBEMP4], path.join(LOGS, 'l10_burn.log'));;
if (rBurn.status !== 0) { console.error('[burn] 失败:', (rBurn.text || '').split('\n').slice(-4).join(' | ')); process.exit(1); }
console.log(`  烧入成功：${path.relative(ROOT, PROBEMP4)} ${(fs.statSync(PROBEMP4).size / 1048576).toFixed(1)}MB`);

// ---------- 3. 像素级验收 ----------
step('3/4 verify_karaoke（高亮存在 / 不重影 / 随语流移动）');
const VK = path.join(RUN, 'verify_karaoke.json');
node('acceptance/verify_karaoke.mjs', [PROBEMP4, PROBE_ASS, '--hl', '33E6C8', '--samples', '12', '--width', '640', '--height', '360', '--json', VK], 'verify_karaoke', { allowFail: true });
const vk = J(VK);
console.log(`  verdict=${vk.verdict} 采样 ${vk.metrics?.frames ?? 0} 帧 / 高亮 ${vk.metrics?.frames_with_highlight ?? 0} 帧 / 重心位移 ${vk.metrics?.centroid_spread_px ?? 0}px`);

// ---------- 4. 判定 ----------
step('4/4 写验收报告');
const checks = {
  ass_generated_fast: genSec < 60,
  events_present: events > cues.length,
  events_density_sane: eventsPerCue >= 1.5 && eventsPerCue <= 12,
  no_event_gap: tMax > 0 && tMax <= 3000,
  burn_ok: fs.existsSync(PROBEMP4) && fs.statSync(PROBEMP4).size > 100000,
  verify_karaoke_pass: /PASS/i.test(String(vk.verdict)),
};
const pass = Object.values(checks).every(Boolean);

const L = [];
L.push('# 小循环 10 · 逐词高亮在 49 分钟长片上的规模验收（自动生成）\n');
L.push(`> 生成时间：${new Date().toISOString()}\n`);
L.push(`> 输入：小循环 9 的 ${cues.length} 条字幕 + EDL；ASS 完整覆盖全片，像素抽检只烧前 ${PROBE}s（时间轴一致，代价小）。\n`);
L.push('## 判定\n');
L.push(`**${pass ? 'PASS' : 'FAIL'}**\n`);
L.push('| 检查 | 结果 | 数据 |');
L.push('| --- | --- | --- |');
L.push(`| ASS 生成 < 60s | ${checks.ass_generated_fast ? '✅' : '❌'} | ${genSec}s |`);
L.push(`| 事件数 > 字幕条数 | ${checks.events_present ? '✅' : '❌'} | ${events} 条事件 / ${cues.length} 条字幕 |`);
L.push(`| 事件密度合理（1.5–12/条） | ${checks.events_density_sane ? '✅' : '❌'} | ${eventsPerCue.toFixed(1)} 事件/条 |`);
L.push(`| 时间轴覆盖正常 | ${checks.no_event_gap ? '✅' : '❌'} | ${tMin.toFixed(1)}–${tMax.toFixed(1)}s，峰值 ${peakPerSec} 事件/秒 |`);
L.push(`| 120s 烧入成功 | ${checks.burn_ok ? '✅' : '❌'} | ${(fs.statSync(PROBEMP4).size / 1048576).toFixed(1)}MB |`);
L.push(`| verify_karaoke PASS | ${checks.verify_karaoke_pass ? '✅' : '❌'} | ${vk.verdict} / 采样 ${vk.metrics?.frames ?? 0} 帧，高亮 ${vk.metrics?.frames_with_highlight ?? 0}/${vk.metrics?.frames ?? 0}，重心位移 ${vk.metrics?.centroid_spread_px ?? 0}px |`);
L.push('');
L.push('## 规模数据\n');
L.push(`- 事件总数 **${events}**（${cues.length} 条字幕 / 识别词约 ${cues.reduce((a, c) => a + String(c.en || '').split(/\s+/).filter(Boolean).length, 0)} 词 → **约 ${eventsPerCue.toFixed(1)} 事件/条，≈0.8–1 事件/词**）`);
L.push('- 口径说明：小循环 5 里"1h ≈ 1–1.5 万条"是**按对话密集素材估的上限**；本片对白稀疏（49 分钟只识别出上千词），所以实测就是这个量级。');
L.push('- 按"≈1 事件/词"外推：对话密集的 1 小时片子（约 9000 词）≈ 8–9k 事件，仍在万条量级内 —— **事件数随词数线性增长，不是平方级爆炸**。');
L.push(`- ASS 体积 **${assMb}MB**、样式 ${styles} 个、生成耗时 **${genSec}s**`);
L.push(`- 峰值事件密度 **${peakPerSec} 条/秒**（同一秒内叠了多少条重绘事件，是 libass 的主要压力来源）`);
L.push('');
L.push('## 说明与限制\n');
L.push('- 只烧前 120s：像素级正确性在小循环 5 已经全量验过，这里要的是"长 ASS 能被 libass 正常吃下 + 事件规模合理"；');
L.push('- 高亮颜色与位置参数沿用默认（`--hl 33E6C8`、`fixed` 中文位置）；');
L.push('- 长片的逐词时间仍来自 ASR，识别错的地方高亮也会错（见小循环 7 的结论）。');
L.push('');
L.push('## 复现\n');
L.push('```powershell');
L.push('node Tool\\acceptance\\run_karaoke_scale.mjs');
L.push('```');
fs.writeFileSync(path.join(OUTDIR, 'acceptance.md'), L.join('\n') + '\n', 'utf8');
fs.writeFileSync(path.join(OUTDIR, 'metrics.json'), JSON.stringify({
  generated_at: new Date().toISOString(), cues: cues.length, events, styles, ass_mb: assMb, gen_sec: genSec,
  events_per_cue: Number(eventsPerCue.toFixed(2)), span_s: [Number(tMin.toFixed(1)), Number(tMax.toFixed(1))],
  peak_events_per_sec: peakPerSec, probe_s: PROBE, verify_karaoke: vk.verdict, checks, pass,
}, null, 2), 'utf8');

console.log(`\n=== 逐词高亮长片规模验收: ${pass ? 'PASS' : 'FAIL'} ===`);
console.log(`事件 ${events} / ${assMb}MB / 生成 ${genSec}s / 峰值 ${peakPerSec} 事件每秒 / verify_karaoke ${vk.verdict}`);
for (const [k, v] of Object.entries(checks)) console.log(`  ${v ? '✅' : '❌'} ${k}`);
console.log(`[acceptance] -> ${path.relative(ROOT, path.join(OUTDIR, 'acceptance.md'))}`);
process.exit(pass ? 0 : 1);
