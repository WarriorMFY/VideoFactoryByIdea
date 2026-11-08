#!/usr/bin/env node
/**
 * dl_bili_hd.mjs — 登录态 dash 通道下载高清 B 站视频（loop32，升级 dl_bili）
 *
 * 原理：从 Playwright 持久化 profile（Workspace/run/bili_profile）取 cookie，
 *       调 playurl?fnval=16(dash)&qn=80 → 分别下载 1080p 视频流 + 音频流 → ffmpeg mux。
 * 用法：node Tool/ops/dl_bili_hd.mjs BV1xxx out.mp4 [qn]      # 缺省 qn=116（1080p60）
 *       qn: 80=1080p 112=1080p+ 116=1080p60(需大会员) 120=4K
 * 账号纪律（2026-11-08 人工定）：采集走「为做真实的自己许诺」，先设
 *       BILI_PROFILE=Workspace/run/bili_profile_B_326452892；不设则落到发布号目录（错号）。
 *       无大会员时 playurl 会静默降级成 30fps（坑40），本脚本会打印实际流分辨率/帧率作证。
 */
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { execSync } from 'node:child_process';
import { launchProfile } from '../lib/pw.mjs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const FF = path.join(process.cwd(), 'Workspace/deps/ffmpeg/ffmpeg.exe');
const [bvid, out, qnArg] = process.argv.slice(2);
if (!bvid || !out) { console.log('用法: dl_bili_hd.mjs BV out.mp4 [qn=80]'); process.exit(2); }
const QN = +(qnArg || 116);

// 1) 从持久化 profile 取 cookie
const { ctx } = await launchProfile({ headless: true });
let cookieStr;
try {
  const cookies = await ctx.cookies('https://www.bilibili.com');
  cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
  const loggedIn = cookies.some(c => c.name === 'SESSDATA') && cookies.some(c => c.name === 'DedeUserID');
  if (!loggedIn) { console.error('profile 未登录——先跑 publish_bilibili.mjs login'); process.exit(1); }
} finally { await ctx.close(); }
const H = { 'User-Agent': UA, Referer: 'https://www.bilibili.com/', Cookie: cookieStr };

// 2) 元信息 + dash playurl
const j = await (await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, { headers: H })).json();
if (j.code !== 0) { console.error('view 失败', j.code, j.message); process.exit(1); }
const cid = j.data.cid, title = j.data.title;
console.log('标题:', title, '| cid:', cid);

const q = await (await fetch(`https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=${QN}&fnval=16&fourk=1`, { headers: H })).json();
if (q.code !== 0) { console.error('playurl 失败', q.code, q.message); process.exit(1); }
const dash = q.data?.dash;
if (!dash) { console.error('无 dash（可能不支持高清）'); process.exit(1); }

// 3) 选流：视频取 ≤qn 的最高档，音频取最高码率
const videos = dash.video.sort((a, b) => b.id - a.id);
const v = videos.find(x => x.id <= QN) || videos[videos.length - 1];
const a = dash.audio.sort((x, y) => y.bandwidth - x.bandwidth)[0];
console.log(`视频流: id=${v.id} ${v.width}x${v.height} ${v.frameRate}fps ${(v.bandwidth / 1e6).toFixed(2)}Mbps`);
if (v.id < QN) console.log(`  ⚠ 实际档位 id=${v.id} 低于请求 qn=${QN}（账号无更高权限，已静默降级）`);
console.log(`音频流: id=${a.id} ${(a.bandwidth / 1e3).toFixed(0)}kbps`);

// 流式下载 + backupUrl 回退 + 重试（大文件整块 arrayBuffer 易 ECONNRESET）
const dl = async (stream, dest) => {
  const urls = [stream.baseUrl, ...(stream.backupUrl || [])];
  for (const [ui, url] of urls.entries()) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const r = await fetch(url, { headers: { ...H, Range: 'bytes=0-' } });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        await pipeline(Readable.fromWeb(r.body), fs.createWriteStream(dest));
        const size = fs.statSync(dest).size;
        if (size < 1024) throw new Error('文件过小 ' + size);
        return size;
      } catch (e) {
        if (attempt === 3 && ui === urls.length - 1) { console.error('下载失败:', e.message); process.exit(1); }
        console.log(`  源${ui + 1} 第${attempt}次失败(${e.message})，${attempt === 3 ? '换备用源' : '重试'}`);
      }
    }
  }
};

const tmpV = out + '.m4s', tmpA = out + '.aac';
const sv = await dl(v, tmpV);
const sa = await dl(a, tmpA);
console.log(`视频 ${(sv / 1e6).toFixed(1)}MB + 音频 ${(sa / 1e6).toFixed(1)}MB，mux 中...`);

execSync(`"${FF}" -hide_banner -loglevel error -y -i "${tmpV}" -i "${tmpA}" -c copy -movflags +faststart "${out}"`);
fs.unlinkSync(tmpV); fs.unlinkSync(tmpA);
console.log('OK', out);
