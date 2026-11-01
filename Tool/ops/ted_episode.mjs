#!/usr/bin/env node
// ted_episode.mjs —— TED 名人演讲 → 双语逐词高亮成片，一条命令跑完（小循环 14 批量期固化）
//
// 前提（素材阶段，由 ted_subs.mjs + ffmpeg 完成，本脚本不重复下载）：
//   <dir>/talk_720p.mp4        源片（hls f11 视频 + f12 音频）
//   <dir>/cues_en.json         官方英文字幕 cue（ted_subs --offset 0）
//   <dir>/cues_zh-cn.json      官方中文字幕 cue
//
// 本脚本做：ASR → 标定预卷偏移 → 强制对齐 → 官方中译直灌（缺失则并回碎片重算）
//           → 句级双语字幕 → 卡拉OK ASS → 出 EDL → 重映射 → 渲染（只渲染一次）
//
// 用法：
//   node Tool/ops/ted_episode.mjs --dir Workspace/tmp/xxx --out Prototype/loop14_talk/ep_c
//        [--asr 1]        已有 tr.json 时传 --asr 0 跳过
//        [--max-word 26]  merge_fragments 的合并上限
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');

const args = process.argv.slice(2);
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const DIR = path.resolve(ROOT, getOpt('--dir', ''));
const OUT = path.resolve(ROOT, getOpt('--out', ''));
const DO_ASR = getOpt('--asr', '1') !== '0';
const MAX_WORD = getOpt('--max-word', '26');
if (!DIR || !OUT) { console.error('need --dir and --out'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });

const t0 = Date.now();
const step = (n, msg) => console.log(`\n[${n}] ${msg}  (+${((Date.now() - t0) / 1000).toFixed(0)}s)`);
const run = (script, argv, label) => {
  const r = spawnSync(process.execPath, [path.join(ROOT, script), ...argv], { cwd: ROOT, encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status !== 0) { console.error(out.slice(-1500)); throw new Error(`${label} 失败 exit=${r.status}`); }
  return out;
};
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const writeJson = (p, o) => fs.writeFileSync(p, JSON.stringify(o, null, 1));

// ---------- 1. ASR ----------
const TR = path.join(DIR, 'tr.json');
if (DO_ASR || !fs.existsSync(TR)) {
  step(1, 'ASR 词级时间轴');
  const o = run('Tool/subtitle/asr_vosk.mjs', [rel(path.join(DIR, 'talk_720p.mp4')), '--out', rel(TR), '--af', 'highpass=f=100,lowpass=f=6000'], 'asr');
  console.log(o.split('\n').filter(l => l.startsWith('[asr]')).join('\n'));
} else step(1, 'ASR 复用已有 tr.json');

// ---------- 2. 预卷偏移标定 ----------
step(2, '标定官方字幕的预卷偏移');
const gtRaw = path.join(DIR, 'gt_raw.json');
writeJson(gtRaw, { sentences: readJson(path.join(DIR, 'cues_en.json')) });
const offOut = run('Tool/subtitle/estimate_offset.mjs', [rel(TR), rel(gtRaw)], 'offset');
console.log(offOut.trim());
const m = offOut.match(/建议偏移\s*(-?[\d.]+)s/);
if (!m) throw new Error('偏移标定失败：未解析到建议值');
const OFF = Number(m[1]);

// ---------- 3. 应用偏移 ----------
const shift = (src, dst) => {
  const c = readJson(src).map(x => ({ ...x, start: +(x.start + OFF).toFixed(3), end: +(x.end + OFF).toFixed(3) }));
  writeJson(dst, c);
  return c;
};
const enSh = shift(path.join(DIR, 'cues_en.json'), path.join(DIR, 'cues_en_sh.json'));
shift(path.join(DIR, 'cues_zh-cn.json'), path.join(DIR, 'cues_zh_sh.json'));
const gt = path.join(DIR, 'gt.json');
writeJson(gt, { sentences: enSh });

// ---------- 4. 强制对齐 ----------
step(3, '官方英文字幕强制对齐 ASR 词流');
const aligned0 = path.join(DIR, 'aligned.json');
const alOut = run('Tool/subtitle/align_script.mjs', [rel(TR), rel(gt), '--out', rel(aligned0)], 'align');
const st = alOut.match(/"covered":\s*(\d+)[\s\S]*?"unassigned":\s*(\d+)/);
console.log(st ? `覆盖 ${st[1]} 词 / 未分配 ${st[2]}` : alOut.split('\n').slice(-3).join('\n'));

// ---------- 5. 官方中译直灌（缺失 → 并碎片 → 重算，最多 3 轮）----------
step(4, '官方中译直灌（clause 级分配）');
let aligned = aligned0;
let zhMap = path.join(DIR, 'zh_official.json');
let report = '';
for (let round = 1; round <= 3; round++) {
  report = run('Tool/subtitle/build_zh_map.mjs', [rel(aligned), rel(path.join(DIR, 'cues_zh_sh.json')), '--out', rel(zhMap)], 'zh-map');
  const r = report.match(/命中=(\d+)\s+缺失=(\d+)/);
  const hit = r ? +r[1] : 0, miss = r ? +r[2] : 0;
  console.log(`  轮 ${round}: 命中 ${hit} 缺失 ${miss}`);
  if (!miss) break;
  const merged = path.join(DIR, `aligned_m${round}.json`);
  const mo = run('Tool/subtitle/merge_fragments.mjs', [rel(aligned), rel(zhMap), '--out', rel(merged), '--max-words', String(MAX_WORD)], 'merge');
  console.log('  ' + mo.trim().split('\n')[0]);
  aligned = merged;
}

// ---------- 6. 句级双语字幕 ----------
step(5, '生成句级双语字幕');
const subsDir = path.join(DIR, 'subs');
const so = run('Tool/subtitle/make_subs.mjs', [rel(aligned), '--out', rel(subsDir), '--punct', '--mt', 'agent', '--zh-file', rel(zhMap), '--cps', '22'], 'make_subs');
console.log(so.split('\n').slice(-2).join('\n'));
const cues = path.join(subsDir, 'cues.json');

// ---------- 7. 先出 EDL（不渲染）----------
step(6, '出剪辑计划（plan-only）');
const planDir = path.join(DIR, 'plan');
const po = run('Tool/edit/vfactory.mjs', [rel(path.join(DIR, 'talk_720p.mp4')), '--out', rel(planDir), '--protect', rel(TR), '--max-cut', '100', '--plan-only'], 'plan');
console.log(po.split('\n').filter(l => l.includes('[plan-only]')).join('\n') || po.split('\n').slice(-2).join('\n'));

// ---------- 8. 字幕重映射 + 渲染（一次编码）----------
step(7, '按 EDL 重映射卡拉OK字幕并渲染');
run('Tool/subtitle/make_ass.mjs', [rel(cues), '--edl', rel(path.join(planDir, 'edits.json')), '--out', rel(path.join(DIR, 'karaoke_remap.ass')), '--hl', '33E6C8', '--zh-margin-mode', 'fixed'], 'make_ass');
const ro = run('Tool/edit/vfactory.mjs', [rel(path.join(DIR, 'talk_720p.mp4')), '--out', rel(OUT), '--protect', rel(TR), '--srt', rel(path.join(DIR, 'karaoke_remap.ass')), '--max-cut', '100'], 'render');
console.log(ro.split('\n').filter(l => l.startsWith('[done]') || l.startsWith('  - final')).join('\n'));

const final = path.join(OUT, 'final.mp4');
const summary = {
  dir: rel(DIR), out: rel(OUT), offset_s: OFF,
  asr_words: (readJson(TR).words || []).length,
  sentences: readJson(aligned).sentences.length,
  final_exists: fs.existsSync(final),
  elapsed_s: +((Date.now() - t0) / 1000).toFixed(0),
};
writeJson(path.join(OUT, 'build_summary.json'), summary);
step(8, '完成');
console.log(JSON.stringify(summary, null, 1));
