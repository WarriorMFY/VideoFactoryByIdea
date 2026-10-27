// History/probe/loop4_push_variants.mjs — 推送通道变体实验（网络抖动时试不同 TLS/HTTP 组合）
// 只做诊断：凭据同样从 Windows 凭据管理器直调 wincred 取得，不打印、不落盘。
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const CACHE = path.join(ROOT, 'Workspace', 'cache', 'pushdiag');
fs.mkdirSync(CACHE, { recursive: true });
const HELPER = 'E:/SoftWare/Git/Git/mingw32/libexec/git-core/git-credential-wincred.exe';
const REPO = 'https://github.com/WarriorMFY/VideoFactoryByIdea.git';

function readCred() {
  const inp = path.join(CACHE, 'in.txt'), outp = path.join(CACHE, 'out.txt'), errp = path.join(CACHE, 'err.txt');
  fs.writeFileSync(inp, 'protocol=https\nhost=github.com\n\n');
  const fds = [fs.openSync(inp, 'r'), fs.openSync(outp, 'w'), fs.openSync(errp, 'w')];
  let r;
  try { r = spawnSync(HELPER, ['get'], { stdio: fds, timeout: 20000, windowsHide: true }); } finally { for (const fd of fds) { try { fs.closeSync(fd); } catch {} } }
  const out = fs.existsSync(outp) ? fs.readFileSync(outp, 'utf8') : '';
  for (const p of [inp, outp, errp]) { try { fs.unlinkSync(p); } catch {} }
  const kv = Object.fromEntries(out.split('\n').map((l) => l.replace(/\r/g, '')).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
  return r && r.status === 0 && kv.password ? { user: kv.username, pass: kv.password } : null;
}

const cred = readCred();
if (!cred) { console.error('取凭据失败'); process.exit(1); }
const auth = `Authorization: Basic ${Buffer.from(`${cred.user}:${cred.pass}`).toString('base64')}`;

const VARIANTS = [
  { name: 'openssl + HTTP/2', args: ['-c', 'http.sslBackend=openssl', '-c', 'http.version=HTTP/2'] },
  { name: 'schannel + HTTP/1.1', args: ['-c', 'http.sslBackend=schannel', '-c', 'http.version=HTTP/1.1'] },
  { name: 'openssl + HTTP/1.0', args: ['-c', 'http.sslBackend=openssl', '-c', 'http.version=HTTP/1.0'] },
  { name: 'openssl + HTTP/1.1（对照）', args: ['-c', 'http.sslBackend=openssl', '-c', 'http.version=HTTP/1.1'] },
];

for (const v of VARIANTS) {
  const log = path.join(CACHE, `${v.name.replace(/[^\w]+/g, '_')}.log`);
  const fd = fs.openSync(log, 'w');
  const t0 = Date.now();
  let r;
  try {
    r = spawnSync('git', [...v.args, '-c', 'http.lowSpeedLimit=1024', '-c', 'http.lowSpeedTime=90',
      '-c', 'credential.helper=', '-C', ROOT, 'push', '--progress', '--dry-run', REPO, 'HEAD:main'], {
      stdio: ['ignore', fd, fd],
      timeout: 90000,
      killSignal: 'SIGKILL',
      windowsHide: true,
      env: { ...process.env, GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'http.extraheader', GIT_CONFIG_VALUE_0: auth, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
    });
  } finally { fs.closeSync(fd); }
  const sec = ((Date.now() - t0) / 1000).toFixed(1);
  const text = fs.readFileSync(log, 'utf8');
  const tail = text.trim().split('\n').slice(-1)[0] || '';
  console.log(`${r.status === 0 ? 'OK  ' : 'FAIL'} ${String(sec).padStart(6)}s  ${v.name.padEnd(24)} ${r.status === 0 ? 'dry-run 通过' : tail.slice(0, 110)}`);
  try { fs.unlinkSync(log); } catch {}
  if (r.status === 0) break; // 有能用的就停
}
