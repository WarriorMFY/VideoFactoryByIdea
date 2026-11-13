# 出图 Prompt · 盾剑处决 · 咽喉刺

> 本文件是装配产物，不是卡片，不参与单卡检索。
> 来源：`composite-shield-sword-finisher` 及其九个槽位。
> 拼装规则：画风打头定调 → 主体 → 动作 → 时序与 UI → 反向约束收尾。

## 一、正向 Prompt

> dark fantasy realism, cinematic lighting, cold overcast haze, ruined stone courtyard,
> heavily armored swordsman in dark grey plate armor with a torn crimson cape, round iron shield
> in the left hand and a straight silver sword in the right, facing a lean enemy in grey-brown
> leather armor with a bare exposed throat, the swordsman charges forward and slams the shield rim
> into the enemy's chest, the enemy staggers back, in the exact moment of impact a one-second
> bullet time at 0.2x begins and a glowing white circle execution prompt appears above the enemy's
> head, the swordsman twists his torso forty-five degrees, pulls the shield back by eight
> centimeters and thrusts the sword directly into the enemy's throat in one fluid motion,
> low-key hard key light from upper left, thin rim light on the shoulder line, volumetric haze,
> dust motes, film grain, physically based shading, 50 mm lens, f/2.0, low angle close-up at the
> peak frame, shallow depth of field, chiaroscuro contrast, muted palette

## 二、反向 Prompt

> --no plastic, vinyl sheen, uniform matte, clipping, intersecting geometry, sword through shield,
> hidden throat, fused neck, broken clavicle, flat lighting, cartoon outline, cel shading,
> oversaturated, blown highlights, extra fingers, watermark

## 三、分卡映射

| Prompt 段落 | 来源卡 |
| --- | --- |
| dark fantasy realism … chiaroscuro contrast, muted palette | `style-dark-fantasy` + `prompt-core` 画风与光影槽 |
| heavily armored swordsman … straight silver sword | `figure-shield-swordsman` + `prompt-core` 主体槽 |
| lean enemy … bare exposed throat | `figure-light-enemy` |
| charges forward … slams the shield rim into the chest | `action-shield-sword-thrust` K0–K1 |
| one-second bullet time at 0.2x | `time-scale-shield-finisher` T0–T1 |
| glowing white circle execution prompt above the head | `ui-shield-finisher` E1–E2 |
| twists his torso … pulls the shield back by eight centimeters | `action-shield-sword-thrust` K2 + 联合卡冲突说明 |
| 50 mm lens … low angle close-up | `camera-shield-sword-thrust` K2 |
| --no plastic … watermark | `anti-shield-finisher-plastic` + `prompt-core` 反向槽 |

## 四、未进入 Prompt 的卡

| 卡 | 原因 |
| --- | --- |
| `face-shield-swordsman` | 峰值帧为侧向低角度，面部不可辨；仅在正面特写分镜中启用 |
| `voiceover-shield-finisher` | 声音不参与静帧出图；仅在分镜表与视频合成阶段使用 |

## 五、复用说明

`action-shield-sword-thrust`、`time-scale-shield-finisher`、`ui-shield-finisher`、
`anti-shield-finisher-plastic` 四张卡不含任何角色信息，可直接被其他联合卡复用。
若换成匕首暗杀场景，只需新建一张联合卡替换 `figures` 与 `cameras`，这四张卡无需改动。