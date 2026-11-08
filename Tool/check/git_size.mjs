#!/usr/bin/env node
/* 仓库体积体检：把 HEAD 里被跟踪的文件分成 4 档，算出「移出后能省多少」。
 *
 *   K 必留   代码 / 文档 / 清单 / 回执 / 索引 / 字幕 —— 入库的唯一理由
 *   A 零风险  纯中间件（pcm、raw、.asr_work）—— 跑一次就有
 *   B 取证图  对照图、条带图、网格图、关键帧 —— 结论已写进 md，图可重抽
 *   C 素材片  录制片、对照片、示例成片 —— 重生成要重跑整条流水线
 *
 * 用法：
 *   node Tool/check/git_size.mjs                 # 打印四档汇总 + 目录拆解
 *   node Tool/check/git_size.mjs --csv out.csv   # 明细（tier,size_mb,ext,path）
 *   node Tool/check/git_size.mjs --drop-list d.txt   # 非 K 档路径清单（供 filter-repo --invert-paths）
 *   node Tool/check/git_size.mjs --keep-list k.txt   # K 档路径清单（供 filter-repo --paths-from-file）
 *
 * 边界：只读，不改 git 状态；只统计 HEAD 里「被跟踪」的文件，不统计工作区与历史对象。
 *       历史体积另看 `git count-objects -vH`（重写前 1.6GB 里 320MB 是已删文件的历史垃圾，
 *       本工具看不见——那部分只能靠 filter-repo 的「只保留」模式清掉）。
 * 依据：loop46（2026-11-08）实测与重写，判定口径见 History/runs/git-rewrite/git-rewrite.md。
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : '';
};

const raw = execFileSync('git', ['-c', 'core.quotepath=false', 'ls-tree', '-r', '-l', 'HEAD'], {
  cwd: ROOT, maxBuffer: 1 << 28,
}).toString().split('\n').filter(Boolean);

const files = raw.map((line) => {
  const [meta, ...rest] = line.split('\t');
  const p = rest.join('\t');
  return { path: p, size: Number(meta.trim().split(/\s+/)[3]) || 0, ext: (p.match(/\.([^./]+)$/) || [, ''])[1].toLowerCase() };
});

const KEEP_DIRS = ['Tool/', 'Skills/', 'Idea/', 'Material/docs/', 'Material/_template/'];
const KEEP_FILES = new Set(['AGENTS.md', 'README.md', 'Material/Material.md', 'Material/kinds.json']);

function classify(p) {
  if (KEEP_DIRS.some((d) => p.startsWith(d)) || KEEP_FILES.has(p)) return 'K';
  if (/\.md$|\.mjs$|\.jsonl?$|\.ya?ml$|\.html$|\.csv$|\.srt$|\.ass$|\.ps1$|\.txt$|\.log$/i.test(p)) return 'K';
  if (/\.pcm$|\.raw$|\.wav$/i.test(p)) return 'A';
  if (/\/\.asr_work\/|\/\.work\/|\/\.qa\//.test(p)) return 'A';
  if (/\.(png|jpg|jpeg|webp)$/i.test(p)) {
    if (/^History\/publish\//.test(p)) return 'K'; // 发布封面/回执截图：定稿证据
    return 'B';
  }
  if (/\.mp4$/i.test(p)) {
    if (/loop12_market_loop\/case_ep01\/final_16x9\.mp4$/.test(p)) return 'K'; // 唯一入库的示例成片（干净 clone 回填用）
    return 'C';
  }
  return 'K';
}

const tiers = { K: { n: 0, b: 0 }, A: { n: 0, b: 0 }, B: { n: 0, b: 0 }, C: { n: 0, b: 0 } };
const bulk = {};
for (const f of files) {
  f.tier = classify(f.path);
  tiers[f.tier].n++; tiers[f.tier].b += f.size;
  const d = f.path.split('/').slice(0, 2).join('/');
  bulk[`${f.tier}|${d}`] = (bulk[`${f.tier}|${d}`] || 0) + f.size;
}

const MB = (b) => (b / 1048576).toFixed(1).padStart(8);
const total = files.reduce((s, f) => s + f.size, 0);
console.log(`HEAD 跟踪 ${files.length} 文件 / ${MB(total)} MB\n`);
const cn = { K: '必留', A: '零风险', B: '取证图', C: '素材/成片' };
for (const t of ['K', 'A', 'B', 'C']) console.log(`  ${t} ${cn[t]}  ${MB(tiers[t].b)} MB  ${String(tiers[t].n).padStart(5)} 个`);

const drop = tiers.A.b + tiers.B.b + tiers.C.b;
console.log(`\n  可移出 ${MB(drop)} MB（占 ${((drop / total) * 100).toFixed(1)}%），移出后 ${MB(total - drop)} MB\n`);

console.log('按目录拆（>5MB）');
for (const t of ['C', 'B', 'A']) {
  Object.entries(bulk).filter(([k]) => k.startsWith(t + '|')).sort((a, b) => b[1] - a[1])
    .filter(([, v]) => v > 5 * 1048576)
    .forEach(([k, v]) => console.log(`  ${t}  ${MB(v)} MB  ${k.slice(2)}`));
}

if (opt('--csv')) {
  const lines = ['tier,size_mb,ext,path', ...files.sort((a, b) => b.size - a.size)
    .map((f) => `${f.tier},${(f.size / 1048576).toFixed(2)},${f.ext},"${f.path}"`)];
  fs.writeFileSync(path.resolve(ROOT, opt('--csv')), lines.join('\n'), 'utf8');
  console.log(`\n明细 → ${opt('--csv')}`);
}
if (opt('--drop-list')) {
  const d = files.filter((f) => f.tier !== 'K').map((f) => f.path);
  fs.writeFileSync(path.resolve(ROOT, opt('--drop-list')), d.join('\n') + '\n', 'utf8');
  console.log(`移出清单（${d.length} 条）→ ${opt('--drop-list')}`);
}
if (opt('--keep-list')) {
  const k = files.filter((f) => f.tier === 'K').map((f) => f.path);
  fs.writeFileSync(path.resolve(ROOT, opt('--keep-list')), k.join('\n') + '\n', 'utf8');
  console.log(`保留清单（${k.length} 条）→ ${opt('--keep-list')}`);
}
