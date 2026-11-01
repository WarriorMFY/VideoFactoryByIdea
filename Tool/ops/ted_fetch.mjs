#!/usr/bin/env node
// ted_fetch.mjs —— TED 一条演讲的「素材入袋」：视频 + 官方双语字幕，一条命令
//
// 补的是链路第 1 步的缺口：loop14 五条片的 talk_720p.mp4 全是手工 ffmpeg 抓的，
// 换个人接手第一步就卡住。这里把「找出 f11/f12 清单 → ffmpeg 合并 → 抓字幕」串起来。
//
// 用法：
//   node Tool/ops/ted_fetch.mjs --pm 9260 --out Workspace/tmp/ted_feifei
//        [--lang en,zh-cn]     官方字幕语言（默认 en,zh-cn）
//        [--intro 9294]        TED 片头 master id（不同 talk 可能不同；--intro 0 表示不带片头）
//        [--only video|subs]   只做其中一步
//        [--t 20]              只抓前 N 秒（冒烟用；正式跑不要带）
//        [--probe]             只探测清单可达性与时长，不下载
//
// 产出（<out>/）：
//   talk_720p.mp4       f11 视频 + f12 音频混流（-c copy，不重编码）
//   video.m3u8 audio.m3u8  原始清单（留痕；带 ?intro_master_id= 的完整 URL 记进 talk.meta.json）
//   cues_en.json / cues_zh-cn.json / full_*.vtt   官方字幕（由 ted_subs.mjs --offset 0 产出）
//   talk.meta.json     pm / intro / 语言 / 时长 / 字节 / 抓取时间 / 清单 URL
//
// 坑：字幕必须 `--offset 0` 抓（坑 12），预卷偏移由 estimate_offset 在流水线里标定后统一施加。
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ffmpeg, ffprobeJson } from '../lib/ff.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
const LOG = path.join(ROOT, 'History', 'runs', '_logs', 'ted_fetch.log');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const flag = (k) => args.includes('--' + k);

const PM = opt('pm');
const OUT = path.resolve(ROOT, opt('out', PM ? `Workspace/tmp/ted_${PM}` : ''));
const LANGS = (opt('lang', 'en,zh-cn')).split(',').map(s => s.trim()).filter(Boolean);
const INTRO = opt('intro', '9294');
const ONLY = opt('only', '');
const LIMIT = opt('t', '');
const PROBE = flag('probe');

if (!PM) { console.error('用法: node Tool/ops/ted_fetch.mjs --pm <project_masters id> --out <dir>'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });

const q = INTRO && INTRO !== '0' ? `?intro_master_id=${INTRO}` : '';
const base = `https://hls.ted.com/project_masters/${PM}`;
const URL_VIDEO = `${base}/index-f11-v1.m3u8${q}`;
const URL_AUDIO = `${base}/index-f12-a1.m3u8${q}`;

const get = async (url) => {
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (r.ok) return await r.text();
      if (r.status === 404) return null;
    } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 800 * (i + 1)));
  }
  return null;
};

/** 清单里的 #EXTINF 总和 = 时长；段数 = 分片数 */
const inspect = (txt) => {
  if (!txt) return null;
  const dur = [...txt.matchAll(/#EXTINF:([\d.]+)/g)].reduce((a, m) => a + Number(m[1]), 0);
  const segs = (txt.match(/#EXTINF:/g) || []).length;
  return { segs, dur: +dur.toFixed(2) };
};

const fmtT = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

(async () => {
  const t0 = Date.now();
  console.log(`[fetch] pm=${PM} intro=${INTRO || '(none)'} out=${rel(OUT)}`);

  // ---------- ① 探测清单 ----------
  const vTxt = await get(URL_VIDEO);
  const aTxt = await get(URL_AUDIO);
  const vi = inspect(vTxt), ai = inspect(aTxt);
  if (!vTxt) { console.error(`视频清单不可达：${URL_VIDEO}`); process.exit(1); }
  if (!aTxt) console.warn(`[warn] 音频清单不可达：${URL_AUDIO}（将退化为仅视频，无声）`);
  console.log(`[fetch] 视频 f11：${vi.segs} 段 / ${fmtT(vi.dur)}（${vi.dur}s）`);
  if (ai) console.log(`[fetch] 音频 f12：${ai.segs} 段 / ${fmtT(ai.dur)}（${ai.dur}s）`);
  if (PROBE) {
    console.log(JSON.stringify({ pm: PM, video: vi, audio: ai, url_video: URL_VIDEO, url_audio: URL_AUDIO }, null, 1));
    return;
  }
  fs.writeFileSync(path.join(OUT, 'video.m3u8'), vTxt);
  if (aTxt) fs.writeFileSync(path.join(OUT, 'audio.m3u8'), aTxt);

  // ---------- ② 视频 + 音频混流（-c copy，不重编码）----------
  const MP4 = path.join(OUT, 'talk_720p.mp4');
  if (ONLY !== 'subs') {
    if (fs.existsSync(MP4) && fs.statSync(MP4).size > 1024 * 1024 && !LIMIT) {
      console.log(`[fetch] 复用已有 ${rel(MP4)}（要重抓请先删掉）`);
    } else {
      const ffArgs = ['-hide_banner', '-loglevel', 'error', '-y',
        // 白名单必须含 httpproxy：本机环境带 http_proxy 时 ffmpeg 会走代理协议，
        // 漏了它就是「Protocol 'httpproxy' not on whitelist」直接打不开输入（坑 16）。
        '-protocol_whitelist', 'file,http,https,tcp,tls,crypto,httpproxy',
        '-i', URL_VIDEO];
      if (aTxt) ffArgs.push('-i', URL_AUDIO, '-map', '0:v:0', '-map', '1:a:0');
      else ffArgs.push('-map', '0:v:0');
      if (LIMIT) ffArgs.push('-t', String(LIMIT));
      ffArgs.push('-c', 'copy', '-movflags', '+faststart', MP4);
      console.log('[fetch] ffmpeg 抓流中（HLS 分片逐个拉取，长片需数分钟）…');
      const r = ffmpeg(ffArgs, LOG);
      if (r.status !== 0 || !fs.existsSync(MP4)) {
        console.error(`抓流失败 exit=${r.status}\n${(r.text || '').slice(-1200)}`);
        process.exit(1);
      }
      const mb = (fs.statSync(MP4).size / 1048576).toFixed(0);
      console.log(`[fetch] ✓ ${rel(MP4)}  ${mb} MB  (+${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    }
  }

  // ---------- ③ 官方字幕（offset 0！见坑 12）----------
  if (ONLY !== 'video') {
    const r = spawnSync(process.execPath, [path.join(ROOT, 'Tool/ops/ted_subs.mjs'),
      '--pm', PM, '--lang', LANGS.join(','), '--out', rel(OUT), '--offset', '0', '--intro', INTRO || '0'],
      { cwd: ROOT, encoding: 'utf8' });
    if (r.status !== 0) {
      console.error(`字幕抓取失败 exit=${r.status}\n${((r.stdout || '') + (r.stderr || '')).slice(-800)}`);
      process.exit(1);
    }
    console.log((r.stdout || '').split('\n').filter(l => l.startsWith('[')).join('\n'));
  }

  // ---------- ④ 元数据 ----------
  let media = {};
  if (fs.existsSync(MP4)) {
    const p = ffprobeJson(['-show_format', '-show_streams', MP4], LOG);
    const v = (p.streams || []).find(s => s.codec_type === 'video') || {};
    const a = (p.streams || []).find(s => s.codec_type === 'audio') || {};
    media = {
      duration_s: +(p.format?.duration || 0),
      bytes: +(p.format?.size || 0),
      fps: v.r_frame_rate || null,
      size: v.width && v.height ? `${v.width}x${v.height}` : null,
      audio: a.codec_name || null,
    };
  }
  const meta = {
    pm: PM, intro: INTRO || null,
    url_video: URL_VIDEO, url_audio: aTxt ? URL_AUDIO : null,
    langs: LANGS,
    playlist: { video: vi, audio: ai },
    media,
    limited_to_s: LIMIT ? Number(LIMIT) : null,
    fetched_at: new Date().toISOString(),
    note: '字幕以 --offset 0 抓取；预卷偏移由 estimate_offset.mjs 在流水线里标定后统一施加（坑 12）。',
  };
  fs.writeFileSync(path.join(OUT, 'talk.meta.json'), JSON.stringify(meta, null, 1));
  console.log(`[fetch] 完成 (+${((Date.now() - t0) / 1000).toFixed(0)}s) → ${rel(OUT)}/talk.meta.json`);
  console.log(`下一步： node Tool/ops/ted_episode.mjs --dir ${rel(OUT)} --out Prototype/<循环>/ep_x`);
})().catch((e) => { console.error(e); process.exit(1); });
