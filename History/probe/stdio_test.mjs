// 验证在沙箱（禁用管道 stdio）下，用「文件描述符重定向」捕获子进程输出的可行性
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const FF = path.resolve('Workspace/bin/ffmpeg/ffmpeg.exe');
const log = path.resolve('History/probe/_stdio_test.log');

// 方式A：默认 pipe（预期在当前沙箱下失败）
const a = spawnSync(FF, ['-version'], { encoding: 'utf8' });
console.log('A pipe: status=', a.status, 'err=', a.error && a.error.code, 'stdoutLen=', (a.stdout || '').length);

// 方式B：fd 重定向到文件（预期可用）
const fd = fs.openSync(log, 'w');
const b = spawnSync(FF, ['-filters'], { stdio: ['ignore', fd, fd] });
fs.closeSync(fd);
const txt = fs.readFileSync(log, 'utf8');
console.log('B fd-redirect: status=', b.status, 'err=', b.error && b.error.code, 'bytes=', txt.length);
console.log('B has drawtext=', /\sdrawtext\s/.test(txt), 'xfade=', /\sxfade\s/.test(txt), 'freezedetect=', /freezedetect/.test(txt), 'scdet=', /\sscdet\s/.test(txt));
