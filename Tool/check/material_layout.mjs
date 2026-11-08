#!/usr/bin/env node
/**
 * material_layout.mjs — 素材库「入库目录模板」合规校验（v1，kinds.json 驱动）
 *
 * 规则源：Material/docs/模板规范.md（人读）+ Material/kinds.json（机器读的素材类注册表）
 * 用法：  node Tool/check/material_layout.mjs [--quiet] [--json]
 *
 * 为什么改成注册表驱动：v0 把「处决镜头」的形状（uNN.mp4/jpg/ass + catalog.csv + index.html）
 * 写死在代码里，换任何一类素材（关键帧/音效/空镜）都直接报「没有 uNN.mp4」。现在每类自己
 * 声明 shape，校验器只按声明核对 —— 加新素材类 = 改 kinds.json，不改代码。
 *
 * 错误码
 *   F1 账本条目指向的实体不存在（悬空）
 *   F2 题材目录缺同名索引 <题材>.md
 *   F3 素材类目录不合 shape 声明（units：编号不连续/套件缺件；files：命名不符 namePattern）
 *   F4 rootFiles 缺件，或 catalog.csv 行数与单位数不符
 *   F5 有单位但根目录没有 index.html（核对页）
 *   F6 题材层缺 源片/、为空，或命名不符 <来源标识>_<短名>_<规格>
 *   F7 有实体无账；账本 path 的目录与 topic/kind 字段不一致
 *   F8 账本字段不合字段字典（缺 topic/kind、kind 未注册、tier 越界、license_class 非枚举）
 *   F9 素材类目录名未在 kinds.json 注册（先用临时名再登记，等于没有模板）
 * 告警
 *   W1 母版规格与 kinds[kind].masterSpec 不符
 *   W2 题材目录缺 .gitignore 的「只放索引」排除
 *   W3 标 status=declared 的类已有实体（该升 active 并补 rootFiles）
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT } from '../lib/ff.mjs';
import { LICENSE_CLASSES } from '../lib/license.mjs';

const MATERIAL = path.join(ROOT, 'Material');
const MANIFEST = path.join(MATERIAL, 'manifest.jsonl');
const KINDS_FILE = path.join(MATERIAL, 'kinds.json');
const FP = path.join(ROOT, 'Workspace/deps/ffmpeg/ffprobe.exe');
const quiet = process.argv.includes('--quiet');
const asJson = process.argv.includes('--json');

const E = [], W = [];
const err = (code, msg) => E.push({ code, msg });
const warn = (code, msg) => W.push({ code, msg });
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
const SKIP_DIRS = new Set(['library', 'briefs', 'inbox', 'quarantine', 'docs', '_template', 'node_modules']);
const TIERS = ['L0', 'L1', 'L2', 'L3'];

if (!fs.existsSync(MATERIAL)) { console.error('没有 Material/ 目录'); process.exit(1); }

/* ---------- 注册表 ---------- */
let REG = { kinds: {} };
if (!fs.existsSync(KINDS_FILE)) err('F9', '缺 Material/kinds.json（素材类注册表），校验无从下手');
else {
  try { REG = JSON.parse(fs.readFileSync(KINDS_FILE, 'utf8')); }
  catch (e) { err('F9', `kinds.json 解析失败：${e.message}`); }
}
const KIND = (name) => REG.kinds?.[name];

/* ---------- 账本 ---------- */
let entries = [];
if (!fs.existsSync(MANIFEST)) err('F1', '缺 Material/manifest.jsonl（总账）');
else {
  entries = fs.readFileSync(MANIFEST, 'utf8').split('\n').filter((l) => l.trim())
    .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}
const ledgerPaths = new Set();
for (const e of entries) {
  if (!e.path) { err('F1', `账本条目 ${e.id || '?'} 缺 path`); continue; }
  ledgerPaths.add(e.path.replace(/\\/g, '/'));
  if (!fs.existsSync(path.join(MATERIAL, e.path))) err('F1', `账本条目指向的文件不存在：${e.path}`);

  // F8 字段字典
  if (!e.topic) err('F8', `账本 ${e.id} 缺 topic`);
  if (!e.kind) err('F8', `账本 ${e.id} 缺 kind`);
  else if (!KIND(e.kind)) err('F8', `账本 ${e.id} 的 kind「${e.kind}」未在 kinds.json 注册`);
  if (!TIERS.includes(e.tier)) err('F8', `账本 ${e.id} 的 tier「${e.tier}」不在 ${TIERS.join('/')}`);
  if (!LICENSE_CLASSES.includes(e.license_class)) err('F8', `账本 ${e.id} 的 license_class「${e.license_class ?? '空'}」不在 ${LICENSE_CLASSES.join('/')}`);

  // F7 账本 path 与 topic/kind 必须同源（不许一个字段说 A、路径落在 B）
  const parts = String(e.path).replace(/\\/g, '/').split('/');
  if (parts.length === 3) {
    if (e.topic && parts[0] !== e.topic) err('F7', `账本 ${e.id} topic=「${e.topic}」但路径在「${parts[0]}/」`);
    if (e.kind && parts[1] !== e.kind) err('F7', `账本 ${e.id} kind=「${e.kind}」但路径在「${parts[1]}/」`);
  }
}

/* ---------- 题材目录 ---------- */
const topics = fs.readdirSync(MATERIAL, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !SKIP_DIRS.has(d.name) && !/^[._]/.test(d.name))
  .map((d) => d.name);

if (!topics.length) {
  console.log('Material/ 下没有题材目录（模板未启用或库为空）');
  process.exit(E.length ? 1 : 0);
}

const gitignore = fs.existsSync(path.join(ROOT, '.gitignore')) ? fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8') : '';

for (const topic of topics) {
  const tdir = path.join(MATERIAL, topic);
  if (!fs.existsSync(path.join(tdir, `${topic}.md`))) err('F2', `${topic}/ 缺题材索引 ${topic}.md`);

  const giLine = `Material/${topic}/*`;
  if (!gitignore.includes(giLine)) warn('W2', `.gitignore 缺「${giLine}」+「!${giLine.replace('/*', '/*.md')}」的入库排除`);

  // F6 源片（题材层，不再每个素材类各存一份母带）
  const srcKind = KIND('源片');
  const sdir = path.join(tdir, '源片');
  if (!fs.existsSync(sdir)) err('F6', `${topic}/ 缺 源片/（母带统一放题材层）`);
  else {
    const srcs = fs.readdirSync(sdir).filter((f) => /\.(mp4|mov|mkv|webm|wav|mp3|flac)$/i.test(f));
    if (!srcs.length) err('F6', `${topic}/源片/ 为空`);
    const re = new RegExp(srcKind?.sourcePattern || '^(BV[0-9A-Za-z]{10}|LOCAL\\d{8})_');
    for (const s of srcs) {
      if (!re.test(s)) err('F6', `${topic}/源片/${s} 命名不合规（应 <来源标识>_<短名>_<规格>，来源标识=BV号或 LOCAL+日期）`);
      if (!ledgerPaths.has(`${topic}/源片/${s}`)) err('F7', `${topic}/源片/${s} 未入账`);
    }
  }

  const kindsHere = fs.readdirSync(tdir, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== '源片').map((d) => d.name);

  for (const kind of kindsHere) {
    const kdir = path.join(tdir, kind);
    const files = fs.readdirSync(kdir).filter((f) => fs.statSync(path.join(kdir, f)).isFile());
    const tag = `${topic}/${kind}`;
    const k = KIND(kind);

    // F9 未注册
    if (!k) { err('F9', `${tag}/ 未注册（先在 Material/kinds.json 里声明 shape 与必备件）`); continue; }
    if (k.status === 'declared') warn('W3', `${tag}/ 已存在实体但注册表标 status=declared，核实后升 active`);
    if (k.shape === 'source') { err('F9', `${tag}/ 声明为 source，母带应放 ${topic}/源片/，不要单开目录`); continue; }

    const rootFiles = k.rootFiles || [];

    if (k.shape === 'units') {
      const perUnit = k.perUnit || ['mp4'];
      const main = `mp4`;
      const ids = files.filter((f) => f.endsWith(`.${main}`)).map((f) => { const m = f.match(/u(\d+)\./); return m ? +m[1] : null; }).filter(Boolean).sort((a, b) => a - b);
      if (!ids.length) { err('F3', `${tag}/ 下没有任何 uNN.${main}`); continue; }

      // 编号连续
      for (let i = 1; i <= ids.length; i++) {
        if (ids[i - 1] !== i) { err('F3', `${tag}/ 编号不连续：第 ${i} 个应为 u${String(i).padStart(2, '0')}，实为 u${String(ids[i - 1]).padStart(2, '0')}`); break; }
      }
      // 每单位套件
      for (const id of ids) {
        for (const ext of perUnit) {
          const want = `u${String(id).padStart(2, '0')}.${ext}`;
          if (!files.includes(want)) err('F3', `${tag}/${want} 缺失（perUnit 声明：${perUnit.join('/')}）`);
        }
      }
      // 根目录清单件
      for (const rf of rootFiles) if (!files.includes(rf)) err('F4', `${tag}/ 缺 ${rf}`);
      if (files.includes('catalog.csv')) {
        const rows = fs.readFileSync(path.join(kdir, 'catalog.csv'), 'utf8').replace(/^\ufeff/, '').split('\n').filter((l) => l.trim()).length - 1;
        if (rows !== ids.length) err('F4', `${tag}/ catalog.csv 行数 ${rows} ≠ 单位数 ${ids.length}`);
      }
      if (!files.includes('index.html')) err('F5', `${tag}/ 缺 index.html（核对页）`);

      // W1 母版规格
      if (k.masterSpec) {
        try {
          // 用 key=value 而不是 csv：ffprobe 的 csv 列序不受 -show_entries 顺序控制，容易错位
          const raw = execFileSync(FP, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate,pix_fmt', '-of', 'default=nw=1',
            path.join(kdir, `u${String(ids[0]).padStart(2, '0')}.${main}`)]).toString().trim();
          // 每行 trim：Windows 下 ffprobe 输出 CRLF，不去 \r 会让 w/pix 比较永远不相等（假告警）
          const kv = Object.fromEntries(raw.split('\n').map((l) => l.trim().split('=')).filter((x) => x.length === 2));
          const w = kv.width, h = kv.height, pix = kv.pix_fmt;
          const fr = (kv.r_frame_rate || '').replace(/\/1$/, ''); // 60/1 → 60，便于与声明比对
          const ms = k.masterSpec;
          const bad = (ms.width && w !== String(ms.width)) || (ms.height && h !== String(ms.height))
            || (ms.fps && !ms.fps.includes(fr)) || (ms.pixFmt && pix !== ms.pixFmt);
          if (bad) warn('W1', `${tag}/ 首条 ${w}x${h}@${fr} ${pix}（声明 ${ms.width}x${ms.height}@${ms.fps?.join('|')} ${ms.pixFmt}）`);
        } catch { warn('W1', `${tag}/ 首条 ffprobe 失败`); }
      }

      // F7 单位母版必须入账（附属件跟随母版，不单独入账）
      for (const id of ids) {
        const p = `${topic}/${kind}/u${String(id).padStart(2, '0')}.${main}`;
        if (!ledgerPaths.has(p)) err('F7', `${p} 未入账`);
      }

      if (!quiet) console.log(`· ${tag}/ ${ids.length} 单位 · ${files.length} 文件${k.status === 'declared' ? '（declared）' : ''}`);

    } else if (k.shape === 'files') {
      const re = new RegExp(k.namePattern || '.');
      const matched = files.filter((f) => re.test(f));
      if (!matched.length) { err('F3', `${tag}/ 没有任何文件匹配 ${k.namePattern}`); continue; }
      for (const rf of rootFiles) if (!files.includes(rf)) err('F4', `${tag}/ 缺 ${rf}`);
      for (const f of matched) {
        const p = `${topic}/${kind}/${f}`;
        if (!ledgerPaths.has(p)) err('F7', `${p} 未入账`);
      }
      const stray = files.filter((f) => !re.test(f) && !rootFiles.includes(f));
      if (stray.length) warn('W1', `${tag}/ 有 ${stray.length} 个文件不符 namePattern：${stray.slice(0, 3).join(', ')}`);
      if (!quiet) console.log(`· ${tag}/ ${matched.length} 文件（files 型）`);

    } else {
      err('F9', `${tag}/ 的 shape「${k.shape}」未知（只认 units / files / source）`);
    }
  }
}

/* ---------- 输出 ---------- */
if (asJson) {
  console.log(JSON.stringify({ at: new Date().toISOString(), topics: topics.length, entries: entries.length, errors: E, warnings: W }, null, 2));
} else {
  console.log(`\n素材库模板校验 v1 · ${new Date().toLocaleString('zh-CN', { hour12: false })}`);
  console.log(`题材 ${topics.length} 个 · 素材类 ${Object.keys(REG.kinds || {}).length} 类注册 · 账本 ${entries.length} 条`);
  if (E.length) { console.log(`\n错误 ${E.length} 条：`); E.forEach((x) => console.log(`  [${x.code}] ${x.msg}`)); }
  if (W.length) { console.log(`\n告警 ${W.length} 条：`); W.forEach((x) => console.log(`  [${x.code}] ${x.msg}`)); }
  if (!E.length && !W.length) console.log('✓ 全部合规');
}
process.exit(E.length ? 1 : 0);
