// build_sets.mjs — loop42 三组速度语法合集构建（组 A/B/C × 单位 u02/u01/u13）
// 流程：生成 recam 配方 → 逐条渲染 → concat demuxer 拼合集
// 用法: node build_sets.mjs [A|B|C]   不给参数则三组全跑
// 层角色映射：open/buildup/hit/tail —— 单位层数不同，速度按角色取，不按索引取
//   （首版按索引取，u02 无 buildup 层，导致其 tail 被错配 0.3x 升格 3.87s，已修）
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const RECAM = join(ROOT, 'Tool/ops/recam.mjs');
const FF = join(ROOT, 'Workspace/deps/ffmpeg/ffmpeg.exe');
const SRC = join(ROOT, 'Material/library/video/e7e889f4_yzl-exec-60.mp4');
const CFG = join(HERE, 'sets/cfg');
const OUT = join(HERE, 'sets/out');
mkdirSync(CFG, { recursive: true });
mkdirSync(OUT, { recursive: true });
const j = s => (String(s).includes(' ') ? JSON.stringify(s) : s);
const run = cmd => execSync(cmd, { stdio: ['ignore', 'ignore', 'inherit'] });

// 三个单位：层 = [角色, 段内起, 段内止]；切点由 loop42 probe 实测
const UNITS = {
  u01: { in: 0.08, dur: 3.65, crop: { win: [1280, 720], from: [320, 240] },
         layers: [['open', 0, 1.70], ['buildup', 1.70, 2.52], ['hit', 2.52, 2.80], ['tail', 2.80, 3.65]] },
  u02: { in: 3.85, dur: 2.28, crop: { win: [1280, 720], from: [320, 200] },
         layers: [['open', 0, 0.85], ['hit', 0.85, 1.12], ['tail', 1.12, 2.28]] },
  u13: { in: 36.58, dur: 5.81, crop: { win: [1536, 864], from: [192, 108] },
         layers: [['open', 0, 0.40], ['buildup', 0.40, 2.70], ['hit', 2.70, 3.22], ['tail', 3.22, 5.81]] },
};
// 三组：按角色给速度；组 B 的命中层加推近+拖影
const GROUPS = {
  A: { name: '克制', speed: { open: 1.0, buildup: 1.0, hit: 0.5, tail: 1.5 }, hitCam: false },
  B: { name: '重击', speed: { open: 1.0, buildup: 0.65, hit: 0.3, tail: 1.8 }, hitCam: true, blur: 3,
       hitEnd: { u01: 2.76 } },   // u01 命中层收至切点前，避开「特写框里的全景」混帧
  C: { name: '抽时', speed: { open: 1.2, buildup: 1.0, hit: 0.6, tail: 2.5 }, hitCam: false },
};
const ORDER = ['u02', 'u01', 'u13'];          // 快杀 → 标准 → 仪式级
const pick = process.argv[2];
const report = [];

for (const [g, G] of Object.entries(GROUPS)) {
  if (pick && pick !== g) continue;
  const segs = [];
  for (const u of ORDER) {
    const U = UNITS[u];
    const shots = U.layers.map(([role, t0, t1]) => {
      const end = role === 'hit' && G.hitEnd?.[u] != null ? G.hitEnd[u] : t1;
      const shot = { t: [t0, end], speed: G.speed[role], cam: { type: 'full' } };
      if (role === 'hit' && G.hitCam) {
        shot.blur = G.blur;
        shot.cam = { type: 'crop', win: U.crop.win, from: U.crop.from };
      }
      return shot;
    });
    const cfgPath = join(CFG, `${g}_${u}.json`);
    writeFileSync(cfgPath, JSON.stringify(
      { source: { in: U.in, dur: U.dur }, out: { w: 1920, h: 1080, fps: 60, crf: 19 }, shots }, null, 2));
    const segPath = join(OUT, `${g}_${u}.mp4`);
    run(`node ${j(RECAM)} ${j(SRC)} ${j(cfgPath)} ${j(segPath)}`);
    segs.push(segPath);
  }
  const listPath = join(OUT, `concat_${g}.txt`);
  writeFileSync(listPath, segs.map(s => `file '${s.replace(/\\/g, '/')}'`).join('\n'));
  const collPath = join(HERE, `set${g}_${G.name}.mp4`);
  run(`${j(FF)} -y -loglevel error -f concat -safe 0 -i ${j(listPath)} -c copy ${j(collPath)}`);
  report.push(`合集 ${g}（${G.name}）: ${collPath}`);
}
console.log(report.join('\n'));
