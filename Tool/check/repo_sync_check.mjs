#!/usr/bin/env node
/**
 * repo_sync_check.mjs — 循环三件套一致性检查（只读）
 *
 * 检查对象：Prototype\loopNN_xxx\ 目录 / 同名索引 / log.md#loopNN 条目 / Prototype.md 清单行
 * 依据：AGENTS.md §2.5「双链：目录与条目同刻创建」、§3.3「每目录一个同名索引」
 *
 * 用法：
 *   node Tool/check/repo_sync_check.mjs            人类可读报告，有问题时退出码 1
 *   node Tool/check/repo_sync_check.mjs --json     JSON 输出，便于脚本消费
 *   node Tool/check/repo_sync_check.mjs --strict   把「欠账」也算作失败（默认仅告警）
 *
 * 检查项：
 *   E1 清单行指向的 log.md#loopNN 锚点不存在（断链）
 *   E2 loop 目录缺同名索引（§3.3 违规）
 *   E3 目录存在但 Prototype.md 清单无此行
 *   E4 log.md 有条目但无对应目录（loop24 属已知特例，见 KNOWN_NO_DIR）
 *   E5 有产出但无记录：loop 目录存在、log.md 却无条目（loop32–38 的病症）
 *   W1 日志条目长期停在「进行中」（结轮未补全）
 *   W2 索引里没有回链 log.md#loopNN
 *   W3 git 最后实质改动晚于日志最后条目（可能有工作没写进日志）
 *   E6 导航单元缺同名索引（§3.3 全仓检查，History 暂不纳入）
 *   E7 目录里有第二份说明文件（README/REPORT/ARCHIVE 等未并入同名索引）
 *   W4 深层（≥3 级）仍有说明文件——按懒迁移统计，不判错
 */

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const ROOT = path.resolve(import.meta.dirname, '../..');
const LOG = path.join(ROOT, 'History', 'CircleLog', 'log.md');
const PROTO = path.join(ROOT, 'Prototype', 'Prototype.md');
const PROTO_DIR = path.join(ROOT, 'Prototype');

// 有日志条目、按设计不建目录的轮次
const KNOWN_NO_DIR = new Set([24]);

const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const strict = argv.includes('--strict');

const read = (p) => fs.readFileSync(p, 'utf8');
const exists = (p) => fs.existsSync(p);

const logText = read(LOG);
const protoText = read(PROTO);

// ---- 日志侧 ----
const anchors = new Set(
  [...logText.matchAll(/<a id="(loop\d+)"><\/a>/g)].map((m) => m[1]),
);
const logSections = [...logText.matchAll(/^## 小循环 (\d+)[a-z]? · (.*)$/gm)].map((m) => ({
  no: m[1],
  title: m[2].trim(),
}));
const logNos = new Set(logSections.map((s) => s.no));

// 条目是否仍为「进行中」
const pending = [];
for (const m of logText.matchAll(/<a id="(loop\d+)"><\/a>\n## [^\n]*\n([\s\S]*?)(?=\n<a id="|\n## |$)/g)) {
  const body = m[2];
  if (/\*\*进行中\*\*|进行中（未收工|待人工放行/.test(body)) pending.push(m[1]);
}

// ---- 清单侧 ----
const protoIdx = protoText.indexOf('## 增量清单');
const listBlock = protoIdx >= 0 ? protoText.slice(protoIdx) : '';
const rows = [...listBlock.matchAll(/^\|\s*(\d+)[a-z]?\s*\|([^\n]*)$/gm)].map((m) => {
  const no = m[1];
  const rest = m[2];
  const cells = rest.split('|').map((s) => s.trim());
  const link = /log\.md#(loop\d+)/.exec(rest);
  return { no, topic: cells[0] || '', anchor: link ? link[1] : null };
});

// ---- 目录侧 ----
const dirs = fs
  .readdirSync(PROTO_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && /^loop\d+/.test(d.name))
  .map((d) => d.name);
const dirNos = new Map(dirs.map((n) => [n.match(/^loop(\d+)/)[1], n]));

// ---- 判定 ----
const errors = [];
const warns = [];

// E1 断链
for (const r of rows) {
  if (r.anchor && !anchors.has(r.anchor)) {
    errors.push({ code: 'E1', msg: `清单 loop${r.no} 指向 log.md#${r.anchor}，但日志无此锚点` });
  }
}

// E2 缺索引（loop39 起 README.md 不再算索引：存量已合并，出现即 E7）
for (const [no, dir] of dirNos) {
  const base = path.join(PROTO_DIR, dir);
  const same = path.join(base, `${dir}.md`);
  if (!exists(same)) {
    errors.push({ code: 'E2', msg: `Prototype/${dir}/ 缺同名索引（应有 ${dir}.md）` });
  } else {
    const txt = read(same);
    const back = /CircleLog\/log\.md#loop\d+/.test(txt);
    if (!back) warns.push({ code: 'W2', msg: `Prototype/${dir}/ 索引缺回链（应含 ../History/CircleLog/log.md#loop${no}）` });
  }
}

// E3 目录无清单行
for (const [no, dir] of dirNos) {
  if (!rows.some((r) => r.no === no)) {
    errors.push({ code: 'E3', msg: `Prototype/${dir}/ 存在，但 Prototype.md 清单无 loop${no} 行` });
  }
}

// E4 有日志无目录
for (const no of logNos) {
  if (!dirNos.has(no) && !KNOWN_NO_DIR.has(Number(no))) {
    errors.push({ code: 'E4', msg: `log.md 有「小循环 ${no}」条目，但无对应 Prototype 目录` });
  }
}

// E5 有产出无记录：目录在、日志空 —— 这是 loop32–38 的真实病症
for (const [no, dir] of dirNos) {
  if (!logNos.has(no)) {
    errors.push({ code: 'E5', msg: `loop${no} 有 Prototype/${dir}/ 但 log.md 无条目（有产出、无记录）` });
  }
}

// W1 长期进行中
for (const id of pending) {
  warns.push({ code: 'W1', msg: `log.md#${id} 仍标「进行中」，未收工` });
}

// ---- 结构检查：§3.3 全仓范围（History 暂不纳入，按 §3.3 懒迁移）----
const STRUCT_ROOTS = ['Prototype', 'Tool', 'Skills', 'Material', 'Idea'];
const SKIP_DIRS = new Set(['node_modules', '.git', '.workbuddy', 'Workspace', 'History']);
const DEPTH_LIMIT = 2; // 1 = 顶层目录，2 = 二级目录；更深层只统计（W4）
const deepLeftovers = [];

const NAV_EXEMPT = new Set(['docs', '_template']); // 分册容器 / 骨架：不作为导航单元要求同名索引
const allowedExtra = (dirName, fileName) => {
  if (fileName === 'SKILL.md') return true; // §3.2 技能说明优先于同名规则
  if (dirName === 'Idea' && fileName === 'State.md') return true; // §3.3 唯一例外
  if (dirName === 'Material' && /^INDEX-.+\.md$/.test(fileName)) return true; // 账本的人读视图
  // Material/docs：按问题分册的容器（渐进式披露），分册本身就是索引，不再要求并成 docs.md
  if (dirName === 'docs') return true;
  // Material/_template：骨架（复制源，不是导航单元），只放模板文件
  if (dirName === '_template') return true;
  return false;
};

const extraMd = (dir, dirName) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && /\.md$/i.test(e.name) && e.name !== `${dirName}.md` && !allowedExtra(dirName, e.name))
    .map((e) => e.name);

// 目录树里有没有说明文件——没有就是纯数据容器（§3.3 豁免），不要求索引
const hasDocWithin = (dir, depth) => {
  let ents;
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  if (ents.some((e) => e.isFile() && /\.md$/i.test(e.name))) return true;
  if (depth <= 0) return false;
  return ents.some((e) => e.isDirectory() && !SKIP_DIRS.has(e.name) && hasDocWithin(path.join(dir, e.name), depth - 1));
};

const walk = (dir, rel, depth) => {
  const name = path.basename(dir);
  if (/(^|\/)seed(\/|$)/.test(rel)) return; // 导出包骨架：产物，不是本仓库导航
  const subs = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith('.'));
  const extra = extraMd(dir, name);
  if (depth <= DEPTH_LIMIT) {
    // docs/_template 不参与导航单元判定：前者由上级 Material.md 路由，后者是复制源
    const isNav = !NAV_EXEMPT.has(name) && (subs.length > 0 || extra.length > 0) && hasDocWithin(dir, 2);
    if (isNav && !exists(path.join(dir, `${name}.md`)) && !exists(path.join(dir, 'SKILL.md'))) {
      errors.push({ code: 'E6', msg: `${rel}/ 是导航单元但缺同名索引（应有 ${name}.md 或 SKILL.md）` });
    }
    for (const f of extra) {
      errors.push({ code: 'E7', msg: `${rel}/${f} 是第二份说明文件，应并入 ${name}.md` });
    }
  } else if (extra.length) {
    deepLeftovers.push({ dir: rel, files: extra });
  }
  for (const s of subs) walk(path.join(dir, s.name), `${rel}/${s.name}`, depth + 1);
};

for (const r of STRUCT_ROOTS) {
  const p = path.join(ROOT, r);
  if (exists(p)) walk(p, r, 1);
}
if (deepLeftovers.length) {
  const n = deepLeftovers.reduce((a, b) => a + b.files.length, 0);
  warns.push({
    code: 'W4',
    msg: `深层（≥3 级）还有 ${n} 份说明文件散落在 ${deepLeftovers.length} 个目录——按懒迁移处理，被触达时并入其上级索引`,
  });
}

// W3 时间线：git 有更晚的实质改动，但日志最后条目更早
let gitDate = null;
try {
  gitDate = execFileSync(
    'git',
    ['log', '-1', '--format=%ad', '--date=short', '--', 'Prototype', 'Tool', 'Skills', 'Material'],
    { cwd: ROOT, encoding: 'utf8' },
  ).trim();
} catch {
  // 无 git 或非仓库，跳过该项
}
// 工作区未提交项：按 AGENTS §1.4，提交只在人工发话时发生，未提交是常态；
// 此时 git 时间线无判别力，读数照报但不报警（日志仍是唯一凭证）
let dirtyCount = 0;
try {
  const out = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' });
  dirtyCount = out.split('\n').filter((l) => l.trim()).length;
} catch {
  // 忽略
}
// 只认条目自身的日期字段，不扫正文——正文里会出现 `validUntil 2026-11-14` 这类未来日期，会把判断带偏
const startDates = [...logText.matchAll(/^\|\s*开始时间\s*\|\s*(\d{4}-\d{2}-\d{2})/gm)].map((x) => x[1]);
const headDates = [...logText.matchAll(/^## [^\n]*?·\s*(\d{4}-\d{2}-\d{2})/gm)].map((x) => x[1]);
const logDate = startDates.at(-1) || headDates.at(-1) || null;
if (gitDate && logDate && gitDate > logDate) {
  warns.push({
    code: 'W3',
    msg: `git 最后实质改动 ${gitDate} 晚于日志最后条目 ${logDate}——可能有工作没写进 log.md`,
  });
}

// 清单标「缺」的条目（历史欠账，仅统计）
const missingLog = rows.filter((r) => !r.anchor).map((r) => r.no);

// ---- 输出 ----
const report = {
  scannedAt: (() => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  })(),
  counts: {
    logEntries: logSections.length,
    anchors: anchors.size,
    dirs: dirs.length,
    listRows: rows.length,
    errors: errors.length,
    warns: warns.length,
  },
  errors,
  warns,
  missingLog,
  struct: { scope: STRUCT_ROOTS, deepLeftovers },
  timeline: { gitLastChange: gitDate, logLastEntry: logDate, uncommitted: dirtyCount },
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`循环三件套检查 · ${report.scannedAt}`);
  console.log(
    `日志条目 ${report.counts.logEntries} · 锚点 ${report.counts.anchors} · 目录 ${report.counts.dirs} · 清单行 ${report.counts.listRows}`,
  );
  if (errors.length) {
    console.log('\n错误：');
    for (const e of errors) console.log(`  [${e.code}] ${e.msg}`);
  } else {
    console.log('\n错误：无');
  }
  if (warns.length) {
    console.log(`\n告警 ${warns.length} 条：`);
    for (const w of warns) console.log(`  [${w.code}] ${w.msg}`);
  } else {
    console.log('\n告警：无');
  }
  if (missingLog.length) {
    console.log(`\n清单标「缺」的轮次 ${missingLog.length} 个：${missingLog.map((n) => 'loop' + n).join(' ')}`);
  }
  if (dirtyCount) {
    console.log(
      `\n工作区未提交 ${dirtyCount} 项（§1.4：提交只在人工发话时发生）——W3 时间线在此期间无判别力，完整性以 log.md 为准`,
    );
  }
}

process.exit(errors.length || (strict && warns.length) ? 1 : 0);
