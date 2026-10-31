/**
 * lib/ff.mjs — 子进程调用封装（适配当前沙箱限制）
 *
 * 环境事实：本沙箱下 Node 的 pipe stdio 被拦截（spawnSync 默认 stdio:'pipe' 返回 EPERM），
 * 但把子进程 stdout/stderr 重定向到**普通文件描述符**是允许的。
 * 因此所有 ffmpeg/ffprobe 调用统一走「fd 重定向 + 读回日志文件」。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '..', '..');
export const FF = process.env.FFMPEG || path.join(ROOT, 'Workspace', 'deps', 'ffmpeg', 'ffmpeg.exe');
export const FP = process.env.FFPROBE || path.join(ROOT, 'Workspace', 'deps', 'ffmpeg', 'ffprobe.exe');

// drawtext/libass 依赖 fontconfig。本机 ffmpeg 静态构建找不到默认 fonts.conf，
// 且沙箱下默认缓存目录不可写 —— 于是自建一份最小 fonts.conf（指向 Windows 字体目录 + 可写缓存）。
const CACHE = path.join(ROOT, 'Workspace', 'cache');
const FCDIR = path.join(CACHE, 'fontconfig');
fs.mkdirSync(FCDIR, { recursive: true });
const FCCONF = path.join(FCDIR, 'fonts.conf');
if (!fs.existsSync(FCCONF)) {
  fs.writeFileSync(FCCONF, `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>C:/Windows/Fonts</dir>
  <cachedir>${path.join(FCDIR, 'cache').replace(/\\/g, '/')}</cachedir>
  <config></config>
</fontconfig>
`);
}
const CHILD_ENV = {
  ...process.env,
  XDG_CACHE_HOME: CACHE,
  FONTCONFIG_FILE: FCCONF,
  FONTCONFIG_PATH: FCDIR,
  TMPDIR: CACHE, TMP: CACHE, TEMP: CACHE,
};

/** 执行子进程，把 stdout+stderr 落盘后读回 */
export function run(bin, args, logPath) {
  const abs = path.resolve(logPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const fd = fs.openSync(abs, 'w');
  const t0 = Date.now();
  let r;
  try { r = spawnSync(bin, args, { stdio: ['ignore', fd, fd], env: CHILD_ENV }); }
  finally { fs.closeSync(fd); }
  const text = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '';
  return { status: r.status, error: r.error ? `${r.error.code}: ${r.error.message}` : null, text, ms: Date.now() - t0, args };
}

/** ffmpeg（日志文件可直接复用为 stderr 解析源） */
export function ffmpeg(args, logPath) { return run(FF, args, logPath); }

/** ffprobe -print_format json -> 解析对象 */
export function ffprobeJson(args, logPath) {
  const r = run(FP, ['-v', 'error', '-print_format', 'json', ...args], logPath);
  try { return JSON.parse(r.text || '{}'); } catch { return {}; }
}
/** ffprobe 取单值（如 format=duration） */
export function ffprobeValue(entry, logPath) {
  const r = run(FP, ['-v', 'error', '-show_entries', entry, '-of', 'csv=p=0', ...(Array.isArray(entry) ? [] : [])], logPath);
  return String(r.text || '').trim().split('\n')[0];
}
export function durationOf(file, logPath) {
  const r = run(FP, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], logPath);
  return Number(String(r.text || '').trim()) || 0;
}
/** ffmpeg 是否支持某滤镜 */
export function hasFilter(name, logPath) {
  const r = run(FF, ['-hide_banner', '-filters'], logPath);
  return new RegExp(`\\s${name}\\s`).test(r.text);
}
