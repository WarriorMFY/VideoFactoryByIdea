/**
 * lib/srt.mjs — SRT 写出（单一实现，避免"生成端"和"回写端"格式不一致）
 *
 * 为什么单独抽：小循环 8 的"校对回写"要能**重新生成**一份和机器生成完全同格式的 SRT，
 * 否则人工比对时会看到莫名其妙的差异（空行/时间码精度/行序），误以为内容变了。
 */
import fs from 'node:fs';
import path from 'node:path';

/** 秒 → `HH:MM:SS,mmm` */
export function ts(sec) {
  const ms = Math.round(Number(sec) * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const r = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(r).padStart(3, '0')}`;
}

/** `${HH:MM:SS,mmm}` → 秒（宽容：`,`/`.`、缺小时都能吃） */
export function parseTs(s) {
  const m = String(s || '').trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})[,.](\d{1,3})$/);
  if (!m) return null;
  const [, h, mi, se, ms] = m;
  return Number(h || 0) * 3600 + Number(mi) * 60 + Number(se) + Number(ms.padEnd(3, '0')) / 1000;
}

/**
 * cues → SRT 文本
 * @param {Array} list cues（{start,end,en,zh}）
 * @param {(c: any) => string[]} pick 每行取哪些文本（zh/en/both）
 */
export function toSrt(list, pick) {
  return list
    .map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${pick(c).filter(Boolean).join('\n')}\n`)
    .join('\n');
}

/** 一次写出 en/zh/bilingual 三份（与 make_subs 的输出约定一致） */
export function writeSrtSet(cues, dir, { mt = 'mymemory' } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const files = { en: path.join(dir, 'en.srt'), zh: path.join(dir, 'zh.srt'), bilingual: path.join(dir, 'bilingual.srt') };
  fs.writeFileSync(files.en, toSrt(cues, (c) => [c.en]));
  if (mt !== 'none') {
    fs.writeFileSync(files.zh, toSrt(cues, (c) => [c.zh]));
    fs.writeFileSync(files.bilingual, toSrt(cues, (c) => [c.zh, c.en]));
  }
  return files;
}
