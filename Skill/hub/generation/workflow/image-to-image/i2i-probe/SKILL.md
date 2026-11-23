---
name: i2i-probe
description: 图生图（锚图 + 编辑提示词 → 图）的原子管线与固定变量对照实验台。锚固定、一条只改一个变量，测「目标变量变没变、其余漂没漂」；每条实跑落任务号、prompt 快照、实扣与度量，产出三联对照与实验报告。
---

# i2i-probe · 锚图 + 编辑提示词 → 图

**只跑一步**：一张锚图 + 一段编辑提示词 → 一到两张 png。不拼图、不接视频链、不批量刷。
全部价值在**对照**——锚不动，只有目标变量在变，看「只改该改的」边界落在哪一档。
位置 `Skill/hub/generation/workflow/image-to-image/`；**不是第二个网络出口**，提交转发给 `runninghub/scripts/runninghub_app.py`。

## 通道（写死）

| 项 | 值 |
| --- | --- |
| webappId | `2114585366186516481`（Flux3图像编辑） |
| 节点 | 锚 `30:image`／提示词 `36:prompt`／数量 `72:value`（默认 2）／比例 `34:aspect_ratio`（8 档全名，脚本映射短名） |
| 单价 | ≈20.06 积分／次，按提交计费（出 2 张，均价 ≈10） |

## 三条命令

```bash
P=Skill/hub/generation/workflow/image-to-image/i2i-probe
python $P/scripts/run.py --id A-V1-近 --group A-V1 --var 景别 --level 近景 \
  --anchor Log/Circle27/anchors/A-scene.png --prompt-file Log/Circle27/prompts/A-V1-近.txt \
  --ar 16:9 --n 2 --out Log/Circle27 --budget 600
python $P/scripts/measure.py --run Log/Circle27/runs/A-V1-近
python $P/scripts/sheet.py --root Log/Circle27 --group A-V1
```

## 记录契约

`runs/<id>/`：`anchor.png`、`prompt.txt`、`out_*.png`、`run.json`、`metrics.json`。
`run.json` 必含 `id/group/variable/level/ts/webapp/params/prompt_sha1/anchor_sha1/task_id/charged/files[]/status`；缺 `task_id` 或 `charged` 作废。
变量与档位见 `reference/matrix.md`；阈值见 `reference/judging.md`。

## 铁律

单变量（一条只改一个维度）／锚不换（同组逐字节一致）／一条一账（不并发）／先量后看（先 `metrics.json` 再看 sheet）／失败也是结果（写成边界点，不重跑）。
