#!/usr/bin/env node
// ted_subs.mjs —— TED HLS 字幕段下载 + 合并（小循环 14 EP-A 踩坑后固化）
//
// 背景坑：TED 把一条 project_master 的字幕切成 30s 一段的 vtt，每段内部 cue 时间
// **相对整片起点**（不是相对段起点），而段文件的 header 带预卷。按 EXTINF 累加会每段错 30s。
// EP-A 实测：正确做法是「每段 cue 时间直接取原值 + 一个恒定预卷偏移」，偏移量用 ASR 词流当真值标定。
//
// 用法：
//   node Tool/ops/ted_subs.mjs --pm 3235 --lang en,zh-cn --out Workspace/tmp/ted_epb --offset 3.504
// 产出：<out>/sub_en.m3u8, <out>/full_en.vtt, <out>/cues_en.json（同 zh-cn）
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const PM = opt('pm');
const LANGS = (opt('lang', 'en,zh-cn')).split(',');
const OUT = opt('out', '.');
const OFFSET = Number(opt('offset', '0'));
const INTRO = opt('intro', '9294');
if (!PM) { console.error('need --pm <project_masters id>'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });

const base = `https://hls.ted.com/project_masters/${PM}`;
const q = `?intro_master_id=${INTRO}`;

const get = async (url) => {
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (r.ok) return await r.text();
      if (r.status === 404) return null;
    } catch (e) { /* retry */ }
    await new Promise(r => setTimeout(r, 800 * (i + 1)));
  }
  return null;
};

const parseVtt = (txt) => {
  const cues = [];
  const blocks = txt.replace(/\r/g, '').split(/\n\n+/);
  for (const b of blocks) {
    const lines = b.split('\n').filter(l => l.trim() !== '');
    const ti = lines.findIndex(l => l.includes('-->'));
    if (ti < 0) continue;
    const m = lines[ti].match(/(\d+):(\d+):(\d+)[.,](\d+)\s*-->\s*(\d+):(\d+):(\d+)[.,](\d+)/);
    if (!m) continue;
    const s = +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000;
    const e = +m[5] * 3600 + +m[6] * 60 + +m[7] + +m[8] / 1000;
    const text = lines.slice(ti + 1).join(' ').replace(/<[^>]+>/g, '').trim();
    if (text) cues.push({ start: s, end: e, text });
  }
  return cues;
};

const fmt = (t) => {
  t = Math.max(0, t);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  const p = (n, w = 2) => String(Math.floor(n)).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(s)}.${p(Math.round((s % 1) * 1000), 3)}`;
};

const summary = {};
for (const lang of LANGS) {
  const idx = await get(`${base}/subtitles/${lang}.m3u8${q}`);
  if (!idx) { console.error(`[${lang}] index 404`); continue; }
  fs.writeFileSync(path.join(OUT, `sub_${lang}.m3u8`), idx);
  // 段号必须从清单 URI 里解析，不能用下标猜：
  // TED 字幕清单首条是预卷占位段（EXTINF≈3.5s，URI 为 ?segment=-2），
  // 若按「第 i 条 ↔ segment=i」对应，会把预卷段的 3.5s 时长套给 segment=0，
  // 服务器据此只返回起点落在这个短窗口内的 cue —— 整段 30s 的对白全丢。
  const segs = [];
  {
    const lines = idx.replace(/\r/g, '').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/#EXTINF:([\d.]+)/);
      if (!m) continue;
      let j = i + 1;
      while (j < lines.length && (lines[j].startsWith('#') || !lines[j].trim())) j++;
      const uri = j < lines.length ? lines[j].trim() : '';
      if (uri && /\.vtt/.test(uri)) segs.push({ dur: +m[1], uri });
    }
  }
  const segCount = segs.length;
  let all = [];
  let dup = 0;
  for (let i = 0; i < segs.length; i++) {
    const url = /^https?:/.test(segs[i].uri) ? segs[i].uri : `${base}/subtitles/${segs[i].uri}`;
    const txt = await get(url);
    if (!txt) { console.error(`[${lang}] seg ${i} (${segs[i].uri}) fail`); continue; }
    const cues = parseVtt(txt);
    for (const c of cues) {
      const s = +(c.start + OFFSET).toFixed(3), e = +(c.end + OFFSET).toFixed(3);
      // 段边界重复 cue 去重（同文本且起点差 < 1s）
      if (all.some(x => x.text === c.text && Math.abs(x.start - s) < 1.0)) { dup++; continue; }
      all.push({ start: s, end: e, text: c.text });
    }
    process.stdout.write(`\r[${lang}] ${i + 1}/${segs.length} cues=${all.length} dup=${dup}   `);
  }
  all.sort((a, b) => a.start - b.start);
  const vtt = 'WEBVTT\n\n' + all.map(c => `${fmt(c.start)} --> ${fmt(c.end)}\n${c.text}\n`).join('\n');
  fs.writeFileSync(path.join(OUT, `full_${lang}.vtt`), vtt);
  fs.writeFileSync(path.join(OUT, `cues_${lang}.json`), JSON.stringify(all, null, 1));
  summary[lang] = { segments: segCount, cues: all.length, dup, first: all[0]?.start, last: all.at(-1)?.end };
  console.log(`\n[${lang}] cues=${all.length} dup=${dup} span=${fmt(all[0]?.start ?? 0)} → ${fmt(all.at(-1)?.end ?? 0)}`);
}
console.log(JSON.stringify(summary, null, 2));
