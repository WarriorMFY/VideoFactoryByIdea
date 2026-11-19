---
name: stage-03-repaint
description: 逐段把首帧与卡投给首帧图生视频通道，取回 5 秒级片段并记消耗。当卡与首帧都准备好、要真正花积分出片时使用；首帧没验过构图、或预算余额不足以覆盖整轮的段数时不适用。
---

# ③ 重绘

一段一条任务。首帧进图位，卡与提示词合成本文进文本位，时长走通道档位。

## 步骤

1. **核余额**：`python scripts/ledger.py --ledger ledger.json status`。余额不足覆盖「剩余段数 × 单条估价」就停，先问用户（估价见 `reference/channel-i2v.md`）。
2. **逐段出片**：
   ```
   python scripts/run_one.py --image keys/<段>-first-f<n>.png \
       --prompt prompts/<段>.txt --out out/<段>.mp4 --mp 0.92 --dur 5
   ```
   命令行会打印 `TASK`、`charged`、前后余额，并把同样内容写进 `out/<段>.run.json`。
3. **记账**：`python scripts/ledger.py --ledger ledger.json --before <任务前余额> add <段> <charged> <备注>`。
4. **不连续检查**：单段失败（无产物、超时）就单独重跑那一段，不要重跑整轮。

## 参数取舍

节点名、档位、`megapixels` 与时长、以及各档实测价，全部在 `reference/channel-i2v.md`。本节只给选择原则：

- 要**与源片分辨率对齐**取高档，要**便宜试错**取低档，两者不要混在同一轮对照里。
- 时长按段长向上取最近的档位，超出的部分在 ④ 裁掉。
- 一轮之内参数必须一致，否则测出来的差异分不清是卡造成的还是档位造成的。

## 通过线

- 每段都有 `out/<段>.mp4` 与 `out/<段>.run.json`。
- 无「产物为空」或「任务失败」的段留在轮内。
- 账本条目数与段数相等，且 `charged` 全部非空。

## 产物

`out/<段>.mp4`、`out/<段>.prompt.txt`、`out/<段>.run.json`、`ledger.json`。
