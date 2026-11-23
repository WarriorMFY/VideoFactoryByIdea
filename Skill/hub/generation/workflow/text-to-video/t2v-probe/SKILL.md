---
name: t2v-probe
description: 提示词生视频的原子管线与对照实验台。档位（时长/分辨率/比例）固定、每次只换提示词，测这条通道能实现的最大技术边界；每条实跑落盘任务号、prompt 快照、实扣、分区运动度量。无首帧锚——通道写死 2085304953094107137（加速版 MiniMax H3）。
---

# t2v-probe · 提示词 → 视频

**只跑一步**：一段提示词 + 固定档位 → 一条 mp4。不接首帧、不传参考图、不做剪辑编排。
它的全部价值在**对照**——档位不动，只有提示词在变，看边界落在哪一格。

> **位置**：`Skill/hub/generation/workflow/text-to-video/`。调通道、产媒体，同输入重跑不唯一（采样），按判据归 `generation/`。
> **不是第二个网络出口**：提交仍转发给 `runninghub/scripts/runninghub_app.py`，脚本自动向上找仓库根，技能移动不失效。

## 通道（写死在脚本里，不随实验变）

| 项 | 值 |
| --- | --- |
| webappId | `2085304953094107137`（加速版-MiniMax H3） |
| 提示词 | 节点 `250:prompt`（字段名 `prompt`） |
| 时长 | `205:select`（**1-11 = 5s-15s，每秒一档**，是索引不是秒值：`5` 是 9s，`1` 才是 5s） |
| 分辨率 | `225:select`（`1`=480P、`2`=720P；脚本收 `480p/720p`） |
| 比例 | `115:aspect_ratio`（8 档全名，脚本做映射） |
| 不传的位 | `231`-`239:image`（9 个多参参考图位——一开就串味，改什么说不清）；`247`-`249:audio`（3 个音频位，语义未验） |
| 单价 | (480P·5s) 10.54-24.33 积分/条，**同参数也跳档**（10.54 vs 20.57、11.22 vs 24.33），只记每次实扣；(480P·9s) 22.61-29.58；Circle11 强镜头锁 5s=17.00、9s=23.63 |
| 产出 | 640×832 / 124 帧 / 5.17s（5s 档实测，Task `2122309321877577729`） |

历史验证：Circle4-6、Circle10-12 实跑；Circle11 产物 `Log/Circle11/文生视频/terrain-huangfeng-valley/`；Circle15 评估切段方案后因 i2v 更可控转走（i2v 贵近一倍）。

## 三条命令

```bash
P=Skill/hub/generation/workflow/text-to-video/t2v-probe

# 1) 跑一条（提示词 + 固定档位）
python $P/scripts/probe.py --id T1-推镜 --group T1 \
  --prompt-file Log/Circle28/t2v/prompts/T1-推镜.txt \
  --dur 5 --res 480p --ar 16:9 --out Log/Circle28/t2v

# 2) 度量一条（时长核对 + 3×3 分区运动曲线）
python $P/scripts/measure.py --run Log/Circle28/t2v/runs/T1-推镜

# 3) 看账（一条一行 JSONL，含任务号与实扣）
cat Log/Circle28/t2v/experiments.jsonl
```

## 记录契约

每次实跑在 `--out/runs/<id>/` 留三件：`prompt.txt`、`out.mp4`、`run.json`；
`measure.py` 追加 `metrics.json` + `zones.png`。汇总行追加到 `--out/experiments.jsonl`。

`run.json` 必含：`id`／`group`／`ts`／`webapp`／`params`（含 `dur`、`dur_index`、`res`、`aspect_ratio`）／`prompt`／`prompt_sha1`／`task_id`／`charged`／`file`／`status`。
缺 `task_id` 或 `charged` 视为该条作废——宁可重跑，不留半条账。**t2v 没有 anchor 字段**，不必照抄 i2v 的记录契约。

## 已知的坑

1. **`205:select=5` 不是 5 秒**（index 5 = 9s）；模型侧硬下限 5s，3-5s 剪点的素材会被拉长（Circle15 实证）。
2. **同参数跳档**：价格随机落点，不按参数推算，逐条记账。
3. **9 图位 + 3 音频位默认不传**：测多参参考属另一个实验假设，须单独开组并在 `run.json` 注明。
4. **每次输出都是新样本**：同 prompt 不可复现，必须留 prompt 快照与 sha1。
5. **段边界服从模型**：剪辑侧 3-5s 一切与模型 5s 下限对撞时，段长听模型的（Circle15）。

## 判据

数字怎么量、多少算「动了」算「锁住」见 [`reference/judging.md`](reference/judging.md)。核心差异：t2v **无锚**，判据只剩三样——时长偏差、运动档位、事件完成度；别拿 i2v 的 NCC 表硬套。

## 铁律

1. **单变量**：一条只改一个维度（提示词或档位，二选一）。
2. **组内档位锁死**：同组 `dur/res/ar` 必须一致（脚本查 jsonl 报警），跨档不可比。
3. **一条一账**：一次提交一条记录，不并发——并发会让实扣与任务号错位。
4. **先量后看**：先出 `metrics.json` 数字，再拿眼睛评判。
5. **失败也是结果**：模型没做出来要写成「边界点」，不是「实验失败重跑」。
6. **无锚不冒充有锚**：t2v 判据里没有「锚强度」这项，那是 i2v 的事。
