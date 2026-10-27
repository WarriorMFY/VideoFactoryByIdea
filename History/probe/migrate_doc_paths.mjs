#!/usr/bin/env node
/**
 * 一次性迁移（用完即删）：把 Prototype/ 与其它文档里对 Tool/*.mjs 的旧路径改成新子目录结构。
 * 用 Node 处理（PowerShell 批量替换曾写坏文件）。只改 md / ps1 文档与脚本。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MAP = {
  'bootstrap_ffmpeg.mjs': 'setup',
  'bootstrap_asr.mjs': 'setup',
  'fetch_vosk_model.mjs': 'setup',
  'fetch_real_footage.mjs': 'setup',
  'fetch_realspeech.mjs': 'setup',
  'npm_fetch.mjs': 'setup',
  'make_bench_source.mjs': 'bench',
  'make_real_bench.mjs': 'bench',
  'make_l2_bench.mjs': 'bench',
  'tts_sapi.ps1': 'bench',
  'vfactory.mjs': 'edit',
  'make_timeline.mjs': 'edit',
  'asr_vosk.mjs': 'subtitle',
  'make_subs.mjs': 'subtitle',
  'remap_subs.mjs': 'subtitle',
  'verify_subs.mjs': 'subtitle',
  'glossary_zh.json': 'subtitle',
  'verify_edl.mjs': 'acceptance',
  'qa_report.mjs': 'acceptance',
  'run_acceptance.mjs': 'acceptance',
  'run_subs_acceptance.mjs': 'acceptance',
  'run_real_acceptance.mjs': 'acceptance',
};

const targets = [];
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === 'Workspace' || e.name === 'History') continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(md|ps1|json|mjs)$/.test(e.name) && !p.includes(path.sep + 'Tool' + path.sep)) targets.push(p);
  }
};
walk(path.join(ROOT, 'Prototype'));

let changed = 0;
const log = [];
for (const f of targets) {
  let t = fs.readFileSync(f, 'utf8');
  const before = t;
  for (const [file, dir] of Object.entries(MAP)) {
    // 已经在新路径里的先跳过（避免二次加前缀）
    const esc = file.replace(/\./g, '\\.');
    const re = new RegExp(`(Tool[\\\\/])(?!(?:setup|bench|edit|subtitle|acceptance|lib)[\\\\/])${esc}`, 'g');
    t = t.replace(re, `$1${dir}/${file}`);
  }
  if (t !== before) { fs.writeFileSync(f, t); changed++; log.push(path.relative(ROOT, f)); }
}
console.log(`[migrate-docs] ${changed} files patched:`);
console.log(log.join('\n'));
