#!/usr/bin/env node
/**
 * make_tos_excerpt.mjs — 小循环 4：从 Tears of Steel 里挑「对白最密」的 90s，并生成**真值**
 *
 * 与前几个样本的关键差别：ToS 有官方英文字幕（TOS-en.srt），所以这是**第一份带真值的真实影视素材**：
 *   - 真值来源：官方字幕 + 其时间码，截取窗口内的字幕行原样搬过来（时间平移 -window_start）
 *   - 顺带把官方中文字幕（TOS-CH.srt）对齐保存，用于比对"机翻 vs 人工翻译"
 * 选段方式：不用 ASR 猜（贵且可能整段没词），直接用字幕密度（词数）滑窗，便宜且精确。
 *
 * 用法：node Tool\setup\make_tos_excerpt.mjs [--window 90] [--step 5]
 * 输出：Workspace/assets/tos_excerpts/tos_90s.mp4 + tos_90s.ground_truth.json + tos_90s.reference_zh.json
 *       并在 History/loops/loop04/excerpts.json 里登记（run_multi_speech_acceptance.mjs 会自动纳入）
 */
import fs from 'node:fs';
import path from 'node:path';
import { ffmpeg, durationOf, ROOT } from '../lib/ff.mjs';

const args = process.argv.slice(2);
const getOpt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const WINDOW = Number(getOpt('--window', 90));
const STEP = Number(getOpt('--step', 5));
const MOVIE = path.join(ROOT, 'Workspace', 'assets', 'tos', 'tears_of_steel_720p.mov');
const EN_SRT = path.join(ROOT, 'Workspace', 'assets', 'tos', 'TOS-en.srt');
const ZH_SRT = path.join(ROOT, 'Workspace', 'assets', 'tos', 'TOS-CH.srt');
const OUT = path.join(ROOT, 'Workspace', 'assets', 'tos_excerpts');
const L4 = path.join(ROOT, 'History', 'loops', 'loop04');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(L4, { recursive: true });

if (!fs.existsSync(MOVIE)) { console.error(`缺少电影 ${path.relative(ROOT, MOVIE)}（先跑 node Tool\\setup\\fetch_tos_movie.mjs）`); process.exit(1); }

/** 解析 SRT：返回 [{idx, start, end, text}]（秒）
 *  故意写得宽容：ToS 的中文轨道是"时间码 → 文本 → 序号"的怪顺序（序号在文本之后），
 *  按空行切块会错位，所以逐行扫描：遇到时间码行就开始收集后面的文本行。 */
function parseSrt(file) {
  const raw = fs.readFileSync(file, 'utf8').replace(/\r/g, '');
  const lines = raw.split('\n');
  const out = [];
  const toSec = (s) => {
    const m = s.trim().match(/(\d+):(\d+):(\d+)[,.](\d+)/);
    return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000 : null;
  };
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes('-->')) continue;
    const [a, c] = lines[i].split('-->');
    const start = toSec(a); const end = toSec(c);
    const textLines = [];
    for (let j = i + 1; j < lines.length; j++) {
      const t = lines[j].trim();
      if (lines[j].includes('-->')) break;
      if (!t) { if (textLines.length) break; else continue; }
      if (/^\d+$/.test(t)) break;            // 下一个条目的序号
      textLines.push(t);
    }
    const text = textLines.join(' ').replace(/<[^>]+>/g, '').trim();
    if (start == null || end == null || !text) continue;
    out.push({ start, end, text });
  }
  return out;
}

const en = parseSrt(EN_SRT);
const zh = parseSrt(ZH_SRT);
console.log(`[subs] 英文字幕 ${en.length} 行，中文字幕 ${zh.length} 行`);

// 滑窗：窗口内字幕行最多者胜（同分比字符数）
let best = { start: 0, count: 0, chars: 0 };
const dur = durationOf(MOVIE, path.join(OUT, '_dur.log'));
for (let t = 0; t + WINDOW <= dur; t += STEP) {
  const inWin = en.filter((l) => l.start >= t && l.start < t + WINDOW);
  const chars = inWin.reduce((a, l) => a + l.text.length, 0);
  if (inWin.length > best.count || (inWin.length === best.count && chars > best.chars)) best = { start: t, count: inWin.length, chars };
}
if (best.count < 5) { console.error(`[fail] 最好的窗口也只有 ${best.count} 行字幕，素材不合适`); process.exit(1); }
console.log(`[win] ${best.start}s +${WINDOW}s 内 ${best.count} 行字幕 / ${best.chars} 字符`);

// 中文字幕按时间就近对齐（官方两条轨道不一定逐行对齐）
const zhFor = (line) => {
  const hit = zh.find((z) => Math.abs(z.start - line.start) < 1.2) || zh.filter((z) => Math.abs(z.start - line.start) < 3).sort((a, b) => Math.abs(a.start - line.start) - Math.abs(b.start - line.start))[0];
  return hit ? hit.text : '';
};

const lines = en.filter((l) => l.start >= best.start && l.start < best.start + WINDOW)
  .map((l, i) => ({
    idx: i,
    start: Number((l.start - best.start).toFixed(3)),
    end: Number((l.end - best.start).toFixed(3)),
    text: l.text,
    ref_zh: zhFor(l),
  }));

// 截取（视频重编码保证首帧准确；音频保留原声道）
const clipFile = path.join(OUT, 'tos_90s.mp4');
const r = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(best.start), '-t', String(WINDOW), '-i', MOVIE,
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-vf', 'scale=-2:480',
  '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', clipFile], path.join(OUT, '_cut.log'));
if (r.status !== 0) { console.error(`[fail] 截取失败: ${r.text.split('\n').slice(-3).join(' | ')}`); process.exit(1); }
const clipDur = durationOf(clipFile, path.join(OUT, '_clip_dur.log'));
console.log(`[cut] ${path.relative(ROOT, clipFile)} ${clipDur.toFixed(2)}s`);

const gt = {
  generated_at: new Date().toISOString(),
  source: 'Tool/setup/make_tos_excerpt.mjs',
  note: `Tears of Steel（© Blender Foundation, CC-BY 3.0）${best.start}s 起 ${WINDOW}s 的片段；真值取自官方英文字幕 TOS-en.srt（时间已平移 -${best.start}s）。`,
  language: 'en',
  license: 'CC-BY 3.0, Blender Foundation',
  duration_s: Number(clipDur.toFixed(3)),
  window_start_s: best.start,
  sentences: lines,
  script: lines.map((l) => l.text).join(' '),
};
const gtFile = path.join(OUT, 'tos_90s.ground_truth.json');
fs.writeFileSync(gtFile, JSON.stringify(gt, null, 2));
fs.writeFileSync(path.join(OUT, 'tos_90s.reference_zh.json'), JSON.stringify({
  note: '官方中文字幕（TOS-CH.srt，人工翻译），用于对比机翻质量；按时间就近对齐，可能有个别错配',
  sentences: lines.map((l) => ({ idx: l.idx, en: l.text, zh: l.ref_zh })),
}, null, 2));

// 登记到 excerpts.json（合并，不覆盖既有条目）
const manifestFile = path.join(L4, 'excerpts.json');
const manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : { excerpts: [] };
manifest.excerpts = (manifest.excerpts || []).filter((e) => e.id !== 'tos_90s');
manifest.excerpts.push({
  id: 'tos_90s', clip: path.relative(ROOT, clipFile), gt: path.relative(ROOT, gtFile),
  from_s: best.start, duration_s: Number(clipDur.toFixed(2)), subtitle_lines: lines.length,
  note: 'Tears of Steel 90s 对白密集片段（官方英文字幕作真值）',
});
manifest.generated_at = new Date().toISOString();
fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));

console.log(`\n[tos] 真值 ${lines.length} 行（示例）：`);
for (const l of lines.slice(0, 4)) console.log(`  ${l.start}–${l.end}s  ${l.text}  |  ${l.ref_zh}`);
console.log(`\n[done] → ${path.relative(ROOT, gtFile)}`);
