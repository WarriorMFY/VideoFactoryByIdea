# make_bgm.py — 程序化节拍 BGM（零版权、可复现、与剪辑点对齐）
# 用法: python make_bgm.py bgm.json out.wav
# 层：kick 每拍 / snare 每 2 拍 / hat 每 1/2 拍 / 低频 drone / 命中冲击 / 慢放静音窗 / 段边界过门
import json, math, sys, wave, array, random

cfg = json.load(open(sys.argv[1], encoding='utf-8'))
out_path = sys.argv[2]
SR = cfg.get('sr', 48000)
DUR = cfg['dur']
BPM = cfg.get('bpm', 120)
beat = 60.0 / BPM
N = int(DUR * SR)
buf = [0.0] * N
rnd = random.Random(4242)

def add(t0, dur, fn, gain=1.0):
    """在 t0 处叠加 dur 秒的波形 fn(t)->[-1,1]，t 为相对起点秒"""
    i0 = int(t0 * SR)
    n = int(dur * SR)
    if i0 >= N:
        return
    n = min(n, N - i0)
    for k in range(n):
        buf[i0 + k] += gain * fn(k / SR)

def kick(t):
    f = 62 * math.exp(-t * 22) + 44          # 62Hz → 44Hz 下滑
    env = math.exp(-t * 26)
    return math.sin(2 * math.pi * f * t) * env

def snare(t):
    env = math.exp(-t * 32)
    noise = rnd.uniform(-1, 1) * 0.5
    tone = math.sin(2 * math.pi * 185 * t) * 0.35
    return (noise + tone) * env

def hat(t):
    env = math.exp(-t * 90)
    return rnd.uniform(-1, 1) * env

def impact(t):
    env = math.exp(-t * 3.2)
    sub = math.sin(2 * math.pi * (38 + 18 * math.exp(-t * 8)) * t)
    crack = rnd.uniform(-1, 1) * math.exp(-t * 14) * 0.6
    return (sub * 0.9 + crack) * env

def in_quiet(t):
    return any(a <= t < b for a, b in cfg.get('quietWindows', []))

# ---- 持续低频 drone（整段，静音窗内反而略升，填补留白）----
for k in range(N):
    t = k / SR
    lfo = 1.0 + 0.12 * math.sin(2 * math.pi * 0.17 * t)
    v = (math.sin(2 * math.pi * 41 * t) * 0.055
         + math.sin(2 * math.pi * 82 * t) * 0.026
         + math.sin(2 * math.pi * 123 * t) * 0.012)
    if in_quiet(t):
        v *= 1.6
    buf[k] += v * lfo

# ---- 节拍网格 ----
beat_time = 0.0
bi = 0
while beat_time < DUR - 0.05:
    if not in_quiet(beat_time):
        add(beat_time, 0.30, kick, 0.62)
        if bi % 2 == 1:
            add(beat_time, 0.20, snare, 0.30)
    # 8 分音符 hi-hat（静音窗内也抽掉）
    for half in (0.0, beat):
        tt = beat_time + half
        if tt < DUR - 0.02 and not in_quiet(tt):
            add(tt, 0.06, hat, 0.09)
    beat_time += beat
    bi += 1

# ---- 段边界过门：4 连军鼓（0.125s 间隔）----
for f0 in cfg.get('fills', []):
    for i in range(4):
        tt = f0 - 0.375 + i * 0.125
        if tt >= 0:
            add(tt, 0.14, snare, 0.22 + 0.05 * i)

# ---- 命中冲击（静音窗前缘）----
for h in cfg.get('hits', []):
    add(h, 1.6, impact, 0.95)

# ---- 尾淡出 + 软限幅 ----
fade = cfg.get('tailFade', 0.3)
for k in range(N):
    t = DUR - k / SR
    if t < fade:
        buf[k] *= max(0.0, t / fade)
peak = max(1e-9, max(abs(v) for v in buf))
scale = 0.89 / peak
pcm = array.array('h', (int(max(-1.0, min(1.0, v * scale)) * 32767) for v in buf))
with wave.open(out_path, 'wb') as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f'BGM: {out_path}  {DUR:.3f}s  peak={peak:.3f} scaled={scale:.3f}')
