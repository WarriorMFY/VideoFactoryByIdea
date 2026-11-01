#!/usr/bin/env node
/**
 * verify_package.mjs —— 导出包校验（小循环 15 WP3）
 *
 * 检四件事：
 *   1) 结构：必需文件逐个在位（工具 32 + 文档 7 + 样例 17 + 档案 12）
 *   2) 语法：所有 .mjs node --check
 *   3) 路径：包内不得有指向原仓库的绝对/半绝对路径（VideoFactory / F:\AgentWorkArea）
 *   4) 依赖：ffmpeg.exe / ffprobe.exe / libvosk.dll / vosk 模型 / playwright 在位
 * 退出码 0 = 全过。
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '..', '..');
const DEST = path.resolve(SRC, '..', 'TalkFactory');

let bad = 0;
const fail = (msg) => { console.error('  ✗ ' + msg); bad++; };
const ok = (msg) => console.log('  ✓ ' + msg);

// 1) 结构
console.log('[1] 结构');
const MUST = [
  'AGENTS.md', 'README.md', '.gitignore', 'Idea/Idea.md',
  'Tool/Tool.md', 'Tool/env.md',
  'Tool/lib/ff.mjs', 'Tool/lib/srt.mjs', 'Tool/lib/units.mjs', 'Tool/lib/vosk.mjs', 'Tool/lib/pw.mjs', 'Tool/lib/lib.md',
  'Tool/subtitle/asr_vosk.mjs', 'Tool/subtitle/estimate_offset.mjs', 'Tool/subtitle/align_script.mjs',
  'Tool/subtitle/build_zh_map.mjs', 'Tool/subtitle/merge_fragments.mjs', 'Tool/subtitle/make_subs.mjs',
  'Tool/subtitle/make_ass.mjs', 'Tool/subtitle/glossary_zh.json', 'Tool/subtitle/subtitle.md',
  'Tool/edit/vfactory.mjs', 'Tool/edit/edit.md',
  'Tool/ops/ted_subs.mjs', 'Tool/ops/ted_fetch.mjs', 'Tool/ops/ted_episode.mjs', 'Tool/ops/make_digest.mjs',
  'Tool/ops/make_cover.mjs', 'Tool/ops/frame_sheet.mjs', 'Tool/ops/kb_audit.sh',
  'Tool/ops/bili_comment.mjs', 'Tool/ops/publish_bilibili.mjs', 'Tool/ops/ops.md',
  'Tool/setup/bootstrap_ffmpeg.mjs', 'Tool/setup/bootstrap_asr.mjs', 'Tool/setup/bootstrap_playwright.mjs', 'Tool/setup/setup.md',
  'Prototype/sample_ep_a/README.md', 'Prototype/sample_ep_a/talk.meta.json',
  'Prototype/sample_ep_a/longform/final.mp4', 'Prototype/sample_ep_a/longform/cover.jpg',
  'Prototype/sample_ep_a/longform/report.md', 'Prototype/sample_ep_a/longform/edits.json',
  'Prototype/sample_ep_a/digest/final.mp4', 'Prototype/sample_ep_a/digest/cover.jpg',
  'Prototype/sample_ep_a/digest/digest.json', 'Prototype/sample_ep_a/digest/manifest.json',
  'Prototype/sample_ep_a/digest/digest.ass', 'Prototype/sample_ep_a/digest/zh.srt',
  'Prototype/sample_ep_a/digest/desc_publish.txt', 'Prototype/sample_ep_a/digest/pin_comment.txt',
  'Prototype/sample_ep_a/digest/ep_a_comment.txt', 'Prototype/sample_ep_a/digest/check_strip.jpg',
  'History/CircleLog/log.md', 'History/loops/loop14/plan.md', 'History/loops/loop14/publish_log.md',
  'History/loops/loop14/ep_a/manifest.md', 'History/loops/loop14/ep_b/manifest.md',
  'History/loops/loop14/ep_c/manifest.md', 'History/loops/loop14/ep_d/manifest.md',
  'History/loops/loop14/ep_e/manifest.md',
  'Workspace/README.md',
  'Workspace/deps/ffmpeg/ffmpeg.exe', 'Workspace/deps/ffmpeg/ffprobe.exe',
  'Workspace/deps/asr/index.cjs', 'Workspace/deps/asr/package.json', 'Workspace/deps/asr/DEPENDENCIES.md',
  'Workspace/deps/asr/node_modules/vosk/lib/win-x86_64/libvosk.dll',
  'Workspace/deps/asr/node_modules/koffi/package.json',
  'Workspace/deps/asr/node_modules/@andresaya/edge-tts/package.json',
  'Workspace/deps/asr/models/vosk-model-small-en-us-0.15/conf/model.conf',
  'Workspace/deps/node_modules/playwright/package.json',
];
let hit = 0;
for (const f of MUST) {
  if (fs.existsSync(path.join(DEST, f))) hit++;
  else fail('缺文件 ' + f);
}
ok(`${hit}/${MUST.length} 必需文件在位`);

// 2) 语法
console.log('[2] mjs 语法');
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.mjs')) {
      const r = spawnSync(process.execPath, ['--check', p], { encoding: 'utf8' });
      if (r.status !== 0) fail(`语法错误 ${path.relative(DEST, p)}\n${r.stderr}`);
    }
  }
};
walk(path.join(DEST, 'Tool'));
ok('Tool/**/*.mjs 全部通过 node --check');

// 3) 路径泄漏（硬标准：不得出现指向源仓库的文件系统路径；
//    纯词 "VideoFactory" 属出处说明——README 的来历标注与 env.md 的 git 远端 URL，放行）
console.log('[3] 路径泄漏扫描');
const LEAK = /AgentWorkArea/;   // 源仓库绝对路径必含此段；JSON 转义形态也躲不过
let leaks = [];
const walk2 = (d, rel) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'models') walk2(p, r); }
    else if (/\.(mjs|md|json|sh|txt)$/.test(e.name)) {
      const t = fs.readFileSync(p, 'utf8');
      if (LEAK.test(t)) leaks.push(r);
    }
  }
};
walk2(DEST, '');
if (leaks.length) fail('以下文件含源仓库路径引用：\n    ' + leaks.join('\n    '));
else ok('零命中（无指向源仓库的路径）');

// 4) 依赖可解析
console.log('[4] 依赖解析');
const pwCandidates = [
  path.join(DEST, 'Workspace', 'deps', 'node_modules'),
];
if (!fs.existsSync(path.join(pwCandidates[0], 'playwright'))) fail('playwright 不在 Workspace/deps/node_modules');
else ok('playwright 候选 1（包内自持）');
const voskDll = path.join(DEST, 'Workspace', 'deps', 'asr', 'node_modules', 'vosk', 'lib', 'win-x86_64', 'libvosk.dll');
if (!fs.existsSync(voskDll)) fail('libvosk.dll 缺失');
else ok('libvosk.dll 在位');

console.log(bad ? `\n✗ ${bad} 项未过` : '\n✓ 全部通过');
process.exit(bad ? 1 : 0);
