# -*- coding: utf-8 -*-
"""全量验收 + BGM 命中点核算（final50 链）"""
import csv, io, json

cuts = {}
try:
    for r in csv.reader(io.open('probe/cuts_all.csv', encoding='utf-8-sig')):
        if r and r[0].startswith('u'):
            cuts.setdefault(r[0], []).append(float(r[1]))
except FileNotFoundError:
    print('cuts_all.csv 不存在')

FPS = 60
TOL = 2 / FPS
ids = ['u05', 'u30', 'u11', 'u17', 'u39', 'u40', 'u41', 'u45', 'u22', 'u46']
tot_out = 0.0
tot_slow = 0.0
hits_out = []
cum = 0.0
print('单位  层边界vs切点        0.3x输出  总输出  占比')
for uid in ids:
    cfg = json.load(io.open(f'cfg/{uid}_B.json', encoding='utf-8'))
    cs = [t for t in cuts.get(uid, []) if 0 <= t < cfg['source']['dur']]
    warn = []
    out = 0.0
    slow = 0.0
    t = 0.0
    for sh in cfg['shots']:
        a, b = sh['t']
        sp = sh['speed']
        dur = (b - a) / sp
        out += dur
        t += dur
        if sp in (0.3, 0.65):
            for c in cs:
                if abs(a - c) < TOL or abs(b - c) < TOL:
                    warn.append(f'{a:.3f}~{c:.3f}')
        if sp == 0.3:
            slow += dur
    tot_out += out
    tot_slow += slow
    t = 0.0
    for sh in cfg['shots']:
        a, b = sh['t']
        sp = sh['speed']
        dur = (b - a) / sp
        if sp == 0.3:
            hits_out.append(round(cum + t, 4))
        t += dur
    n = len(cs)
    tag = 'WARN:' + str(warn) if warn else 'OK'
    print(f'{uid}  切点{n}个 {tag}   {slow:.3f}s  {out:.3f}s  {slow / out * 100:.1f}%')
    cum += out
print(f'合计 0.3x 占比 {tot_slow / tot_out * 100:.1f}%  总输出 {tot_out:.3f}s')
print('hits =', ','.join(str(h) for h in hits_out))
