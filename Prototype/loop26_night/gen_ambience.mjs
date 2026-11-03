#!/usr/bin/env node
/**
 * gen_ambience.mjs — loop26 氛围音轨合成（零素材零版权，纯 PCM 手写）
 * 成分：房间底噪（低通噪声）+ 工坊风扇（120Hz+240Hz 低鸣）+ 键盘敲击簇（真实打字节奏感）
 *      + 结尾一声提示音（上线瞬间）。输出 ambience.wav（48k/立体声/16bit）。
 * 用法: node gen_ambience.mjs <总时长秒>
 */
import fs from 'node:fs';

const DUR = Number(process.argv[2] || 70);
const SR = 48000;
const N = Math.floor(DUR * SR);
const L = new Float64Array(N), R = new Float64Array(N);

// 伪随机（可复现）
let seed = 20261103;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5;

// 1) 房间底噪：一阶低通的噪声爬行
let lp = 0;
for (let i = 0; i < N; i++) {
  lp += 0.02 * (rnd() - lp);
  const fade = Math.min(1, i / (SR * 4)) * Math.min(1, (N - i) / (SR * 3));
  L[i] += lp * 0.05 * fade; R[i] += lp * 0.048 * fade;
}
// 2) 风扇低鸣：120+240Hz，极慢呼吸调幅
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const breath = 0.8 + 0.2 * Math.sin(2 * Math.PI * 0.07 * t);
  const v = (Math.sin(2 * Math.PI * 120 * t) * 0.55 + Math.sin(2 * Math.PI * 240 * t) * 0.2) * 0.022 * breath;
  L[i] += v; R[i] += v * 0.96;
}
// 3) 键盘敲击簇：集中在 8–34s 与 40–50s（写码/渲染检查段），不规则间隔，双击感
const typeWindows = [[8, 34, 0.16], [40, 50, 0.22]];
for (const [a, b, gap] of typeWindows) {
  let t = a + rnd() * gap;
  while (t < b) {
    const burst = 2 + Math.floor(rnd() * 2);           // 连击 2-3 键
    for (let k = 0; k < burst; k++) {
      const t0 = Math.floor((t + k * (0.05 + rnd() * 0.03)) * SR);
      const amp = 0.16 + rnd() * 0.10;
      const thock = 900 + rnd() * 500;                  // 键盘本体频率
      for (let j = 0; j < SR * 0.045 && t0 + j < N; j++) {
        const e = Math.exp(-j / (SR * 0.008));          // 8ms 衰减
        const click = (rnd() * 0.6 + Math.sin(2 * Math.PI * thock * j / SR) * 0.4) * e * amp;
        L[t0 + j] += click; R[t0 + j] += click * (0.85 + rnd() * 0.3);
      }
    }
    t += gap + rnd() * gap * 2.2;                        // 停顿：思考
  }
}
// 4) 上线提示音（约 92% 处一声，880+1318Hz 温铃）
const dingT = Math.floor(N * 0.92);
for (let j = 0; j < SR * 1.6 && dingT + j < N; j++) {
  const e = Math.exp(-j / (SR * 0.35));
  const v = (Math.sin(2 * Math.PI * 880 * j / SR) * 0.6 + Math.sin(2 * Math.PI * 1318 * j / SR) * 0.35) * e * 0.12;
  L[dingT + j] += v; R[dingT + j] += v;
}
// 软限幅 + 写 PCM
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVEfmt ', 8);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  const soft = (x) => Math.max(-1, Math.min(1, x)) * 0.92;
  buf.writeInt16LE(Math.round(soft(L[i]) * 32767), 44 + i * 4);
  buf.writeInt16LE(Math.round(soft(R[i]) * 32767), 46 + i * 4);
}
fs.writeFileSync('ambience.wav', buf);
console.log(`ambience.wav ${DUR}s 写出完成`);
