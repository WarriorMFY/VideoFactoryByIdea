#!/usr/bin/env node
/**
 * 校验 Skills/ 下的技能文件是否「没腐化」。
 *
 * 检查三件事：
 *   1. SKILL.md 有 frontmatter，且含 name / description（description 必须带触发条件）
 *   2. SKILL.md 里引用的仓库路径真实存在（路径失效 = 技能说谎）
 *   3. SKILL.md 不含大段实现代码（方法论层不该放实现，应改为路径引用）
 *
 * 用法：
 *   node Tool/check/check_skill.mjs            # 扫 Skills/ 全部
 *   node Tool/check/check_skill.mjs --json     # 机器可读
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SKILLS_DIR = path.join(ROOT, 'Skills');
const JSON_OUT = process.argv.includes('--json');

const problems = [];
const notes = [];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name === 'SKILL.md') out.push(p);
  }
  return out;
}

function parseFrontmatter(text) {
  if (!text.startsWith('---')) return null;
  const end = text.indexOf('\n---', 3);
  if (end < 0) return null;
  const body = text.slice(3, end);
  const meta = {};
  for (const line of body.split('\n')) {
    const m = line.match(/^([a-zA-Z_-]+):\s*(.*)$/);
    if (m) meta[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
  return meta;
}

// 从正文里捞「看起来是路径」的行内代码
function extractPathRefs(text) {
  const out = new Set();
  for (const m of text.matchAll(/`([^`\n]{2,120})`/g)) {
    const raw = m[1].trim();
    if (/^https?:/.test(raw)) continue;
    if (raw.startsWith('-')) continue;            // 命令行参数
    if (/\s/.test(raw)) continue;                 // 含空格 = 多半是命令
    if (/[<>|*?]/.test(raw)) continue;            // 通配/占位
    if (/^\.[a-z]+$/.test(raw)) continue;         // 纯扩展名（如 `.md`）
    const looksPath = raw.includes('/') || /\.(mjs|md|sh|json|txt|csv)$/.test(raw);
    if (!looksPath) continue;
    out.add(raw);
  }
  return [...out];
}

function resolveRef(ref, skillDir) {
  const clean = ref.replace(/[.,;:]+$/, '');
  const rel = clean.endsWith('/') ? clean.slice(0, -1) : clean;
  // 单段引用（如 `lib/`、`seed/`）多为方法论里的通用占位，只有真实顶层目录才算数
  const segments = rel.split('/').filter(Boolean);
  const generic = !rel.startsWith('../') && segments.length <= 1;
  const bases = rel.startsWith('../') ? [ROOT, skillDir] : [ROOT, skillDir];
  for (const base of bases) {
    const abs = path.resolve(base, rel);
    if (fs.existsSync(abs)) return { ok: true, abs, generic };
  }
  return { ok: false, generic };
}

// 大段代码块 = 把实现抄进了方法论层
function findCodeBlocks(text) {
  const blocks = [];
  for (const m of text.matchAll(/```(\w*)\n([\s\S]*?)```/g)) {
    const lang = m[1] || 'text';
    const lines = m[2].trimEnd().split('\n').length;
    // 目录树、纯文本示意不算实现
    if (['text', 'bash', 'sh', ''].includes(lang) && lines <= 25) continue;
    blocks.push({ lang, lines });
  }
  return blocks;
}

const files = walk(SKILLS_DIR);
if (!files.length) {
  console.error('Skills/ 下没有找到 SKILL.md');
  process.exit(1);
}

for (const file of files) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const dir = path.dirname(file);
  const text = fs.readFileSync(file, 'utf8');

  const meta = parseFrontmatter(text);
  if (!meta) { problems.push(`${rel}: 缺 frontmatter`); continue; }
  if (!meta.name) problems.push(`${rel}: frontmatter 缺 name`);
  if (!meta.description) problems.push(`${rel}: frontmatter 缺 description`);
  if (meta.description && !/当|使用|触发|when/i.test(meta.description))
    problems.push(`${rel}: description 没写触发条件（模型不会选中它）`);
  if (meta.name && path.basename(dir) !== meta.name)
    problems.push(`${rel}: name「${meta.name}」与目录名「${path.basename(dir)}」不一致`);

  const refs = extractPathRefs(text);
  let ok = 0;
  let generic = 0;
  for (const ref of refs) {
    const r = resolveRef(ref, dir);
    if (r.ok) ok++;
    else if (r.generic) generic++;
    else problems.push(`${rel}: 引用路径失效 → ${ref}`);
  }
  notes.push(`${rel}: 引用 ${refs.length} 条（解析成功 ${ok}，通用占位 ${generic}）`);

  for (const b of findCodeBlocks(text)) {
    if (b.lines > 40) problems.push(`${rel}: 含 ${b.lines} 行 ${b.lang} 代码块（方法论层应改为路径引用）`);
  }

  const lines = text.split('\n').length;
  if (lines > 260) problems.push(`${rel}: ${lines} 行，偏长（细节应下沉到 references/）`);
  notes.push(`${rel}: ${lines} 行`);
}

if (JSON_OUT) {
  console.log(JSON.stringify({ files: files.length, problems, notes }, null, 2));
} else {
  console.log(`扫描 ${files.length} 个技能`);
  for (const n of notes) console.log('  ·', n);
  if (problems.length) {
    console.log(`\n✗ ${problems.length} 个问题：`);
    for (const p of problems) console.log('  -', p);
    process.exit(1);
  }
  console.log('\n✓ 全部通过');
}
