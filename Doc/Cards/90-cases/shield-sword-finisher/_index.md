# 用例 · 盾剑处决 · 咽喉刺

本目录是「11 种卡片全覆盖」的参考实现，用于验证零外链装配流程。
`_index.md` 与 `prompt-final.md` 不是卡片，不参与单卡检索。

## 一、卡片清单

| # | type | name | 槽位 | 关键帧数 |
| --- | --- | --- | --- | --- |
| 1 | `composite` | `composite-shield-sword-finisher` | 总控 | — |
| 2 | `figure` | `figure-shield-swordsman` | `figures[0]` | 6 |
| 3 | `figure` | `figure-light-enemy` | `figures[1]` | 6 |
| 4 | `face` | `face-shield-swordsman` | `faces[0]` | 6 |
| 5 | `style` | `style-dark-fantasy` | `moods[0]` | 6 |
| 6 | `action` | `action-shield-sword-thrust` | `actions[0]` | K0–K4 |
| 7 | `camera` | `camera-shield-sword-thrust` | `cameras[0]` | K0–K3 |
| 8 | `voiceover` | `voiceover-shield-finisher` | `voiceovers[0]` | E0–E3 |
| 9 | `time-scale` | `time-scale-shield-finisher` | `time_scales[0]` | T0–T3 |
| 10 | `ui` | `ui-shield-finisher` | `ui[0]` | E0–E3 |
| 11 | `anti` | `anti-shield-finisher-plastic` | `anti[0]` | 5 风险 |
| 12 | `prompt` | `prompt-core` | 词库 | 6 表 |
| 13 | — | `prompt-final` | 产物 | — |

## 二、角色位解析

| 角色位 | 解析结果 |
| --- | --- |
| 主体A | `figure-shield-swordsman`（施动方） |
| 主体B | `figure-light-enemy`（受动方） |
| 面部 | `face-shield-swordsman` 对应主体A |

## 三、时间轴对齐

| 时刻 | 动作卡 | 镜头卡 | 时间缩放卡 | UI 卡 | 旁白卡 |
| --- | --- | --- | --- | --- | --- |
| 0% | K0 起手 | K0 起幅 中景 | — | — | E0 屏息 |
| 30% | K1 接触 | K1 中近景跟随 | T0 触发 0.2x | E0 弹出 | E1 出声 |
| 40% | — | 推进中 | T1 保持 | E1 放大 | — |
| 55% | K2 峰值 | K2 特写低角度 | T1 保持 | E2 保持 | E2 落点 |
| 80% | — | — | T2 爬升 | E3 前 | — |
| 85% | K3 收势 | — | T2 恢复中 | — | — |
| 100% | K4 复位 | K3 落幅 俯拍 | T3 恢复 1.0x | E3 消散 | E3 收尾 |

## 四、装配顺序

| 步 | 加载内容 | 本用例对应 |
| --- | --- | --- |
| 1 | 解析 references 九键 | `composite-shield-sword-finisher` |
| 2 | 静态资产 moods → figures → faces | `style-dark-fantasy` → 两张 figure → `face-shield-swordsman` |
| 3 | 表演层 actions → cameras → voiceovers | 动作 → 镜头 → 旁白 |
| 4 | 时序层 time_scales → ui | 子弹时间 → 处决提示 |
| 5 | 质检层 anti | `anti-shield-finisher-plastic` |
| 6 | 产出 prompt-final | `prompt-final.md` |

## 五、本用例验证的约束

| 约束 | 验证点 |
| --- | --- |
| 零外链 | 九张基础卡内无任何卡名，实体全部为 `主体A`/`主体B` |
| type = 前缀 | 12 张卡的 name 前缀与 type 全部一致 |
| 单一真相 | 盾与剑的先后关系只写在联合卡的「冲突说明」中 |
| 锚点对齐 | 动作 K2 = 镜头 K2 = 时间缩放 T1 区间内 |
| 质检回环 | 反向卡指明退回装配第 4 步 |