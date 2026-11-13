---
name: composite-shield-sword-finisher
type: composite
description: |
  介绍：联合重甲持盾剑士与轻甲敌人的盾撞刺喉处决，涵盖子弹时间、处决提示与一气呵成的长镜头。
  何时使用：需要生成该完整处决场景的分镜、关键帧表或出图 Prompt 时使用。
references:
  figures: [figure-shield-swordsman, figure-light-enemy]
  faces: [face-shield-swordsman]
  moods: [style-dark-fantasy]
  actions: [action-shield-sword-thrust]
  cameras: [camera-shield-sword-thrust]
  voiceovers: [voiceover-shield-finisher]
  time_scales: [time-scale-shield-finisher]
  ui: [ui-shield-finisher]
  anti: [anti-shield-finisher-plastic]
---

# 联合卡 · 盾剑处决 · 咽喉刺

> 本卡是基础卡之间**唯一**的绑定点。基础卡内无任何外链，装配信息全部集中于此。
> `references` 已穷举九个槽位，无空槽。

| 联合维度（自变量：绑定/阶段/关系） | 联合状态（因变量：实例化描述与相互作用） |
| --- | --- |
| 实体映射 / 0 | 主体A=figure-shield-swordsman；主体B=figure-light-enemy；面部=face-shield-swordsman 对应主体A；冲突说明=主体A左手持盾右手持剑，盾必须先回撤 8 cm 才能出剑，故动作卡 K2 的「盾回撤」为硬约束而非修饰 |
| 事件序列 / 1 | 阶段1=子弹时间与处决提示同时触发、盾缘接触；阶段2=盾回撤、剑刺咽喉、镜头推至特写；阶段3=抽剑、主体B倒地、镜头拉回俯拍；因果联动=盾撞使主体B后仰 15° 致咽喉暴露，主体A拧腰 45° 将直线推力转为刺击 |
| 氛围统合 / 2 | 意境覆盖=style-dark-fantasy；画风统合=暗黑写实、低饱和青灰、硬光高对比；色彩倾向=铁灰主调 + 暗红披风 + 冷白高光 |
| 质检回环 / 3 | 挂载 anti=anti-shield-finisher-plastic；触发条件=出图后出现剑穿盾、盾牌塑料感或咽喉被遮挡；不合格退回步骤=退回装配第 4 步，重跑动作卡 K1–K2 与镜头卡 K2 |

## 槽位与装配

| 实体位 | 解析结果 |
| --- | --- |
| 主体A | figure-shield-swordsman |
| 主体B | figure-light-enemy |
| 面部归属 | 主体A（face-shield-swordsman） |

装配顺序见 `00-spec/reference-graph.md` 第四节。

## 填写要点

- 联合卡只做绑定与因果，**不复写**形象或动作的具体数值，避免双份真相。
- 事件序列最多 3 阶段，本卡为 3 阶段。
- 「质检回环」明确退回第 4 步，而非笼统「重新生成」。
- 九个键在 frontmatter 中全部出现，无 `[]` 空槽。

## 校验

- [x] `references` 九键齐全，无空槽
- [x] 每个必填槽位非空
- [x] 每个 name 的 type 与槽位一致
- [x] 动作卡中的 `主体A`/`主体B` 已在实体映射中解析
- [x] 主表未出现 `外形=` 或 `K0` 之类子卡专属字段