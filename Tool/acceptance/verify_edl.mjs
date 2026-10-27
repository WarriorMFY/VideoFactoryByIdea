#!/usr/bin/env node
/**
 * verify_edl.mjs — 用已知真值客观验收剪辑决策（不是目检、不是口头判断）
 *
 * 用法：node Tool/verify_edl.mjs <edits.json> <ground_truth.json> [--json out.json]
 * 指标：
 *   - dropped/kept 区间与真值的 IoU、precision、recall
 *   - 过切(FP, 不该切却切了) / 漏切(FN, 该切却没切) 的秒数
 *   - 每个真值分段的"存活率"（keep 段应≈1，drop 段应≈0）
 *   - 边界误差（真值边界与检测边界之差）
 * 判定阈值（可通过 --iou/--tol 改）：IoU≥0.90、过切≤0.6s、漏切≤0.6s、分段存活率达标、边界≤0.6s
 */
import fs from 'node:fs';

const args = process.argv.slice(2);
const [edlPath, gtPath] = args;
if (!edlPath || !gtPath) { console.error('用法: node Tool/verify_edl.mjs <edits.json> <ground_truth.json>'); process.exit(2); }
const opt = { iou: 0.9, tol: 0.6, segTol: 0.05 };
for (let i = 2; i < args.length; i++) {
  if (args[i] === '--iou') opt.iou = Number(args[++i]);
  else if (args[i] === '--tol') opt.tol = Number(args[++i]);
  else if (args[i] === '--json') opt.json = args[++i];
}

const edl = JSON.parse(fs.readFileSync(edlPath, 'utf8'));
const gt = JSON.parse(fs.readFileSync(gtPath, 'utf8'));

const len = (a) => a.reduce((s, x) => s + (x.end - x.start), 0);
const inter = (a, b) => {
  let s = 0;
  for (const x of a) for (const y of b) s += Math.max(0, Math.min(x.end, y.end) - Math.max(x.start, y.start));
  return s;
};

const gtDrop = gt.dropped.map(([s, e]) => ({ start: s, end: e }));
const gtKeep = gt.kept.map(([s, e]) => ({ start: s, end: e }));
const actDrop = edl.cut.map((c) => ({ start: c.start, end: c.end }));
const actKeep = edl.kept.map((k) => ({ start: k.start, end: k.end }));

const tp = inter(gtDrop, actDrop);
const fp = Math.max(0, len(actDrop) - tp);   // 过切
const fn = Math.max(0, len(gtDrop) - tp);    // 漏切
const iou = tp / Math.max(1e-9, len(gtDrop) + len(actDrop) - tp);
const precision = tp / Math.max(1e-9, len(actDrop));
const recall = tp / Math.max(1e-9, len(gtDrop));

// 每个真值分段的存活率
const sections = (gt.sections || []).map((s) => {
  const span = { start: s.start, end: s.end };
  const keptInside = inter([span], actKeep);
  const survive = keptInside / Math.max(1e-9, s.end - s.start);
  const ok = s.expect === 'keep' ? survive >= 1 - opt.segTol : survive <= opt.segTol;
  return { id: s.id, start: s.start, end: s.end, expect: s.expect, survive: Number(survive.toFixed(3)), ok, why: s.why };
});

// 边界误差：先把两侧的切除段各自合并成"并集"，再比较并集边界到对方并集边界的最近距离。
// 为什么：真值里相邻的两个 drop 段被算法合法地合并成一段（如 [14,20]+[20,24] -> [14,24]），
// 按单段边界比对会把中间那个"内部边界"误当成错误，这是指标缺陷而非剪辑错误。
const union = (list) => {
  const s = [...list].sort((a, b) => a.start - b.start);
  const out = [];
  for (const it of s) {
    const last = out[out.length - 1];
    if (last && it.start <= last.end + 1e-6) last.end = Math.max(last.end, it.end);
    else out.push({ ...it });
  }
  return out;
};
const gtU = union(gtDrop), actU = union(actDrop);
const edgesOf = (u) => u.flatMap((x) => [x.start, x.end]);
const nearest = (arr, t) => (arr.length ? arr.map((x) => Math.abs(x - t)).sort((a, b) => a - b)[0] : null);
const boundaries = [];
for (const t of edgesOf(gtU)) boundaries.push({ side: 'gt', gt: t, err: nearest(edgesOf(actU), t) });
for (const t of edgesOf(actU)) boundaries.push({ side: 'actual', actual: t, err: nearest(edgesOf(gtU), t) });
for (const b of boundaries) b.err = b.err === null ? null : Number(Number(b.err).toFixed(3));
const maxBoundErr = boundaries.reduce((m, b) => Math.max(m, b.err ?? 999), 0);

const pass = {
  iou: iou >= opt.iou,
  overcut: fp <= opt.tol,
  undercut: fn <= opt.tol,
  sections: sections.every((s) => s.ok),
  boundary: maxBoundErr <= opt.tol,
};
const verdict = Object.values(pass).every(Boolean) ? 'PASS' : 'FAIL';

const result = {
  verdict,
  criteria: { iou_min: opt.iou, max_overcut_s: opt.tol, max_undercut_s: opt.tol, seg_survive_tol: opt.segTol, boundary_tol: opt.tol },
  measured: {
    gt_dropped_s: Number(len(gtDrop).toFixed(3)), actual_dropped_s: Number(len(actDrop).toFixed(3)),
    tp_s: Number(tp.toFixed(3)), overcut_s: Number(fp.toFixed(3)), undercut_s: Number(fn.toFixed(3)),
    iou: Number(iou.toFixed(3)), precision: Number(precision.toFixed(3)), recall: Number(recall.toFixed(3)),
    max_boundary_err_s: maxBoundErr,
    gt_kept_s: Number(len(gtKeep).toFixed(3)), actual_kept_s: Number(len(actKeep).toFixed(3)),
  },
  pass, sections, boundaries,
  source: { edl: edlPath, gt: gtPath, output_file: edl.output?.file, output_duration: edl.output?.duration },
};
if (opt.json) fs.writeFileSync(opt.json, JSON.stringify(result, null, 2));

console.log(`\n=== 验收: ${verdict} ===`);
console.log(`真值应切 ${result.measured.gt_dropped_s}s / 实际切 ${result.measured.actual_dropped_s}s`);
console.log(`命中 ${result.measured.tp_s}s  过切 ${result.measured.overcut_s}s  漏切 ${result.measured.undercut_s}s`);
console.log(`IoU ${result.measured.iou}  precision ${result.measured.precision}  recall ${result.measured.recall}`);
console.log(`最大边界误差 ${result.measured.max_boundary_err_s}s`);
console.log(`\n分段存活率:`);
for (const s of sections) console.log(`  ${s.id} [${s.start}-${s.end}] 期望=${s.expect} 存活=${(s.survive * 100).toFixed(1)}% ${s.ok ? 'OK' : '✗'}  (${s.why})`);
console.log(`\n判定: ${Object.entries(pass).map(([k, v]) => `${k}=${v ? 'ok' : '✗'}`).join(' ')}`);
process.exit(verdict === 'PASS' ? 0 : 1);
