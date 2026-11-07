#!/usr/bin/env node
/**
 * build_package.mjs —— 组装 TalkFactory 导出包（小循环 15）
 *
 * 用法：
 *   node Prototype/loop15_export/build_package.mjs            # 增量构建（已存在则报错）
 *   node Prototype/loop15_export/build_package.mjs --clean    # 清掉重建
 *
 * 落点：<仓库同级>/TalkFactory/  （F:/AgentWorkArea/WorkBuddy/TalkFactory）
 *
 * 内容 = seed/（新写文档，原样搬） + 工具链 32 文件 + loop14 档案 + EP-A 完整样例
 *        + deps（ffmpeg 158MB / asr+模型 154MB / playwright 19MB）—— 离线即跑。
 * 幂等：重复执行会跳过已存在且同大小的文件；--clean 先清空 DEST。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '..', '..');                     // VideoFactory 仓库根
const DEST = path.resolve(SRC, '..', 'TalkFactory');            // 与仓库同级
const HOST_PW = path.join(process.env.USERPROFILE || '', '.workbuddy', 'binaries', 'node', 'workspace', 'node_modules');
const CLEAN = process.argv.includes('--clean');

if (CLEAN && fs.existsSync(DEST)) fs.rmSync(DEST, { recursive: true, force: true });
if (fs.existsSync(DEST)) { console.error(`目标已存在：${DEST}\n确认重建请加 --clean`); process.exit(2); }

let nFiles = 0, nBytes = 0;
const copyFile = (src, dstRel) => {
  const dst = path.join(DEST, dstRel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  nFiles++; nBytes += fs.statSync(src).size;
};
const copyDir = (src, dstRel) => {
  if (!fs.existsSync(src)) { console.warn(`[warn] 缺少 ${src}（跳过）`); return; }
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    if (e.isDirectory()) copyDir(s, path.join(dstRel, e.name));
    else copyFile(s, path.join(dstRel, e.name));
  }
};

// ---------- ① seed：新写文档（包根 README / Idea / Tool.md / CircleLog / 样例 README / .gitignore） ----------
copyDir(path.join(HERE, 'seed'), '');

// ---------- ② 根：AGENTS.md 原样搬 ----------
copyFile(path.join(SRC, 'AGENTS.md'), 'AGENTS.md');

// ---------- ③ Tool：链路精简版（32 文件） ----------
const TOOL_FILES = [
  'Tool/env/env.md',
  // lib
  'Tool/lib/ff.mjs', 'Tool/lib/srt.mjs', 'Tool/lib/units.mjs', 'Tool/lib/vosk.mjs', 'Tool/lib/pw.mjs', 'Tool/lib/lib.md',
  // subtitle
  'Tool/subtitle/asr_vosk.mjs', 'Tool/subtitle/estimate_offset.mjs', 'Tool/subtitle/align_script.mjs',
  'Tool/subtitle/build_zh_map.mjs', 'Tool/subtitle/merge_fragments.mjs', 'Tool/subtitle/make_subs.mjs',
  'Tool/subtitle/make_ass.mjs', 'Tool/subtitle/glossary_zh.json', 'Tool/subtitle/subtitle.md',
  // edit
  'Tool/edit/vfactory.mjs', 'Tool/edit/edit.md',
  // ops
  'Tool/ops/ted_subs.mjs', 'Tool/ops/ted_fetch.mjs', 'Tool/ops/ted_episode.mjs', 'Tool/ops/make_digest.mjs',
  'Tool/ops/make_cover.mjs', 'Tool/ops/frame_sheet.mjs', 'Tool/ops/kb_audit.sh',
  'Tool/ops/bili_comment.mjs', 'Tool/ops/publish_bilibili.mjs', 'Tool/ops/ops.md',
  // setup
  'Tool/setup/bootstrap_ffmpeg.mjs', 'Tool/setup/bootstrap_asr.mjs', 'Tool/setup/bootstrap_playwright.mjs', 'Tool/setup/setup.md',
];
for (const f of TOOL_FILES) {
  const s = path.join(SRC, f);
  if (!fs.existsSync(s)) { console.error(`缺少必需文件：${f}`); process.exit(1); }
  copyFile(s, f);
}

// ---------- ④ History：loop14 全档案（能力来源） ----------
copyDir(path.join(SRC, 'History', 'loops', 'loop14'), 'History/loops/loop14');

// ---------- ⑤ Prototype：EP-A 完整样例（含两条成片） ----------
// 机器产物里记着源仓库绝对路径（vfactory 会把 source 写成绝对路径），入包前统一改写成包内相对路径
const rewriteAbs = (dstRel) => {
  const p = path.join(DEST, dstRel);
  let t = fs.readFileSync(p, 'utf8');
  const esc = SRC.replaceAll('\\', '\\\\');            // JSON 串里的 C:\\... 形态
  for (const pre of [esc, SRC.replaceAll('\\', '/'), SRC]) t = t.replaceAll(pre, '');
  fs.writeFileSync(p, t);
};
copyFile(path.join(SRC, 'Prototype/loop14_talk/ep_a/final.mp4'), 'Prototype/sample_ep_a/longform/final.mp4');
for (const f of ['cover.jpg', 'report.md', 'edits.json', 'signals.json', 'runlog.jsonl', 'probe.json'])
  copyFile(path.join(SRC, 'Prototype/loop14_talk/ep_a', f), 'Prototype/sample_ep_a/longform/' + f);
for (const f of ['edits.json', 'probe.json', 'signals.json', 'runlog.jsonl']) rewriteAbs('Prototype/sample_ep_a/longform/' + f);
copyFile(path.join(SRC, 'Prototype/loop14_talk/ep_a_digest/final.mp4'), 'Prototype/sample_ep_a/digest/final.mp4');
for (const f of ['cover.jpg', 'digest.json', 'manifest.json', 'digest.ass', 'zh.srt',
  'desc_publish.txt', 'pin_comment.txt', 'ep_a_comment.txt', 'check_strip.jpg'])
  copyFile(path.join(SRC, 'Prototype/loop14_talk/ep_a_digest', f), 'Prototype/sample_ep_a/digest/' + f);

// ---------- ⑥ Workspace：README + deps（离线即跑） + 空目录 ----------
copyFile(path.join(SRC, 'Workspace/README.md'), 'Workspace/README.md');
copyDir(path.join(SRC, 'Workspace/deps/ffmpeg'), 'Workspace/deps/ffmpeg');
copyDir(path.join(SRC, 'Workspace/deps/asr'), 'Workspace/deps/asr');
// playwright 当前解析自宿主目录（pw.mjs 候选 2）；复制成候选 1，包内自持
copyDir(HOST_PW, 'Workspace/deps/node_modules');
for (const d of ['Workspace/cache', 'Workspace/run', 'Workspace/tmp', 'History/runs/_logs'])
  fs.mkdirSync(path.join(DEST, d), { recursive: true });

const mb = (nBytes / 1048576).toFixed(1);
console.log(`✓ ${DEST}`);
console.log(`  ${nFiles} 个文件，${mb} MB（不含空目录）`);
console.log(`  结构：AGENTS.md + Idea + Tool(32) + Prototype/sample_ep_a + History/loops/loop14 + Workspace(deps 随包)`);
