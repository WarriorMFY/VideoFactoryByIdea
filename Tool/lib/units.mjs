/**
 * lib/units.mjs — 数字与单位的规范化（技能型内容的关键一步）
 *
 * 为什么需要：ASR 把"数值 + 单位"念成一串词，机翻再逐字翻，结果就是
 *   `minus sixty sixteen l u fs` → "减去六十个十六卢夫斯"（小循环 6 实测）
 *   `fifteen megabits per second` → "每秒十五兆比特"
 * 而知识型视频里，**数值和单位本身就是信息主体**（−16 LUFS、15 Mbps、4K60、fps），
 * 翻错了不是"不够雅"，是"说错了"。所以在**送翻译之前**把源句规范化成书写形式，
 * 再在翻译之后把中文侧的写法统一回来。
 *
 * 设计原则：
 *   1. **只在"单位语境"里把数词变数字**：`three simple tricks` 保持 `three`（中文说"三个"更自然），
 *      而 `sixteen LUFS` / `fifteen megabits` / `sixty frames` 才数字化；
 *   2. 每次替换都留痕（`changes[]`），供人复核 —— 启发式必须可审计；
 *   3. 只做**可枚举**的规则（LUFS/dB/Mbps/fps/分辨率/像素），不做通用数字转写（那会误伤 "two hours"）。
 */

const NUM_WORDS = {
  zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100,
};
const NUM_RE = new RegExp(`\\b(?:${Object.keys(NUM_WORDS).join('|')})(?:[\\s-](?:${Object.keys(NUM_WORDS).join('|')}))*\\b`, 'gi');

/** "twenty one" → 21；"sixty sixteen" → 61?? 处理不了就返回 null（宁可不动） */
export function parseNumberWords(phrase) {
  const words = String(phrase).toLowerCase().split(/[\s-]+/).filter(Boolean);
  if (!words.length) return null;
  let total = 0;
  let cur = 0;
  for (const w of words) {
    const v = NUM_WORDS[w];
    if (v === undefined) return null;
    if (v === 100) {
      cur = (cur || 1) * 100;
      total += cur;
      cur = 0;
    } else if (v < 10) cur = cur * 10 + v;   // 处理 "twenty one"
    else cur += v;
  }
  return total + cur;
}

/**
 * 源句规范化：把"念出来的数值+单位"写成标准写法。
 * @param {string} text
 * @param {Record<string,string>} sourceFixes 术语表 `_source_fixes`（先应用，如 `l u fs` → `LUFS`）
 * @returns {{text: string, changes: Array<{from: string, to: string, rule: string}>}}
 */
export function normalizeSourceText(text, sourceFixes = {}) {
  let out = String(text || '');
  const changes = [];
  const fix = (re, repl, rule) => {
    out = out.replace(re, (...m) => {
      const next = typeof repl === 'function' ? repl(...m) : repl;
      if (next && next !== m[0]) changes.push({ from: m[0], to: next, rule });
      return next ?? m[0];
    });
  };

  // 0) 术语表里的源端纠错（ASR 把单位/专名拆坏）
  // 必须**一次性替换**（单正则交替、按长度降序）：逐条 replace 会二次命中刚替换出来的文本 ——
  // 实测 `l u fs` → `LUFS` 之后，规则 `luf` → `LUFS` 又把 `LUFS` 的前缀换成 `LUFS`，得到 `LUFSS`。
  {
    const keys = Object.keys(sourceFixes || {})
      .filter((k) => k && !k.startsWith('_'))
      .sort((a, b) => b.length - a.length);
    if (keys.length) {
      const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(keys.map(esc).join('|'), 'gi');
      out = out.replace(re, (m) => {
        const hit = keys.find((k) => k.toLowerCase() === m.toLowerCase());
        const to = hit ? sourceFixes[hit] : m;
        if (to !== m) changes.push({ from: m, to, rule: 'source_fixes' });
        return to;
      });
    }
  }

  const NUM_SRC = NUM_RE.source.replace(/^\\b|\\b$/g, '');

  // 1a) 先把"念出来的多余数词 + 已经是数字的数值 + 单位"清理掉：
  //     `minus sixty 16 LUFS`（术语表把 `sixteen l u fs` 改成 `16 LUFS` 后残留的 `sixty`）→ `−16 LUFS`
  fix(new RegExp(`\\bminus\\s+(?:(?:${NUM_SRC})\\s+)*(\\d+)\\s*(LUFS|dB|Mbps|fps)\\b`, 'i'), (m, v, u) => `−${v} ${u}`, 'minus_cleanup');
  fix(new RegExp(`\\b(?:${NUM_SRC})\\s+(\\d+)\\s*(LUFS|dB|Mbps|fps)\\b`, 'i'), (m, v, u) => `${v} ${u}`, 'stray_num_cleanup');

  // 1) minus + 数词 + LUFS（响度）：`minus sixteen LUFS` → `−16 LUFS`
  fix(new RegExp(`\\bminus\\s+(${NUM_SRC})\\s*LUFS\\b`, 'i'),
    (m, numWords) => {
      // "sixty sixteen" 这类多词序列取**最后**一个数词（实测 ASR 会把 16 念成 "sixty sixteen"）
      const parts = String(numWords).trim().split(/\s+/);
      const last = parts[parts.length - 1];
      const v = NUM_WORDS[last.toLowerCase()];
      return v === undefined ? m : `−${v} LUFS`;
    }, 'minus_lufs');

  // 2) 数词 + LUFS（不带 minus）
  fix(new RegExp(`\\b(${NUM_RE.source.replace(/^\\b|\\b$/g, '')})\\s*LUFS\\b`, 'i'),
    (m, numWords) => {
      const parts = String(numWords).trim().split(/\s+/);
      const v = NUM_WORDS[parts[parts.length - 1].toLowerCase()];
      return v === undefined ? m : `${v} LUFS`;
    }, 'lufs');

  // 3) 数词 + decibels → dB
  fix(new RegExp(`\\b(${NUM_RE.source.replace(/^\\b|\\b$/g, '')})\\s*(?:decibels?|db)\\b`, 'i'),
    (m, numWords) => {
      const v = NUM_WORDS[String(numWords).trim().split(/\s+/).pop().toLowerCase()];
      return v === undefined ? m : `${v} dB`;
    }, 'db');

  // 4) 数词 + megabits per second → Mbps
  fix(new RegExp(`\\b(${NUM_RE.source.replace(/^\\b|\\b$/g, '')})\\s*(?:mega)?bits?\\s+per\\s+second\\b`, 'i'),
    (m, numWords) => {
      const v = NUM_WORDS[String(numWords).trim().split(/\s+/).pop().toLowerCase()];
      return v === undefined ? m : `${v} Mbps`;
    }, 'mbps');
  fix(new RegExp(`\\b(${NUM_RE.source.replace(/^\\b|\\b$/g, '')})\\s*megabits?\\b`, 'i'),
    (m, numWords) => {
      const v = NUM_WORDS[String(numWords).trim().split(/\s+/).pop().toLowerCase()];
      return v === undefined ? m : `${v} Mbps`;
    }, 'mbps_short');

  // 5) 数词 + frames per second → fps
  fix(new RegExp(`\\b(${NUM_RE.source.replace(/^\\b|\\b$/g, '')})\\s*frames?\\s+(?:per|a)\\s+second\\b`, 'i'),
    (m, numWords) => {
      const v = NUM_WORDS[String(numWords).trim().split(/\s+/).pop().toLowerCase()];
      return v === undefined ? m : `${v} fps`;
    }, 'fps');

  // 6) 分辨率 / 像素：`four k` → `4K`，`ten eighty p` → `1080p`（只处理 4k/8k/2k 与 "<数字>p"）
  fix(/\bfour\s*k\b/gi, '4K', '4k');
  fix(/\beight\s*k\b/gi, '8K', '8k');
  fix(/\btwo\s*k\b/gi, '2K', '2k');

  return { text: out, changes };
}

const ZH_NUM = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 百: 100 };

/** "十六" → 16；"六十" → 60；"一百二十" → 120；无法解析返回 null */
export function parseZhNumber(s) {
  const t = String(s || '').trim();
  if (!t) return null;
  if (/^\d+$/.test(t)) return Number(t);
  let total = 0, cur = 0;
  for (const ch of t) {
    const v = ZH_NUM[ch];
    if (v === undefined) return null;
    if (v === 100) { cur = (cur || 1) * 100; total += cur; cur = 0; }
    else if (v === 10) { cur = (cur || 1) * 10; }
    else cur += v;
  }
  return total + cur;
}

/** 中文侧：把同一数值/单位的各种写法统一（机翻常写"负十六 LUFS"/"零下16LUFS"/"−１６ LUFS"） */
export function canonicalizeZh(zh, { lufsTarget = null } = {}) {
  let out = String(zh || '');
  const changes = [];
  const rep = (re, repl, rule) => {
    out = out.replace(re, (...m) => {
      const next = typeof repl === 'function' ? repl(...m) : repl;
      if (next !== m[0]) changes.push({ from: m[0], to: next, rule });
      return next;
    });
  };
  const ZH_NUM_SRC = '[零〇一二三四五六七八九十百两\\d]+';
  // 全角数字/减号 → 半角
  rep(/[０-９]/g, (m) => String.fromCharCode(m.charCodeAt(0) - 0xFEE0), 'fullwidth_digit');
  rep(/[－—–]/g, '−', 'dash');
  // 机翻常输出 ASCII 连字符（"-16 LUFS"、"为-16 LUFS"）→ 用数学减号（排版更规范，且与源端一致）
  rep(/(?<![\d.])-(\d+)\s*(LUFS|dB|Mbps|fps)\b/g, (m, n, u) => `−${n} ${u}`, 'zh_ascii_minus');
  // "负十六 LUFS" / "零下十六 LUFS" / "减十六 LUFS" / "减16 LUFS" → "−16 LUFS"
  rep(new RegExp(`(?:负|零下|减|减去)\\s*(${ZH_NUM_SRC})\\s*个?\\s*(LUFS|lufs)`, 'g'),
    (m, n) => { const v = parseZhNumber(n); return v == null ? m : `−${v} LUFS`; }, 'zh_lufs_minus');
  // "十六个 LUFS" / "16个LUFS" → "16 LUFS"
  rep(new RegExp(`(${ZH_NUM_SRC})\\s*个\\s*(LUFS|lufs)`, 'g'),
    (m, n) => { const v = parseZhNumber(n); return v == null ? m : `${v} LUFS`; }, 'zh_lufs_unit');
  // "每秒十五兆比特" / "每秒15兆比特" / "十五兆比特" → "15 Mbps"
  rep(new RegExp(`每秒\\s*(${ZH_NUM_SRC})\\s*兆比特`, 'g'),
    (m, n) => { const v = parseZhNumber(n); return v == null ? m : `${v} Mbps`; }, 'zh_mbps');
  rep(new RegExp(`(${ZH_NUM_SRC})\\s*兆比特(?:\\/秒)?`, 'g'),
    (m, n) => { const v = parseZhNumber(n); return v == null ? m : `${v} Mbps`; }, 'zh_mbps2');
  // "每秒六十帧" → "60 fps"
  rep(new RegExp(`每秒\\s*(${ZH_NUM_SRC})\\s*帧`, 'g'),
    (m, n) => { const v = parseZhNumber(n); return v == null ? m : `${v} fps`; }, 'zh_fps');
  // "四K" → "4K"
  rep(/四\s*K/g, '4K', 'zh_4k');
  // 单位前后空格统一（"−16LUFS" → "−16 LUFS"）
  rep(/([0-9])\s*(LUFS|Mbps|fps|dB)\b/g, (m, n, u) => `${n} ${u}`, 'zh_unit_space');
  // 去掉转换后多余的"每秒"（"15 Mbps每秒" → "15 Mbps"）
  rep(/((?:LUFS|Mbps|fps|dB))\s*每秒/g, (m, u) => u, 'zh_drop_per_second');
  // 中文标点前不能有空格（机翻常见 "−16 LUFS ，"）
  rep(/\s+([，。；：？！、）】」』])/g, (m, p) => p, 'zh_space_before_punct');
  return { text: out, changes };
}
