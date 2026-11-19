---
name: i2v-probe
description: 首帧+提示词生视频的原子管线与对照实验台。锚（首帧）固定、每次只换提示词，逐组测这条通道能实现的最大技术边界；每条实跑落盘任务号、prompt 快照、实扣、分区度量，供 dashboard 汇总。
---

# i2v-probe · 首帧 + 提示词 → 视频

**只跑一步**：一张首帧图 + 一段提示词 → 一条 mp4。不拆阶段、不做剪辑编排、不批量刷图。
它的全部价值在**对照**——锚不动，只有提示词在变，看边界落在哪一格。

> **位置**：`Skill/hub/generation/`。它调通道、产媒体，同输入重跑不唯一（采样），按判据归 `generation/`。
> **不是第二个网络出口**：提交仍转发给 `runninghub/scripts/runninghub_app.py`。

## 通道（写死在脚本里，不随实验变）

| 项 | 值 |
| --- | --- |
| webappId | `2113790012012720129`（MiniMax+H3+首帧图生视频） |
| 首帧 | 节点 `140:image`（**唯一图位，无尾帧入口**） |
| 提示词 | 节点 `142:value`（字段名 `value`，不是 `prompt`） |
| 时长 | 节点 `133:value`（浮点秒，非档位） |
| 画幅／分辨率 | `115:aspect_ratio`／`115:megapixels`（`0.6` 为最低常用档） |
| 单价 | (3:4·0.6MP·5s) ≈ 21.4 积分／条；按上限估，不按秒线性推 |
| 网络出口 | `Skill/hub/generation/runninghub/scripts/runninghub_app.py`——本技能不发 HTTP；脚本自动向上找仓库根，技能移动不失效 |

## 三条命令

```bash
P=Skill/hub/generation/i2v-probe

# 1) 跑一条（锚 + 提示词 + 固定档位）
python $P/scripts/probe.py --id M1-大动 --group M1 \
  --frame Log/Circle20/probe/anchor.png \
  --prompt-file Log/Circle20/probe/prompts/M1-大动.txt \
  --dur 5 --ar 3:4 --mp 0.6 --out Log/Circle20/probe

# 2) 度量一条（首帧锚强度 + 3×3 分区 + 运动曲线）
python $P/scripts/measure.py --run Log/Circle20/probe/runs/M1-大动

# 3) 看汇总（本地网页，双击即可，无需服务）
start $P/dashboard/index.html
```

## 记录契约

每次实跑在 `--out/runs/<id>/` 留四件：`anchor.png`、`prompt.txt`、`out.mp4`、`run.json`；
`measure.py` 追加 `metrics.json` + `zones.png`。汇总行追加到 `--out/experiments.jsonl`，dashboard 读它。

`run.json` 必含：`id`／`group`／`ts`／`webapp`／`params`／`prompt`／`prompt_sha1`／`anchor_sha1`／`task_id`／`charged`／`file`。
缺 `task_id` 或 `charged` 视为该条作废——宁可重跑，不留半条账。

## 设计读哪

- 跑哪几组、每组假设与预期失败点 → `reference/matrix.md`
- 数字怎么量、多少算「动了」算「锁住」 → `reference/judging.md`

## 铁律

1. **单变量**：一条只改一个维度；改两个会得到「说不清是谁造成的」结论。
2. **锚不换**：同组内锚必须逐字节一致（脚本记 `anchor_sha1`，不同即报警）。
3. **一条一账**：一条一次提交，不并发、不批量——并发会让实扣与任务号错位。
4. **先量后看**：先出 `metrics.json` 数字，再人工看片；顺序反了会被全幅均值骗（Circle15 实证）。
5. **失败也是结果**：模型没做出来要写成「边界点」，不是「实验失败重跑」。
