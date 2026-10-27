#!/usr/bin/env node
/**
 * fetch_more_speech.mjs — 小循环 4：多下几个「带英文人声」的公开素材做英译中测试
 *
 * 可用站点实测见 Tool/env.md §一：media.w3.org（0.5~5MB/s）与 test-videos.co.uk 可达，
 * Wikimedia / HuggingFace / Internet Archive 全域不可达（所以只能用 Blender 开放电影体系）。
 * media.w3.org 目录列表返回 403（不能列目录），样本 URL 只能靠已知路径逐个试。
 *
 * 授权：Sintel / Big Buck Bunny / Tears of Steel 均为 Blender Foundation 开放电影
 *       （CC-BY 3.0），可自由分发与二次创作；每个文件旁写 SOURCE.txt 记录出处。
 *
 * 用法：
 *   node Tool\setup\fetch_more_speech.mjs              # 下 4 个片段（含大电影）
 *   node Tool\setup\fetch_more_speech.mjs --small      # 跳过 237MB 的整片
 * 输出：Workspace/assets/speech4/<name>/*.mp4 + SOURCE.txt + probe.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ffprobeJson, ROOT } from '../lib/ff.mjs';

const args = process.argv.slice(2);
const SMALL = args.includes('--small');
const OUT = path.join(ROOT, 'Workspace', 'assets', 'speech4');
fs.mkdirSync(OUT, { recursive: true });

// [目录名, URL, 说明, 授权]
const CANDS = [
  ['sintel_trailer', 'https://media.w3.org/2010/05/sintel/trailer.mp4',
    'Sintel 预告片：影视级混音（对白+音乐+音效），小循环 3 的回归基线', 'CC-BY 3.0, Blender Foundation'],
  ['toS_movie300', 'https://media.w3.org/2010/05/video/movie_300.mp4',
    'W3C 示例片（Tears of Steel 片段，真人英语对白+电子配乐）', 'CC-BY 3.0, Blender Foundation'],
  ['bbb_trailer', 'https://media.w3.org/2010/05/bunny/trailer.mp4',
    'Big Buck Bunny 预告片：卡通配音+音乐（语音稀疏，测"稀疏语音"场景）', 'CC-BY 3.0, Blender Foundation'],
  ['tv_sintel_10s', 'https://test-videos.co.uk/vids/sintel/mp4/h264/720/Sintel_720_10s_2MB.mp4',
    '10 秒极短片：测"样本过短/上下文不足"的边界', 'CC-BY 3.0, Blender Foundation'],
  ['tv_bbb_10s', 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_2MB.mp4',
    '10 秒 BBB 片段：同上，但内容不同（含音轨与否待验）', 'CC-BY 3.0, Blender Foundation'],
  ['bbb_movie_full', 'https://media.w3.org/2010/05/bunny/movie.mp4',
    'Big Buck Bunny 完整电影（237MB）：多角色对白，供截取 90s 高对白密度片段', 'CC-BY 3.0, Blender Foundation'],
];

const results = [];
for (const [dir, url, note, license] of CANDS) {
  if (SMALL && /movie_full/.test(dir)) { console.log(`[skip] ${dir}（--small）`); continue; }
  const ddir = path.join(OUT, dir);
  fs.mkdirSync(ddir, { recursive: true });
  const dest = path.join(ddir, `${dir}.mp4`);
  fs.writeFileSync(path.join(ddir, 'SOURCE.txt'),
    `来源: ${url}\n说明: ${note}\n授权: ${license}\n下载时间: ${new Date().toISOString()}\n`);
  try {
    if (!fs.existsSync(dest) || fs.statSync(dest).size < 100 * 1024) {
      const t0 = Date.now();
      const r = await fetch(url, { signal: AbortSignal.timeout(600000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await pipeline(Readable.fromWeb(r.body), createWriteStream(dest));
      const mb = fs.statSync(dest).size / 1048576;
      console.log(`[dl] ${dir.padEnd(16)} ${mb.toFixed(2)}MB ${((Date.now() - t0) / 1000).toFixed(1)}s ${(mb / ((Date.now() - t0) / 1000)).toFixed(1)}MB/s`);
    } else {
      console.log(`[ok] ${dir}（已存在）`);
    }
    const pr = ffprobeJson(['-show_format', '-show_streams', dest], path.join(ddir, '_probe.log'));
    const v = (pr.streams || []).find((s) => s.codec_type === 'video');
    const a = (pr.streams || []).find((s) => s.codec_type === 'audio');
    const meta = {
      file: dest, duration: Number(pr.format?.duration || 0),
      video: v ? `${v.width}x${v.height} ${v.codec_name} ${Number(v.avg_frame_rate?.split('/')[0] || 0).toFixed(0)}fps` : null,
      audio: a ? `${a.codec_name} ${a.sample_rate}Hz ${a.channels}ch` : null,
      source: url, license,
    };
    results.push({ dir, ...meta });
    console.log(`[meta] ${dir.padEnd(16)} ${meta.duration.toFixed(1)}s ${meta.video || '无视频'} audio=${meta.audio || '❌无音轨'}`);
  } catch (e) {
    console.log(`[fail] ${dir}: ${String(e.message).slice(0, 80)}`);
    results.push({ dir, error: String(e.message).slice(0, 120), source: url });
  }
}

fs.writeFileSync(path.join(OUT, 'samples.json'), JSON.stringify({ fetchedAt: new Date().toISOString(), samples: results }, null, 2));
console.log(`\n[done] ${results.filter((r) => !r.error).length}/${results.length} 成功 → ${OUT}`);
console.log('下一步：node Tool\\setup\\make_speech4_tts.mjs 造带真值的 TTS 样本；再用 acceptance/run_multi_speech_acceptance.mjs 批量跑');
