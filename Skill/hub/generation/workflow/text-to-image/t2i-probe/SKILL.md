---
name: t2i-probe
description: 提示词生图的原子管线与对照实验台。档位（比例/分辨率）固定、每次只换提示词，测 G-2.0 低价通道的表现边界；每条实跑落盘任务号、prompt 快照、实扣、单图度量（清晰度/色彩/镜像对称度）。无锚图——通道写死 2046794551444119554（全能图片G-2.0-文生图-低价渠道版）。
---

# t2i-probe · 提示词 → 图

**只跑一步**：一段提示词 + 固定档位 → 一张 png。不接参考图、不做批量刷、不接视频链。
它的全部价值在**对照**——档位不动，只有提示词在变，看「这条低价通道到底能不能出这张卡」的边界落在哪。

> **位置**：`Skill/hub/generation/workflow/text-to-image/`。它调通道、产媒体，同输入重跑不唯一（采样），按判据归 `generation/`。
> **不是第二个网络出口**：提交仍转发给 `runninghub/scripts/runninghub_app.py`，脚本自动向上找仓库根，技能移动不失效。

## 通道（写死在脚本里，不随实验变）

| 项 | 值 |
| --- | --- |
| webappId | `2046794551444119554`（全能图片G-2.0-文生图-低价渠道版） |
| 提示词 | 节点 `18:prompt` |
| 比例 | 节点 `18:aspectRatio`（接受短形式 `16:9`，不需要全名） |
| 分辨率 | 节点 `18:resolution`（仅 `1k`／`2k`／`4k`，1k 最低档） |
| 单价 | (16:9·1k) 10.72–12.10 积分/张（均值 11.67）；(3:4·1k) 11.23/张，输出 880×1184 |
| 每跑张数 | **1 张/次**（与 Flux3 通道的出 2 张不同） |
| 耗时 | ≈35s/次 |
| 副作用 | **倾向镜像对称构图**（Circle4 §33.4 实测）；不对称动作卡需注意 |
| 第二档 | `2061698064745852930`（19.60/张，+77% 价，**无镜像倾向**）——换通道须走 channels.md 纪律 |
| 边界 | 仅 3 个节点，**无图输入**，做不了 img2img/inpainting（Circle15 结论） |

历史验证：Circle4（11.08，Task `2121565958056398849`）、Circle10 free（880×1184，11.23，Task `2122362571318329346`）、Circle11 六张（11.05–11.65）、Circle12（10.90）、Circle13/21/23 沿用。

## 三条命令

```bash
P=Skill/hub/generation/workflow/text-to-image/t2i-probe

# 1) 跑一条（提示词 + 固定档位）
python $P/scripts/probe.py --id P1-地形 --group P1 \
  --prompt-file Log/Circle28/t2i/prompts/P1-地形.txt \
  --ar 16:9 --res 1k --out Log/Circle28/t2i

# 2) 度量一张（尺寸核对 + 清晰度/色彩 + 镜像对称度）
python $P/scripts/measure.py --run Log/Circle28/t2i/runs/P1-地形

# 3) 看账（一条一行 JSONL，含任务号与实扣）
cat Log/Circle28/t2i/experiments.jsonl
```

## 记录契约

每次实跑在 `--out/runs/<id>/` 留三件：`prompt.txt`、`out.png`、`run.json`；
`measure.py` 追加 `metrics.json`。汇总行追加到 `--out/experiments.jsonl`。

`run.json` 必含：`id`／`group`／`ts`／`webapp`／`params`（`aspect_ratio`、`resolution`）／`prompt`／`prompt_sha1`／`task_id`／`charged`／`file`／`status`。
缺 `task_id` 或 `charged` 视为该条作废——宁可重跑，不留半条账。**t2i 没有 anchor 字段**。

## 已知的坑

1. **镜像对称倾向**：本通道爱出左右镜像构图，不对称动作（出拳、侧身）要警惕——`measure.py` 的 `mirror_ncc` 就是量这个的。
2. **分辨率档位少**：只有 1k/2k/4k，没有中间档；1k 的输出尺寸随比例变（3:4 → 880×1184，16:9 → 按实测记录）。
3. **价格有落点差**：10.72–12.10 同档浮动，只记每次实扣。
4. **无图输入**：三条节点就是全部；要 img2img 去 `../image-to-image/i2i-probe/`（Flux3 通道，出 2 张）或全能图片V2 工作流。
5. **每次输出都是新样本**：同 prompt 不可复现，必须留 prompt 快照与 sha1。

## 判据

数字怎么量、多少算「过」见 [`reference/judging.md`](reference/judging.md)。核心差异：t2i **无锚**，判据是——尺寸核对、清晰度带、镜像对称度、物件完成度（人工）。

## 铁律

1. **单变量**：一条只改一个维度（提示词或档位，二选一）。
2. **组内档位锁死**：同组 `aspectRatio/resolution` 必须一致（脚本查 jsonl 报警），跨档不可比。
3. **一条一账**：一次提交一条记录，不并发——并发会让实扣与任务号错位。
4. **先量后看**：先出 `metrics.json` 数字，再拿眼睛评判。
5. **失败也是结果**：模型没画出来要写成「边界点」，不是「实验失败重跑」。
6. **换通道停步**：想用第二档（`2061698064745852930`）或换通道，先改 `../README.md` 的通道表与脚本默认值，不临时改。
