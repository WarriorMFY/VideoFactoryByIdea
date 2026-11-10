/**
 * license.mjs — 授权分类（素材库「能不能发」的唯一机器判据）
 *
 * 单一真源：`collect_material.mjs`（网采）与 `exec_extract.mjs`（抽帧入账）都调这里，
 * 不许各自硬写 license / tier。字段含义与枚举见 `Material/docs/授权与可发布.md`、
 * `Material/docs/字段字典.md`。
 *
 * 两条正交的轴，别混：
 *   - tier        = 采集**代价**（L0 库内复用 / L1 开放授权 / L2 待核 / L3 AI），回答"这次采它花了多少"；
 *   - license_class = 授权**类别**，回答"这条能不能用于发布"（publishable 为 true 才放行）。
 * 历史坑：exec_extract 曾把 tier 硬写成 L0（"库内复用"），而素材实际是外部版权片 → 语义打架。
 */

/** 枚举（不在此列的 class 视为脏值，material_layout 报 F8） */
export const LICENSE_CLASSES = ['PD/CC0', 'CC BY', 'CC BY-SA', 'REVIEW', 'UNKNOWN'];

/** 可商用可发布的类别；REVIEW（NC/ND/fair use/版权归原作者）与 UNKNOWN 一律不可直接发布 */
export const PUBLISHABLE_CLASSES = ['PD/CC0', 'CC BY'];

const RULES = [
  [/public domain|publicdomain|cc0|cc 0|pdm|\bpd\b/, 'PD/CC0'],
  [/^cc[ -]by$|cc by [1-4]|attribution[ ]*[1-4]/, 'CC BY'],
  // SA 有传染性：能发，但成片也须同许可，保守留在 L2 待人工确认
  [/^cc[ -]by[ -]sa|cc by-sa|share[ -]alike/, 'CC BY-SA'],
  [/nc|nd|non-free|fair use|©|copyright|归原作者|研究|引用/, 'REVIEW'],
];

/**
 * @param {string} s 授权原文（人写的自由文本也可，靠关键词归类）
 * @returns {{cls:string, tier:'L1'|'L2'}} cls 属 LICENSE_CLASSES，tier 只影响"进正式库还是待核"
 */
export function classifyLicense(s) {
  const t = String(s || '').toLowerCase();
  for (const [re, cls] of RULES) {
    if (re.test(t)) return { cls, tier: cls === 'PD/CC0' || cls === 'CC BY' ? 'L1' : 'L2' };
  }
  if (!t) return { cls: 'UNKNOWN', tier: 'L2' };
  // 词典外的写法保留原文（截断防脏数据），一律按待核处理
  return { cls: t.toUpperCase().slice(0, 24), tier: 'L2' };
}

/** 发布门槛：只有这个为 true 的素材才允许进成片 */
export function publishable(cls) {
  return PUBLISHABLE_CLASSES.includes(cls);
}
