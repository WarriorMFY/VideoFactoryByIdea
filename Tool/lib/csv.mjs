/**
 * lib/csv.mjs — 极简 CSV 读写（够用即可，不做 RFC4180 全套）
 *
 * 为什么不用现成库：本仓库的运行时依赖刻意保持为零（沙箱里装包不可靠），
 * 而校对表只需要「引号内逗号/换行、双引号转义、UTF-8 BOM、CRLF」这四种情况。
 */
import fs from 'node:fs';

/** 单元格安全化（加引号 + 转义双引号） */
export function csvCell(v) {
  return `"${String(v ?? '').replace(/"/g, '""')}"`;
}

/** 行数组 → CSV 文本（CRLF，尾部换行） */
export function toCsv(rows) {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** CSV 文本 → 二维数组（去掉 BOM，忽略纯空行） */
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', inQ = false;
  const s = String(text).replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQ) {
      if (ch === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; } else inQ = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') { inQ = true; continue; }
    if (ch === ',') { row.push(cell); cell = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue; }
    cell += ch;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.length > 1 || String(r[0] || '').trim());
}

/** 读文件 → 二维数组 */
export function readCsv(file) { return parseCsv(fs.readFileSync(file, 'utf8')); }

/** 写 CSV（带 BOM，Excel 直接打开中文不乱码） */
export function writeCsv(file, rows) { fs.writeFileSync(file, '\uFEFF' + toCsv(rows), 'utf8'); }
