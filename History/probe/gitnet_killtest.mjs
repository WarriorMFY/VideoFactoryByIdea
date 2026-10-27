// History/probe/gitnet_killtest.mjs — 验证本沙箱下"怎么杀子进程"才有效
// 结论（配合同目录 gitnet_killtest.log）：taskkill /T /F 退出码 1（被拒）；child.kill('SIGKILL') 3ms 生效。
// 用途：给 Tool/Git/gitnet.mjs 的超时看门狗选正确的杀法。
import { spawn } from 'node:child_process';

function trial(name, useTaskkill) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    // 10.255.255.1 是不可达地址：TCP 建连会一直挂着，正好用来测"杀得掉吗"
    const ch = spawn('git', ['-c', 'http.connectTimeout=60', 'ls-remote', 'https://10.255.255.1/foo.git'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    let killAt = null;
    const timer = setInterval(() => {
      if (Date.now() - t0 > 3000) {
        clearInterval(timer);
        killAt = Date.now();
        if (useTaskkill) {
          const k = spawn('taskkill', ['/PID', String(ch.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
          k.on('error', (e) => console.log(`  taskkill spawn error: ${e.code}`));
          k.on('exit', (c) => console.log(`  taskkill exit=${c}`));
        } else {
          const ok = ch.kill('SIGKILL');
          console.log(`  child.kill 返回 ${ok}`);
        }
      }
    }, 200);
    ch.on('exit', (code, sig) => {
      clearInterval(timer);
      console.log(`${name}: exit code=${code} signal=${sig} 存活 ${Date.now() - t0}ms${killAt ? `（kill 请求后 ${Date.now() - killAt}ms 落地）` : ''}`);
      resolve();
    });
  });
}

await trial('taskkill /T /F', true);
await trial("child.kill(SIGKILL)", false);
