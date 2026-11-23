---
name: flux3-edit
description: 参考图 + 编辑提示词 → 出图的原子管线与保真度对照台。锚（原图）固定、每次只换一个改动项，测「改得动多少」与「保得住多少」的边界；每条实跑落盘任务号、prompt 快照、实扣、ssim/face_diff/sharp 三项度量。
---

# flux3-edit · 参考图 + 编辑提示词 → 图

**只跑一步**：一张参考图 + 一段编辑提示词 → 一到两张 png。不做拼图、不做批量刷、不接视频链。
它的全部价值在**对照**——锚不动，只有改动项在变，看「像不像本人 / 还是不是同一部剧」的边界落在哪一格。

> **位置**：`Skill/hub/generation/workflow/image-to-image/`。它调通道、产媒体，同输入重跑不唯一（采样），按判据归 `generation/`。
> **不是第二个网络出口**：提交仍转发给 `runninghub/scripts/runninghub_app.py`。

## 通道（写死在脚本里，不随实验变）

| 项 | 值 |
| --- | --- |
| webappId | `2114585366186516481`（Flux3图像编辑） |
| 图1 | 节点 `30:image`（**必填，唯一锚位**） |
| 图2 / 图3 | 节点 `31:image` / `71:image`（选填，**本技能不传**——多图位一开就会串味，改什么说不清） |
| 提示词 | 节点 `36:prompt`（字段名 `prompt`，多行字符串） |
| 生图数量 | 节点 `72:value`（INT，**工作流默认 2**） |
| 比例 | 节点 `34:aspect_ratio`（8 档全名，短名不认，脚本做映射） |
| 单价 | **20.06 积分／次**，一次出 **2 张**（均价 ≈ 10）——不按张计费，按提交计费 |
| 出图尺寸 | 输入 307×235 → 输出 1664×1248（按比例放大，非原尺寸） |
| 网络出口 | `Skill/hub/generation/runninghub/scripts/runninghub_app.py`——本技能不发 HTTP；脚本自动向上找仓库根，技能移动不失效 |

## 三条命令

```bash
P=Skill/hub/generation/workflow/image-to-image/flux3-edit

# 1) 跑一条
python $P/scripts/edit.py --id V1-五官 --group V1 \
  --image Log/Circle24/in/figure.png \
  --prompt-file Log/Circle24/prompt-v1.txt \
  --ar 3:4 --n 2 --out Log/Circle24

# 2) 度量一条（结构保真 / 人脸改动量 / 锐度）
python $P/scripts/measure.py --run Log/Circle24/runs/V1-五官

# 3) 看账（一条一行 JSONL，含任务号与实扣）
cat Log/Circle24/experiments.jsonl
```

## 记录契约

每次实跑在 `--out/runs/<id>/` 留四件：`ref.png`（锚的字节副本）、`prompt.txt`、`out_1.png`／`out_2.png`、`run.json`；
`measure.py` 追加 `metrics.json`。汇总行追加到 `--out/experiments.jsonl`。

`run.json` 必含：`id`／`group`／`ts`／`webapp`／`params`／`prompt`／`prompt_sha1`／`ref_sha1`／`task_id`／`charged`／`files[]`／`status`。
缺 `task_id` 或 `charged` 视为该条作废——宁可重跑，不留半条账。

## 已知的坑

1. **`72:value=1` 未生效**（Circle24 实证）：传 1 仍出 2 张。要么工作流忽略该节点，要么得用字符串传参。当前脚本默认 `--n 2` 并**按 2 张记账**；想试 1 张用 `--n 1` 并在 `run.json` 看实际出图数。
2. **标题价不可信**：应用标题里的「实测3毛4」是别家账号报价，本账号按 `usage.chargedPoint` 实扣，一律记 `charged` 原文。
3. **低分辨率输入是天花板**：307×235 进、1k 出，`sharp` 从 736 掉到 400–520 是放大的代价。**「画风完全不动」在这种输入上做不到**，只能说「看起来还是同一部剧」。
4. **字幕最先死**：同参数下 Flux3 能保住底部字幕，image2.5 会糊成色块。要接视频链只认前者的表现。
5. **全名比例**：`3:4` 必须写成 `3:4 (Portrait Standard)`，脚本已映射 8 个短名。

## 铁律

1. **单变量**：一条只改一个改动项；改两个得到「说不清是谁造成的」结论。
2. **锚不换**：同组内参考图必须逐字节一致（脚本记 `ref_sha1`，不同即警告）。
3. **一条一账**：一次提交一条记录，不并发——并发会让实扣与任务号错位。
4. **先量后看**：先出 `metrics.json` 数字，再拿眼睛评判；顺序反了会被「看起来挺像」骗。
5. **sampling 与补全分开记**：同 prompt 重跑结果不同属采样，多跑取稳；固定项漂了属提示词没锁住，要改卡不要重跑。
6. **不覆盖**：同 id 目录已存在默认拒绝，要覆盖必须显式 `--force`（Circle20 有过覆盖丢证据的事故）。
