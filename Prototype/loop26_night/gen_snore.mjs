/**
 * gen_snore.mjs — 生成循环打呼噜音轨（纯 PCM 合成，零版权）
 * 结构：吸气（响、颤音快）→ 顿 → 呼气（轻、颤音慢）→ 顿，周期约 4s，逐周期微扰
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
console.log(`生成 ${dur}s 打呼噜循环 → ${OUT}`);

const N = Math.floor(dur * SR);
const buf = new Float32Array(N);

// 一阶低通（简易共振腔）
let lp1 = 0, lp2 = 0;
const lowpass = (x, a) => { lp1 += a * (x - lp1); lp2 += a * (lp1 - lp2); return lp2; };

let seed = 12345;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff * 2 - 1;

let t = 0, idx = 0;
let phase = 0;
while (t < dur) {
  // 每周期参数微扰 ±8%，避免机械循环感
  const jit = () => 1 + (rnd() * 0.16);
  const inhaleD = 1.25 * jit(), gap1 = 0.55 * jit();
  const exhaleD = 1.55 * jit(), gap2 = 0.75 * jit();

  // --- 吸气：更响、颤音 30Hz、腔体偏高 ---
  {
    const n = Math.floor(inhaleD * SR);
    const fF = 29 * jit(), amp = 0.52 * (0.9 + rnd() * 0.2);
    for (let i = 0; i < n && idx < N; i++, idx++) {
      const p = i / n;
      const env = Math.sin(Math.PI * p) ** 1.3;             // 驼峰包络
      phase += (2 * Math.PI * fF) / SR;
      const flutter = 0.55 + 0.45 * Math.sin(phase);         // 腭部颤动
      const raw = rnd() * flutter;
      const body = Math.sin(2 * Math.PI * (82 * jit()) * (i / SR)) * 0.35; // 低频闷响
      buf[idx] += amp * env * lowpass(raw * 0.8 + body, 0.08);
    }
  }
  idx += Math.floor(gap1 * SR);                               // 屏息顿

  // --- 呼气：更轻更长、颤音 21Hz、腔体偏低 ---
  {
    const n = Math.floor(exhaleD * SR);
    const fF = 21 * jit(), amp = 0.30 * (0.9 + rnd() * 0.2);
    for (let i = 0; i < n && idx < N; i++, idx++) {
      const p = i / n;
      const env = Math.sin(Math.PI * p) ** 0.8;
      phase += (2 * Math.PI * fF) / SR;
      const flutter = 0.5 + 0.5 * Math.sin(phase);
      const raw = rnd() * flutter;
      const body = Math.sin(2 * Math.PI * (64 * jit()) * (i / SR)) * 0.3;
      buf[idx] += amp * env * lowpass(raw * 0.6 + body, 0.05);
    }
  }
  idx += Math.floor(gap2 * SR);
  t += inhaleD + gap1 + exhaleD + gap2;
}

// 房间底噪垫底 + 首尾淡入淡出
for (let i = 0; i < N; i++) buf[i] += rnd() * 0.006;
const fade = Math.floor(2.0 * SR);
for (let i = 0; i < fade; i++) { buf[i] *= i / fade; buf[N - 1 - i] *= i / fade; }

// 峰值限幅
let peak = 0; for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(buf[i]));
const g = peak > 0 ? 0.72 / peak : 1;

// 写 16bit 单声道 wav
const pcm = Buffer.alloc(44 + N * 2);
pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + N * 2, 4); pcm.write('WAVE', 8);
pcm.write('fmt ', 12); pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22);
pcm.writeUInt32LE(SR, 24); pcm.writeUInt32LE(SR * 2, 28); pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34);
pcm.write('data', 36); pcm.writeUInt32LE(N * 2, 40);
for (let i = 0; i < N; i++) pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, buf[i] * g)) * 32760), 44 + i * 2);
fs.writeFileSync(OUT, pcm);
console.log(`完成：${(N / SR).toFixed(1)}s，峰值归一 0.72`);
