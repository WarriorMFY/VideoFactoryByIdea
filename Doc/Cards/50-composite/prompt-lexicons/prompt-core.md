---
name: prompt-core
type: prompt
description: |
  介绍：覆盖主体、环境、光影、画风、意境、反向六类语义槽的中英对照出图词库。
  何时使用：当需要把卡片内容翻译成出图模型可读的 Prompt 片段时使用。
source:
  - title: 案例设定
    url: https://example.com/prompt-core
    note: v1.0
---

# 生图语义卡 · 核心词库

> 本卡是唯一不遵循五元组定序的卡片，由六张两列表构成。
> 每张表列固定为：语义槽 ｜ 英文 Prompt 片段。
> 词条只写可视觉化的描述，不写剧情与因果。

## 一、主体词库

| 语义槽 | 英文 Prompt 片段 |
| --- | --- |
| 体型 | heavy build, broad shoulders, thick torso |
| 服饰 | layered plate armor, torn crimson cape |
| 持物 | round iron shield, straight single-handed sword |
| 姿态 | low guard stance, weight on front foot |
| 表面痕迹 | scarred brow, dented pauldron, rust streaks |

## 二、环境词库

| 语义槽 | 英文 Prompt 片段 |
| --- | --- |
| 场地 | ruined stone courtyard, cracked flagstones |
| 天气 | cold overcast haze, drifting ash |
| 远景 | collapsed arcade, shattered colonnade |
| 质感 | wet stone, moss in crevices, dust film |

## 三、光影词库

| 语义槽 | 英文 Prompt 片段 |
| --- | --- |
| 主光 | hard low-key key light from upper left |
| 辅光 | faint cool bounce from wet ground |
| 轮廓光 | thin rim light tracing shoulder line |
| 氛围光 | volumetric haze, dust motes in shaft |

## 四、画风词库

| 语义槽 | 英文 Prompt 片段 |
| --- | --- |
| 流派 | dark fantasy realism |
| 笔触 | painterly edges, controlled texture |
| 渲染 | physically based shading, film grain |
| 参考 | chiaroscuro contrast, muted palette |

## 五、意境词库

| 语义槽 | 英文 Prompt 片段 |
| --- | --- |
| 情绪 | grim, oppressive, inevitable |
| 张力 | compressed space, off-balance weight |
| 节奏 | slow build, single decisive beat |
| 留白 | negative space above figures |

## 六、反向词库

| 语义槽 | 英文 Prompt 片段 |
| --- | --- |
| 材质 | plastic, glossy vinyl, paper texture |
| 解剖 | extra fingers, fused limbs, broken spine |
| 结构 | clipping, intersecting geometry, floating parts |
| 画质 | oversaturated, blown highlights, watermark |

## 填写要点

- 英文片段用小写逗号短语，不加句号，便于拼接。
- 同一语义槽只放同义的最强词，不放近义词堆砌。
- 反向词库与 `anti` 卡互补：本表放通用废词，`anti` 卡放场景专属约束。

## 校验

- [x] 六张表齐全，每表至少 4 行
- [x] 英文片段无句号、无大写开头
- [x] 全文无角色专名、无其他卡名