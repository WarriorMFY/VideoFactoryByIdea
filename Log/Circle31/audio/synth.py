"""圈 31 音轨 v1：三层合成（底噪 / 事件 / 光声），numpy 48k，零积分。

时间轴对齐 final.mp4 五镜（硬切 5/10/15/20/25s）：
  0-5   镜1 苏醒：继电器咔、电流滋啦、伺服上行、锁定
  5-10  镜2 起身：放气、液压上行、金属吱呀、站直锁定 + 落地闷响
  10-15 镜3 注视：头转咔、陀螺微嗡、面罩灯蜂鸣（留白为主）
  15-20 镜4 接光：抬掌液压、光柱低频渐强、晶体 shimmer、微粒噼啪
  20-25 镜5 入光：光峰衰减、半步落地、低频余韵、尾淡出

用法：python Log/Circle31/audio/synth.py
输出：Log/Circle31/audio/mix.wav（48k 16bit 立体声，峰值 0.88）
"""
import wave
from pathlib import Path

import numpy as np

SR = 48000
DUR = 25.0
N = int(SR * DUR)
rng = np.random.default_rng(7)
T = np.arange(N) / SR
OUT = Path(__file__).resolve().parent / "mix.wav"


def fft_filter(x, f_lo=None, f_hi=None, slope=1):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1.0 / SR)
    H = np.ones_like(f)
    if f_lo:
        r = f / f_lo
        H *= (r ** slope) / (1.0 + r ** slope)
    if f_hi:
        r = f / f_hi
        H *= 1.0 / (1.0 + r ** slope)
    return np.fft.irfft(X * H, len(x))


def add(buf, sig, t0, amp=1.0):
    n0 = int(round(t0 * SR))
    sig = np.asarray(sig) * amp
    n = min(len(sig), N - n0)
    if n > 0:
        buf[n0:n0 + n] += sig[:n]


def s_click(freq=900, dur=0.07, noise=0.6):
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = np.sin(2 * np.pi * freq * t) * np.exp(-t / (dur * 0.18))
    s += rng.standard_normal(n) * np.exp(-t / (dur * 0.06)) * noise
    return s


def s_thud(freq=62, dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = np.sin(2 * np.pi * freq * t) * np.exp(-t / 0.22)
    s += np.sin(2 * np.pi * freq * 2.71 * t) * np.exp(-t / 0.09) * 0.45
    s += rng.standard_normal(n) * np.exp(-t / 0.012) * 0.35
    return s


def s_hiss(dur=1.0, lo=900, hi=4200, att=0.15, dec=0.3):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = fft_filter(rng.standard_normal(n), lo, hi, 1)
    e = np.where(t < att, t / max(att, 1e-6), np.exp(-(t - att) / max(dec, 1e-6)))
    return x * e


def s_sweep(f0, f1, dur, wobble=7.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = f0 * (f1 / f0) ** (t / dur)
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) + 0.5 * np.sin(2 * ph) + 0.25 * np.sin(3 * ph)
    s *= 0.7 + 0.3 * np.sin(2 * np.pi * wobble * t)
    e = np.minimum(1, t / 0.35) * np.minimum(1, (dur - t) / 0.5)
    return s * e


def s_screech(fc=600, dur=0.7, idx=2.5, fm=35.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = np.sin(2 * np.pi * fc * t + idx * np.sin(2 * np.pi * fm * t + rng.uniform(0, 6.28)))
    e = np.minimum(1, t / 0.08) * np.exp(-t / (dur * 0.6))
    return s * e


def s_shimmer(dur, f0=(1200, 1800, 2400, 3000)):
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = np.zeros(n)
    for f in f0:
        s += np.sin(2 * np.pi * f * t + rng.uniform(0, 6.28)) * rng.uniform(0.4, 1.0)
    trem = 0.55 + 0.45 * np.sin(2 * np.pi * rng.uniform(7, 13) * t + rng.uniform(0, 6.28))
    s *= trem
    return s / np.max(np.abs(s))


def s_crackle(dur, count=60):
    n = int(dur * SR)
    out = np.zeros(n)
    pos = rng.uniform(0, dur, count).astype(int)
    for p in pos:
        k = min(int(0.012 * SR), n - p)
        if k > 0:
            out[p:p + k] += rng.standard_normal(k) * np.exp(-np.arange(k) / (0.002 * SR))
    return out


def s_low(freqs, dur, grow=1.6):
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = sum(w * np.sin(2 * np.pi * f * t) for f, w in freqs)
    return s * (t / dur) ** grow


# ---------------- 层 1 底噪 ----------------
bed = fft_filter(rng.standard_normal(N), 20, 130, 1) * 0.055
bed += (0.012 * np.sin(2 * np.pi * 52 * T) + 0.006 * np.sin(2 * np.pi * 104 * T))
bed *= 0.85 + 0.15 * np.sin(2 * np.pi * 0.13 * T)
bed += fft_filter(rng.standard_normal(N), 1500, 6000, 1) * 0.006
for t0 in (3.4, 7.9, 12.1, 18.0, 22.6):                        # 稀疏金属吱呀
    add(bed, s_screech(rng.uniform(380, 720), rng.uniform(0.5, 1.1), 1.8, rng.uniform(20, 45)), t0, 0.035)

# ---------------- 层 2 事件 ----------------
ev = np.zeros(N)
# 镜 1 苏醒
add(ev, s_click(880), 0.90, 0.50)
add(ev, s_hiss(1.6, 2500, 8000, 0.02, 0.50), 1.15, 0.95)
add(ev, s_click(1400), 1.05, 0.30)
add(ev, s_sweep(70, 165, 2.2, 9.0), 2.55, 0.50)
add(ev, s_click(700), 4.72, 0.25)
# 镜 2 起身
add(ev, s_hiss(0.5, 600, 2000, 0.05, 0.20), 5.35, 0.18)
add(ev, s_sweep(90, 230, 3.1, 6.5), 5.50, 0.62)
add(ev, s_screech(520, 1.3, 2.0, 28), 6.40, 0.10)
add(ev, s_click(1100), 8.55, 0.55)
add(ev, s_thud(70, 0.6), 8.56, 0.35)
add(ev, s_hiss(0.7, 800, 3500, 0.03, 0.25), 9.00, 0.07)
# 镜 3 注视
add(ev, s_click(950), 10.42, 0.30)
add(ev, s_sweep(1200, 1500, 1.6, 3.0), 11.20, 0.06)
# 镜 4 接光
add(ev, s_hiss(0.8, 700, 3200, 0.05, 0.35), 15.25, 0.22)
add(ev, s_screech(680, 0.9, 2.2, 40), 15.70, 0.06)
add(ev, s_click(1050), 15.90, 0.30)
# 镜 5 入光
add(ev, s_thud(58, 1.4), 20.52, 0.62)
add(ev, s_click(620), 20.53, 0.20)

# ---------------- 层 3 光声 ----------------
li = np.zeros(N)
add(li, s_low(((52, 0.50), (104, 0.25), (26, 0.30)), 3.7), 16.30, 0.50)   # 光柱渐强
add(li, s_shimmer(2.6), 17.40, 0.14)
add(li, s_crackle(2.6, 70), 17.40, 0.50)
n = int(0.6 * SR); t = np.arange(n) / SR                                    # 20s 光峰尾
add(li, (0.5 * np.sin(2 * np.pi * 52 * t) + 0.25 * np.sin(2 * np.pi * 104 * t)) * np.exp(-t / 0.18), 20.00, 0.45)
add(li, s_shimmer(1.4), 13.30, 0.05)                                        # 镜 3 面罩灯
add(li, s_shimmer(2.0), 20.60, 0.08)
n = int(3.0 * SR); t = np.arange(n) / SR                                    # 21–24 光余韵
add(li, (0.5 * np.sin(2 * np.pi * 52 * t) + 0.25 * np.sin(2 * np.pi * 104 * t)) * np.exp(-t / 1.4), 21.00, 0.25)

# ---------------- 混音 ----------------
mix = bed * 1.0 + ev * 0.9 + li * 0.85
fade = np.ones(N)
nf = int(0.8 * SR)
fade[-nf:] = np.linspace(1.0, 0.15, nf)
mix *= fade
mix *= 0.88 / np.max(np.abs(mix))


def write_wav(path: Path, x):
    pcm = (np.clip(x, -1, 1) * 32767).astype(np.int16)
    stereo = np.repeat(pcm[:, None], 2, axis=1)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(stereo.tobytes())


if __name__ == "__main__":
    write_wav(OUT, mix)
    print(f"-> {OUT}  {DUR}s  peak={np.max(np.abs(mix)):.3f}")
