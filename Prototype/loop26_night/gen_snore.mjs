/**
 * gen_snore.mjs v2 — 哨音式呼噜（纯 PCM 合成，零版权）
 * 形态：吸气 = 上扬的哨音（500→950Hz 弧线 + 5.5Hz 颤音），呼气 = 低一声"嘟"（380→300Hz 下滑），
 *       之间屏息顿。逐周期 ±8% 微扰防机械循环感。
 * 用法: node gen_snore.mjs [时长s] [输出.wav]   默认读 out_v2/manifest.json 的成片时长
 */
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
const SR = 48000;

let dur = parseFloat(process.argv[2]) || 0;
const OUT = process.argv[3] || path.join(HERE, 'snore.wav');
if (!dur) {
  const mf = path.join(HERE, 'out_v2/manifest.json');
  dur = JSON.parse(fs.readFileSync(mf, 'utf8')).total_s;
}
console.log(`生成 ${dur}s 哨音式呼噜循环 → ${OUT}`);

const N = Math.floor(dur * SR);
const buf = new Float32Array(N);

let seed = 98765;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff * 2 - 1;

let idx = 0, t = 0, vp = 0;   // vp: 颤音相位跨段连续
while (t < dur) {
  const jit = () => 1 + (rnd() * 0.16);
  const inhaleD = 1.55 * jit(), gap1 = 0.55 * jit();
  const exhaleD = 1.15 * jit(), gap2 = 0.85 * jit();

  // --- 吸气：上扬哨音 ---
  {
    const n = Math.floor(inhaleD * SR);
    const f0 = (500 + rnd() * 60) * jit();          // 起始音高微变
    const peak = f0 + 430 + rnd() * 60;
    const amp = 0.46 * (0.92 + rnd() * 0.16);
    let ph = 0;
    for (let i = 0; i < n && idx < N; i++, idx++) {
      const p = i / n;
      const f = f0 + (peak - f0) * Math.sin(Math.PI * Math.min(p * 1.25, 1)) * 0.92; // 升-微落弧线
      vp += (2 * Math.PI * 5.5) / SR;
      const vib = 1 + 0.013 * Math.sin(vp);          // 颤音（音高调制）
      ph += (2 * Math.PI * f * vib) / SR;
      const env = Math.min(p / 0.12, 1) * Math.min((1 - p) / 0.22, 1) ** 0.8; // 快起缓收
      const tone = Math.sin(ph) + 0.18 * Math.sin(2 * ph);                        // 基音+一点二泛音
      const breath = rnd() * 0.05;                   // 气息噪声
      buf[idx] += amp * env * (tone + breath);
    }
  }
  idx += Math.floor(gap1 * SR);

  // --- 呼气：低一声"嘟"（下滑） ---
  {
    const n = Math.floor(exhaleD * SR);
    const f0 = (370 + rnd() * 40) * jit(), f1 = 295 + rnd() * 25;
    const amp = 0.26 * (0.9 + rnd() * 0.2);
    let ph = 0;
    for (let i = 0; i < n && idx < N; i++, idx++) {
      const p = i / n;
      const f = f0 + (f1 - f0) * p;
      vp += (2 * Math.PI * 4.5) / SR;
      const vib = 1 + 0.010 * Math.sin(vp);
      ph += (2 * Math.PI * f * vib) / SR;
      const env = Math.sin(Math.PI * p) ** 0.7;
      buf[idx] += amp * env * (Math.sin(ph) + 0.12 * Math.sin(2 * ph) + rnd() * 0.04);
    }
  }
  idx += Math.floor(gap2 * SR);
  t += inhaleD + gap1 + exhaleD + gap2;
}

// 极轻房间底噪 + 首尾淡入出
for (let i = 0; i < N; i++) buf[i] += rnd() * 0.004;
const fade = Math.floor(2.0 * SR);
for (let i = 0; i < fade; i++) { buf[i] *= i / fade; buf[N - 1 - i] *= i / fade; }

let peak = 0; for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(buf[i]));
const g = peak > 0 ? 0.68 / peak : 1;

const pcm = Buffer.alloc(44 + N * 2);
pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + N * 2, 4); pcm.write('WAVE', 8);
pcm.write('fmt ', 12); pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22);
pcm.writeUInt32LE(SR, 24); pcm.writeUInt32LE(SR * 2, 28); pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34);
pcm.write('data', 36); pcm.writeUInt32LE(N * 2, 40);
for (let i = 0; i < N; i++) pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, buf[i] * g)) * 32760), 44 + i * 2);
fs.writeFileSync(OUT, pcm);
console.log(`完成：${(N / SR).toFixed(1)}s，峰值归一 0.68`);
