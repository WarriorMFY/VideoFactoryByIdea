#!/usr/bin/env node
/**
 * dl_bili.mjs — loop19：下载 B站样本视频（公开 html5 低清通道，带 Referer）
 * 用法: node dl_bili.mjs BV1xxx out.mp4
 */
import fs from 'node:fs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const H = { 'User-Agent': UA, Referer: 'https://www.bilibili.com/', Cookie: 'buvid3=infoc' };
const [bvid, out] = process.argv.slice(2);
if (!bvid || !out) { console.log('用法: dl_bili.mjs BV out.mp4'); process.exit(2); }

const j = await (await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, { headers: H })).json();
if (j.code !== 0) { console.error('view 失败', j.code, j.message); process.exit(1); }
const cid = j.data.cid;
const q = await (await fetch(`https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=32&platform=html5&high_quality=1`, { headers: H })).json();
if (q.code !== 0) { console.error('playurl 失败', q.code, q.message); process.exit(1); }
const durl = q.data.durl?.[0];
if (!durl) { console.error('无 durl（dash 视频不支持 html5 通道）'); process.exit(1); }
console.log('size', (durl.size / 1e6).toFixed(1) + 'MB', durl.url.slice(0, 60) + '...');

const r = await fetch(durl.url, { headers: { ...H, Range: 'bytes=0-' } });
if (!r.ok) { console.error('下载失败', r.status); process.exit(1); }
fs.writeFileSync(out, Buffer.from(await r.arrayBuffer()));
console.log('OK', out);
