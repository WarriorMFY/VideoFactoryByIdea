#!/usr/bin/env node
// bgm_scan.mjs — 批量卡点扫描：对一个目录下的全部候选音乐跑 bgm_fit，按误差排序输出
// 用法: node Tool/audio/bgm_scan.mjs --dir <音乐目录> --hits a,b,c --dur N [--out 结果.csv] [--tol 0.05]
// 退出码: 0=有候选全 PASS；1=无候选全 PASS；2=参数错误

import { readdirSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIT = join(HERE, 'bgm_fit.mjs');
const EXTS = new Set(['.mp3', '.wav', '.flac', '.m4a', '.ogg', '.aac']);

const argv = process.argv.slice(2);
const get = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const DIR = get('--dir', null), HITS = get('--hits', null), DUR = get('--dur', null);
const OUT = get('--out', null), TOL = get('--tol', '0.05');
if (!DIR || !HITS || !DUR) {
  console.error('用法: node Tool/audio/bgm_scan.mjs --dir <音乐目录> --hits a,b,c --dur N [--out x.csv]');
  process.exit(2);
}

const files = readdirSync(DIR).filter((f) => EXTS.has(extname(f).toLowerCase())).sort();
if (!files.length) { console.error('目录内没有音频文件: ' + DIR); process.exit(2); }

const rows = [];
for (const f of files) {
  const p = spawnSync(process.execPath, [FIT, '--music', join(DIR, f), '--hits', HITS, '--dur', DUR, '--tol', TOL],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const t = (p.stdout || '') + (p.stderr || '');
  const ms = [...t.matchAll(/^\s+\d+\s+[\d.]+s\s+[\d.]+s\s+(\d+)\s/gm)].map((m) => Number(m[1]));
  const pass = (t.match(/ PASS/g) || []).length;
  const noOnset = (t.match(/NO-ONSET/g) || []).length;
  const len = Number((t.match(/MB, ([\d.]+)s\)/) || [])[1] || 0);
  rows.push({
    name: f, pass, noOnset, len,
    mean: ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length : null,
    max: ms.length ? Math.max(...ms) : null,
    note: ms.length ? '' : (/曲长 .* 不足/.test(t) ? '曲长不足' : '无瞬态'),
  });
}

const nHits = HITS.split(',').length;
rows.sort((a, b) => (a.mean === null ? 1 : 0) - (b.mean === null ? 1 : 0) || (a.mean ?? 0) - (b.mean ?? 0));
console.log(`\n${'曲名'.padEnd(34)} PASS   均值    最大   曲长`);
for (const r of rows) {
  console.log(r.mean === null
    ? `${r.name.padEnd(34)} —      ${r.note}   —      ${r.len.toFixed(1)}s`
    : `${r.name.padEnd(34)} ${String(r.pass + '/' + nHits).padStart(5)}  ${String(Math.round(r.mean)).padStart(4)}ms ${String(r.max).padStart(5)}ms  ${r.len.toFixed(1)}s`);
}
const full = rows.filter((r) => r.mean !== null && r.noOnset === 0 && r.pass > 0);
const best = rows.find((r) => r.mean !== null);
console.log(`\n共 ${rows.length} 首：可评估 ${rows.filter((r) => r.mean !== null).length} / 不可评估 ${rows.filter((r) => r.mean === null).length}`);
console.log(best ? `最优候选: ${best.name}（均值 ${Math.round(best.mean)}ms，最大 ${best.max}ms）` : '无可用候选');

if (OUT) {
  const csv = ['曲名,PASS,无瞬态点,误差均值ms,最大ms,曲长s,备注'];
  for (const r of rows) csv.push([r.name, r.pass, r.noOnset, r.mean === null ? 'NA' : Math.round(r.mean), r.max ?? 'NA', r.len.toFixed(1), r.note].join(','));
  writeFileSync(resolve(OUT), csv.join('\n') + '\n');
  console.log('结果已写入: ' + resolve(OUT));
}
process.exit(full.length ? 0 : 1);
