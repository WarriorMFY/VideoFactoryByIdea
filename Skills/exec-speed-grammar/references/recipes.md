# 速度语法配方模板

> 配套 [SKILL.md](SKILL.md)。这里只放可直接复制改数的配方与批量骨架。
> 全部数值来自 loop42 实测（u01 标准 3.65s / u02 快杀 2.28s / u13 仪式级 5.81s）。

## 0. 本技能用到的字段（其余字段一律不写）

```jsonc
{
  "source": { "in": 0.08, "dur": 3.65 },   // 从长源片切段时用；已成片段可省略
  "out":    { "w": 1920, "h": 1080, "fps": 60, "crf": 19 },
  "shots": [
    { "t": [0, 1.70], "speed": 1.0, "cam": { "type": "full" } },
    { "t": [1.70, 2.52], "speed": 0.65, "cam": { "type": "full" } },
    { "t": [2.52, 2.7667], "speed": 0.3, "cam": { "type": "full" } },
    { "t": [2.7667, 3.65], "speed": 1.8, "cam": { "type": "full" } }
  ]
}
```

- `t` 单位秒，**段内时间**（`source.in` 记为 0）
- `t` 相邻镜必须首尾相接，不留空隙
- `hit` 层 `t[1]` 收到**切点前 2 帧**：60fps → 切点 − 0.0333；30fps → 切点 − 0.0667
- **不写** `blur` / `label` / `cam.type=crop`：那是 L2 镜头重加工与字幕的事

## 1. A 档 · 克制（只让命中减速）

```jsonc
"shots": [
  { "t": [0, 1.70],     "speed": 1.0, "cam": { "type": "full" } },
  { "t": [1.70, 2.52],  "speed": 1.0, "cam": { "type": "full" } },
  { "t": [2.52, 2.7667],  "speed": 0.5, "cam": { "type": "full" } },
  { "t": [2.7667, 3.65],  "speed": 1.5, "cam": { "type": "full" } }
]
```

时长 = 1.70 + 0.82 + 0.49 + 0.59 = 3.60s（源 3.65s，几乎不变）

## 2. B 档 · 重击（四级递进）

```jsonc
"shots": [
  { "t": [0, 1.70],     "speed": 1.0,  "cam": { "type": "full" } },
  { "t": [1.70, 2.52],  "speed": 0.65, "cam": { "type": "full" } },
  { "t": [2.52, 2.7667],  "speed": 0.3,  "cam": { "type": "full" } },
  { "t": [2.7667, 3.65],  "speed": 1.8,  "cam": { "type": "full" } }
]
```

时长 = 1.70 + 1.26 + 0.82 + 0.49 = 4.27s（升格膨胀主要被余韵加速抵回来）

## 3. C 档 · 抽时（整体压缩）

```jsonc
"shots": [
  { "t": [0, 1.70],     "speed": 1.2, "cam": { "type": "full" } },
  { "t": [1.70, 2.52],  "speed": 1.0, "cam": { "type": "full" } },
  { "t": [2.52, 2.7667],  "speed": 0.6, "cam": { "type": "full" } },
  { "t": [2.7667, 3.65],  "speed": 2.5, "cam": { "type": "full" } }
]
```

时长 = 1.42 + 0.82 + 0.41 + 0.35 = 3.00s

## 4. 快杀三层模板（缺 buildup，最易出错）

```jsonc
"shots": [
  { "t": [0, 0.85],      "speed": 1.0,  "cam": { "type": "full" } },  // open
  { "t": [0.85, 1.0867], "speed": 0.3,  "cam": { "type": "full" } },  // hit（切点 1.12 − 0.033）
  { "t": [1.0867, 2.28], "speed": 1.8,  "cam": { "type": "full" } }   // tail
]
```

**不要**给快杀硬加一个 `buildup`：那会把 0.85–1.12 的命中窗劈成两段，命中特效被 0.65x 吃掉一半。

## 5. 批量骨架（按角色映射，不按索引）

```js
// 层角色 → 速度。roleMap 是唯一真源，禁止用 shots[i] 下标取速度
const SP = {
  A: { open: 1.0, buildup: 1.0, hit: 0.5, tail: 1.5 },
  B: { open: 1.0, buildup: 0.65, hit: 0.3, tail: 1.8 },
  C: { open: 1.2, buildup: 1.0, hit: 0.6, tail: 2.5 },
};

// units: 每个单位给出段内切点与层角色（缺层就不写该 key）
const units = [
  { id: 'u02', src: 3.85, dur: 2.28, layers: [
      { role: 'open', t: [0, 0.85] },
      { role: 'hit',  t: [0.85, 1.0867] },
      { role: 'tail', t: [1.0867, 2.28] } ] },
  { id: 'u01', src: 0.08, dur: 3.65, layers: [
      { role: 'open',    t: [0, 1.70] },
      { role: 'buildup', t: [1.70, 2.52] },
      { role: 'hit',     t: [2.52, 2.7667] },
      { role: 'tail',    t: [2.7667, 3.65] } ] },
];

for (const g of ['A', 'B', 'C']) {
  for (const u of units) {
    const shots = u.layers.map(l => ({
      t: l.t, speed: SP[g][l.role], cam: { type: 'full' },
    }));
    // 写 cfg/<g>_<id>.json → recam 渲染 → concat 拼合集
  }
}
```

## 6. 时长核算（出片前后各一次）

```js
// 期望时长；与 ffprobe 实测差 > 1 帧即配方有错
const expect = shots.reduce((s, x) => s + (x.t[1] - x.t[0]) / x.speed, 0);
```

```bash
Workspace/deps/ffmpeg/ffprobe.exe -v error -show_entries format=duration -of csv=p=0 out.mp4
```

## 7. 自检三问（每次出片前）

1. 相邻镜 `t` 是否首尾相接（无空隙、无重叠）？
2. `hit` 层 `t[1]` 是否在切点前 2 帧以内？
3. 全片最低 speed 是否落在 `hit` 层？

三问有一问答"否"，先改配方再渲染，别用成片去猜。
