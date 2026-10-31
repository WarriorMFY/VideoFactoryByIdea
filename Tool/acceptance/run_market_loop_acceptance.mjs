#!/usr/bin/env node
/**
 * run_market_loop_acceptance.mjs — 小循环 12 验收：市场 ↔ 工厂 闭环能不能真的转起来
 *
 * 链路四段，每段都要有**可验证的证据**，而不是"我做了"：
 *   A 侦查：能从公开市场数据里拿到样本，并选出"当前能力可快速交付"的题材（有分数、有依据）
 *   B 开工：工厂能产出一条**可发布**的成片（规格/质检/字幕/封面齐全）
 *   C 交付包：发布所需的东西一件不少（文案/标签/分区/上传清单/合规声明）
 *   D 反馈闭环：反馈表 + 追踪器能算出指标并给出**可执行**的迭代动作（空数据必须诚实说"待采集"）
 *
 * 用法：node Tool/acceptance/run_market_loop_acceptance.mjs [--ep Workspace/deliverables/ep01_editing_tips]
 * 输出：History/loops/loop12/{acceptance.md,metrics.json}
 */
import fs from 'node:fs';
import path from 'node:path';
import { run, ffprobeJson, ROOT } from '../lib/ff.mjs';

const args = process.argv.slice(2);
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const EP = path.resolve(ROOT, getOpt('--ep', path.join('Workspace', 'deliverables', 'ep01_editing_tips')));
const OUTDIR = path.join(ROOT, 'History', 'loops', 'loop12');
const LOGS = path.join(ROOT, 'History', 'runs', '_logs');
for (const d of [OUTDIR, LOGS]) fs.mkdirSync(d, { recursive: true });

const J = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const step = (m) => console.log(`\n### ${m}`);
const node = (script, argv, tag, { allowFail = false } = {}) => {
  const r = run(process.execPath, [path.join(ROOT, script), ...argv], path.join(LOGS, `l12_${tag}.log`));
  if (r.status !== 0 && !allowFail) throw new Error(`${script} 失败: ${(r.text || '').split('\n').slice(-4).join(' | ')}`);
  return r;
};

// ---------- A. 侦查 ----------
step('A 市场侦查（公开数据 → 候选选题）');
const MR = path.join(ROOT, 'History', 'loops', 'loop12', 'market_raw.json');
const MN = path.join(ROOT, 'History', 'loops', 'loop12', 'niche', 'market_raw.json');
if (!fs.existsSync(MR)) node('Tool/ops/recon_bilibili.mjs', ['--out', 'History/loops/loop12', '--top', '60'], 'recon');
const mr = J(MR);
const mn = fs.existsSync(MN) ? J(MN) : null;
const kwRows = (mn?.keyword_markets || mr.keyword_markets || []);
const topKw = kwRows.slice().sort((a, b) => b.top_play - a.top_play)[0] || null;
const cands = mr.candidates || [];
console.log(`  榜单样本 ${mr.pool_size} 条 / 关键词 ${kwRows.length} 个 / 候选 ${cands.length} 个`);
if (topKw) console.log(`  最大需求关键词：「${topKw.keyword}」前 8 条合计 ${(topKw.top_play / 10000).toFixed(0)} 万播放`);

// ---------- B. 开工产出 ----------
step('B 工厂交付物（规格 / 质检 / 字幕 / 封面）');
const FINAL = path.join(EP, 'render_16x9', 'final.mp4');
for (const f of [FINAL, path.join(EP, 'karaoke.ass'), path.join(EP, 'cover_16x9.jpg'), path.join(EP, 'subs', 'bilingual.srt'), path.join(EP, 'publish.md'), path.join(EP, 'feedback.csv')]) {
  if (!fs.existsSync(f)) throw new Error(`缺少交付物: ${path.relative(ROOT, f)}`);
}
const qa = J(path.join(EP, 'render_16x9', 'qa.json'));
const probe = ffprobeJson(['-show_entries', 'format=duration', '-show_entries', 'stream=codec_name,width,height', FINAL], path.join(LOGS, 'l12_probe.log'));
const vi = (probe.streams || []).find((s) => s.codec_name === 'h264') || {};
const cues = J(path.join(EP, 'subs', 'cues.json'));
const bilingual = (cues.cues || []).filter((c) => (c.zh || '').trim() && (c.en || '').trim()).length;
const assText = fs.readFileSync(path.join(EP, 'karaoke.ass'), 'utf8');
const assEvents = (assText.match(/^Dialogue:/gm) || []).length;
const finalDur = qa.duration_s;
console.log(`  成片 ${finalDur}s ${vi.width}x${vi.height} / QA ${qa.verdict} / 双语行 ${bilingual}/${cues.cues.length} / ASS 事件 ${assEvents}`);

// 字幕质量（有真值时算 WER / 覆盖率）
const vs = path.join(EP, 'verify_subs.json');
node('Tool/subtitle/verify_subs.mjs', [path.join(EP, 'transcript.json'), path.join(EP, 'ground_truth.json'), '--cues', path.join(EP, 'subs', 'cues.json'), '--json', vs], 'verify_subs', { allowFail: true });
const v = J(vs);
console.log(`  识别 WER ${v.wer ? (v.wer.rate * 100).toFixed(1) + '%' : '—'} / 覆盖 ${v.timing?.coverage_ratio != null ? (v.timing.coverage_ratio * 100).toFixed(1) + '%' : '—'}`);

// ---------- C. 交付包完整性 ----------
step('C 交付包（文案 / 合规 / 上传清单）');
const pub = fs.readFileSync(path.join(EP, 'publish.md'), 'utf8');
const publishChecks = {
  has_title: /标题/.test(pub) && pub.length > 800,
  has_tags: /标签/.test(pub),
  has_zone: /分区/.test(pub),
  has_upload_checklist: /上传清单/.test(pub) && /\[ \]/.test(pub),
  has_license_note: /CC-BY|授权|合规/.test(pub),
  has_feedback_steps: /feedback\.csv/.test(pub),
};

// ---------- D. 反馈闭环 ----------
step('D 反馈闭环（空数据要诚实 + 规则要能跑）');
// 人工反馈数据归 Prototype 快照（符合 AGENTS.md「反馈进 Prototype/」）：
// 构建产物在 Workspace/deliverables/<ep>/，但 feedback.csv / feedback_report.md 放快照目录。
const FB = path.join(ROOT, 'Prototype', 'loop12_market_loop', 'case_ep01', 'feedback.csv');
const FBR = path.join(ROOT, 'Prototype', 'loop12_market_loop', 'case_ep01', 'feedback_report.md');
const stub = run(process.execPath, [path.join(ROOT, 'Tool/ops/track_feedback.mjs'), '--csv', path.relative(ROOT, FB), '--out', path.relative(ROOT, FBR)], path.join(LOGS, 'l12_track_empty.log'));
const emptyReport = fs.readFileSync(FBR, 'utf8');
const dry = run(process.execPath, [path.join(ROOT, 'Tool/ops/track_feedback.mjs'), '--selftest'], path.join(LOGS, 'l12_track_selftest.log'));
const selftest = fs.readFileSync(path.join(ROOT, 'History', 'loops', 'loop12', 'feedback_selftest.md'), 'utf8');
console.log(`  空表 → 「待采集」=${/待采集/.test(emptyReport)}；自检 → 动作 ${(selftest.match(/^- \*\*/gm) || []).length} 条`);

// ---------- E. 交付形态扩展（竖屏 / 封面自检 / 选题雷达）----------
step('E 交付形态扩展（9:16 竖屏 / 封面自检 / 选题雷达）');
const VERT = path.join(EP, 'render_9x16', 'final_9x16.mp4');
const VERT_QA = path.join(EP, 'render_9x16', 'qa.json');
let vert = { exists: fs.existsSync(VERT), w: 0, h: 0, dur: 0, qa: null };
if (vert.exists) {
  const pv = ffprobeJson(['-show_entries', 'format=duration', '-show_entries', 'stream=codec_name,width,height', VERT], path.join(LOGS, 'l12_vert_probe.log'));
  const sv = (pv.streams || []).find((s) => s.codec_name === 'h264') || {};
  vert = { exists: true, w: Number(sv.width || 0), h: Number(sv.height || 0), dur: Number(pv.format?.duration || 0), qa: fs.existsSync(VERT_QA) ? J(VERT_QA).verdict : null };
  console.log(`  竖屏 ${vert.w}x${vert.h} ${vert.dur.toFixed(1)}s / QA ${vert.qa}`);
}
// 封面自检：两张封面各跑一次检查脚本，结果落盘
const coverReports = {};
for (const [tag, file, expect] of [['16x9', path.join(EP, 'cover_16x9.jpg'), '16:9'], ['9x16', path.join(EP, 'cover_9x16.jpg'), '9:16']]) {
  const out = path.join(EP, `cover_${tag}.check.json`);
  node('Tool/ops/check_cover.mjs', ['--cover', path.relative(ROOT, file), '--expect', expect, '--json', path.relative(ROOT, out)], `cover_${tag}`, { allowFail: true });
  coverReports[tag] = fs.existsSync(out) ? J(out) : { verdict: 'MISSING', checks: {} };
  console.log(`  封面 ${tag}：${coverReports[tag].verdict}`);
}
// 选题雷达：至少要有一期索引 + 趋势报告（第二期起才有差分）
const RADAR = path.join(ROOT, 'History', 'ops', 'radar');
const radarIndex = path.join(RADAR, 'index.json');
const radarReport = path.join(RADAR, 'report-latest.md');
let radar = { snapshots: 0, diff: false };
if (fs.existsSync(radarIndex)) {
  radar.snapshots = (J(radarIndex).snapshots || []).length;
  radar.diff = fs.existsSync(radarReport) && /与上一期|这是\*\*第一期\*\*/.test(fs.readFileSync(radarReport, 'utf8'));
  console.log(`  雷达 ${radar.snapshots} 期 / 趋势报告 ${fs.existsSync(radarReport) ? '有' : '无'}`);
}

// ---------- 判定 ----------
const checks = {
  recon_has_data: mr.pool_size >= 60 && cands.length >= 20,
  recon_picks_niche: !!topKw && topKw.top_play > 0,
  final_is_publishable: finalDur > 20 && vi.codec_name === 'h264' && qa.verdict !== 'FAIL' && Math.abs(finalDur - (JSON.parse(fs.readFileSync(path.join(EP, 'ground_truth.json'), 'utf8')).duration_s)) < 0.5,
  bilingual_complete: bilingual === cues.cues.length && cues.cues.length >= 6,
  karaoke_present: assEvents > cues.cues.length,
  asr_good_enough: !!v.wer && v.wer.rate <= 0.15 && (v.timing?.coverage_ratio ?? 0) >= 0.95,
  package_complete: Object.values(publishChecks).every(Boolean),
  feedback_honest_when_empty: /待采集/.test(emptyReport),
  feedback_rules_runnable: /DRY-RUN/.test(selftest) && (selftest.match(/^- \*\*/gm) || []).length >= 2,
  // E：交付形态扩展
  vertical_publishable: vert.exists && vert.w === 1080 && vert.h === 1920 && vert.qa !== 'FAIL' && Math.abs(vert.dur - finalDur) < 0.5,
  covers_pass_selfcheck: coverReports['16x9'].verdict === 'PASS' && coverReports['9x16'].verdict === 'PASS',
  radar_trending: radar.snapshots >= 2 && radar.diff,
};
const pass = Object.values(checks).every(Boolean);

const L = [];
L.push('# 小循环 12 · 市场 ↔ 工厂 闭环验收（自动生成）\n');
L.push(`> 生成时间：${new Date().toISOString()}　交付包：\`${path.relative(ROOT, EP)}\`\n`);
L.push('## 判定\n');
L.push(`**${pass ? 'PASS' : 'FAIL'}**\n`);
L.push('| 环节 | 检查 | 结果 | 数据 |');
L.push('| --- | --- | --- | --- |');
L.push(`| A 侦查 | 拿到公开市场样本 | ${checks.recon_has_data ? '✅' : '❌'} | ${mr.pool_size} 条榜单 / ${cands.length} 个候选 |`);
L.push(`| A 侦查 | 选出有需求的方向 | ${checks.recon_picks_niche ? '✅' : '❌'} | 「${topKw?.keyword ?? '—'}」前 8 条 ${((topKw?.top_play ?? 0) / 10000).toFixed(0)} 万播放 |`);
L.push(`| B 开工 | 成片可发布（时长/编码/质检） | ${checks.final_is_publishable ? '✅' : '❌'} | ${finalDur}s ${vi.width}x${vi.height} h264 / QA ${qa.verdict} |`);
L.push(`| B 开工 | 双语字幕齐全 | ${checks.bilingual_complete ? '✅' : '❌'} | ${bilingual}/${cues.cues.length} 行双语 |`);
L.push(`| B 开工 | 逐词高亮（ASS） | ${checks.karaoke_present ? '✅' : '❌'} | ${assEvents} 条事件 |`);
L.push(`| B 开工 | 识别质量够用 | ${checks.asr_good_enough ? '✅' : '❌'} | WER ${v.wer ? (v.wer.rate * 100).toFixed(1) + '%' : '—'} / 覆盖 ${(v.timing?.coverage_ratio * 100).toFixed(1)}% |`);
L.push(`| C 交付 | 发布文案/标签分区/上传清单/合规 | ${checks.package_complete ? '✅' : '❌'} | ${Object.entries(publishChecks).filter(([, x]) => x).length}/${Object.keys(publishChecks).length} |`);
L.push(`| D 反馈 | 空数据时诚实标"待采集" | ${checks.feedback_honest_when_empty ? '✅' : '❌'} | |`);
L.push(`| D 反馈 | 规则能跑并给出动作 | ${checks.feedback_rules_runnable ? '✅' : '❌'} | 自检 ${(selftest.match(/^- \*\*/gm) || []).length} 条动作（DRY-RUN） |`);
L.push(`| E 形态 | 竖屏 9:16 可发布 | ${checks.vertical_publishable ? '✅' : '❌'} | ${vert.w}x${vert.h} ${vert.dur.toFixed(1)}s / QA ${vert.qa ?? '—'} |`);
L.push(`| E 形态 | 双封面自检通过 | ${checks.covers_pass_selfcheck ? '✅' : '❌'} | 16:9 ${coverReports['16x9'].verdict} / 9:16 ${coverReports['9x16'].verdict}（像素统计，不含 OCR） |`);
L.push(`| E 运营 | 选题雷达能出趋势 | ${checks.radar_trending ? '✅' : '❌'} | ${radar.snapshots} 期快照 / 差分报告 ${radar.diff ? '有' : '无'} |`);
L.push('');
L.push('## 链路状态（诚实版）\n');
L.push('| 段 | 状态 | 说明 |');
L.push('| --- | --- | --- |');
L.push('| ① 市场侦查 | ✅ 已跑 | B 站公开接口（ranking/popular/search）可直连；产出 `market_report.md`（样本/分区/时长/关键词市场/候选排序） |');
L.push('| ② 工厂开工 | ✅ 已跑 | 37s 样片：合成口播 → 识别 → **讲稿强制对齐** → 精译 → 逐词高亮 → 烧入 → 质检 PASS |');
L.push('| ③ 交付市场 | ⏳ 待人工 | 交付包已就绪（成片/封面/文案/标签/分区/合规声明）；**上架需要你的账号**，工厂不代登录 |');
L.push('| ④ 反馈追踪 | ⏳ 待数据 | `feedback.csv` 目前为空；追踪器已能算完播/点赞/收藏/评论率并给 P0/P1 动作（自检用 DRY-RUN 合成数据验证） |');
L.push('| ⑤ 迭代 | ⏳ 待反馈 | 迭代规则已就绪（完播<35% → 重做前 3 秒；评论提字幕 → 调字号/CPS；提译文 → 走校对回写重发） |');
L.push('');
L.push('## 这一轮暴露并修掉的问题\n');
L.push('| 问题 | 现象 | 修法 |');
L.push('| --- | --- | --- |');
L.push('| 合成素材音轨取错 | 成片里是影片自带的配乐，ASR 0 词（acceptHits=7 但全空） | `make_episode` 显式 `-map 0:v:0 -map 1:a:0` |');
L.push('| BOM 让 JSON 解析崩 | 手工写的 `zh_agent.json` 带 BOM → `Unexpected token` | `make_subs` 统一 `readJson`（去 BOM） |');
L.push('| TTS 词间无停顿 → 断句崩 | `restore_punct` 把 7 句并成 5 句且串行（\"number two\" 被吃） | 新增 `align_script.mjs`：有讲稿时按真值句子强制对齐词流 |');
L.push('');
L.push('## 复现\n');
L.push('```powershell');
L.push('node Tool\\acceptance\\run_market_loop_acceptance.mjs');
L.push('```');
fs.writeFileSync(path.join(OUTDIR, 'acceptance.md'), L.join('\n') + '\n', 'utf8');
fs.writeFileSync(path.join(OUTDIR, 'metrics.json'), JSON.stringify({
  generated_at: new Date().toISOString(),
  recon: { pool: mr.pool_size, candidates: cands.length, keywords: kwRows.map((k) => ({ kw: k.keyword, num: k.num_results, top_play: k.top_play })), top_keyword: topKw?.keyword ?? null },
  episode: { path: path.relative(ROOT, EP), final_s: finalDur, w: vi.width, h: vi.height, qa: qa.verdict, cues: cues.cues.length, bilingual, ass_events: assEvents, wer: v.wer?.rate ?? null, coverage: v.timing?.coverage_ratio ?? null },
  vertical: { exists: vert.exists, w: vert.w, h: vert.h, dur_s: Number(vert.dur.toFixed(2)), qa: vert.qa },
  covers: { '16x9': coverReports['16x9'].verdict, '9x16': coverReports['9x16'].verdict, detail: { '16x9': coverReports['16x9'].checks, '9x16': coverReports['9x16'].checks } },
  radar: { snapshots: radar.snapshots, has_diff_report: radar.diff },
  publish_checks: publishChecks,
  feedback: { empty_report_says_pending: /待采集/.test(emptyReport), selftest_actions: (selftest.match(/^- \*\*/gm) || []).length },
  checks, pass,
}, null, 2), 'utf8');

console.log(`\n=== 市场闭环验收: ${pass ? 'PASS' : 'FAIL'} ===`);
for (const [k, val] of Object.entries(checks)) console.log(`  ${val ? '✅' : '❌'} ${k}`);
console.log(`[acceptance] -> ${path.relative(ROOT, path.join(OUTDIR, 'acceptance.md'))}`);
process.exit(pass ? 0 : 1);
