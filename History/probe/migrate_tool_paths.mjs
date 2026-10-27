#!/usr/bin/env node
/**
 * 一次性迁移脚本（用完即删）：把 Tool/ 下脚本的相对路径改到新子目录结构
 * - import './lib/ff.mjs'  → '../lib/ff.mjs'
 * - import.meta.dirname,'..' → 补一级（脚本下沉了一层）
 * - 验收脚本里的子脚本/术语表路径 → 新子目录
 * 用 Node 做字符串替换（避免 PowerShell 的引号/编码坑）。
 */
import fs from 'node:fs';
import path from 'node:path';

const TOOL = path.join(process.cwd(), 'Tool');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const files = walk(TOOL).filter((f) => f.endsWith('.mjs') && !f.endsWith('lib/ff.mjs'));

let changed = 0;
const report = [];
for (const f of files) {
  let t = fs.readFileSync(f, 'utf8');
  const before = t;
  t = t.split("from './lib/ff.mjs'").join("from '../lib/ff.mjs'");
  // 下沉一层后，基于 import.meta.dirname 定位仓库根的地方要再上跳一级
  t = t.split("const root = path.resolve(import.meta.dirname, '..');").join("const root = path.resolve(import.meta.dirname, '..', '..');");
  t = t.split("const ROOT = path.resolve(import.meta.dirname, '..');").join("const ROOT = path.resolve(import.meta.dirname, '..', '..');");
  // 验收脚本里的子脚本名 → 子目录相对路径
  for (const [a, b] of [
    ["'make_bench_source.mjs'", "'bench/make_bench_source.mjs'"],
    ["'make_real_bench.mjs'", "'bench/make_real_bench.mjs'"],
    ["'make_l2_bench.mjs'", "'bench/make_l2_bench.mjs'"],
    ["'vfactory.mjs'", "'edit/vfactory.mjs'"],
    ["'make_timeline.mjs'", "'edit/make_timeline.mjs'"],
    ["'asr_vosk.mjs'", "'subtitle/asr_vosk.mjs'"],
    ["'make_subs.mjs'", "'subtitle/make_subs.mjs'"],
    ["'remap_subs.mjs'", "'subtitle/remap_subs.mjs'"],
    ["'verify_subs.mjs'", "'subtitle/verify_subs.mjs'"],
    ["'verify_edl.mjs'", "'acceptance/verify_edl.mjs'"],
    ["'qa_report.mjs'", "'acceptance/qa_report.mjs'"],
    ["path.join(ROOT, 'Tool', 'glossary_zh.json')", "path.join(ROOT, 'Tool', 'subtitle', 'glossary_zh.json')"],
  ]) t = t.split(a).join(b);
  if (t !== before) { fs.writeFileSync(f, t); changed++; report.push(path.relative(TOOL, f)); }
}
console.log(`[migrate] ${changed} files patched:`, report.join(', '));
