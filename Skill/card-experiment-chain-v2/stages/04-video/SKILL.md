---
name: 04-video
description: 卡片实验链第④阶段——按通道与时长索引发视频、快照随片落盘、用 diff 找硬切点、抽帧判读、写 manifest 与账本并归档成链。当③的图已过 70% 覆盖线、要出视频验证运镜与切分时使用；图未过线或只想看单帧效果时不用。
---

# 阶段④ 文生视频与归档

## 何时用

- ③ 图已过 70% 覆盖线，要验运镜、切分、时长。
- 已有链要补样本或复验。

## 何时不用

- 图未过线 → 回 ③ 改卡，不许先烧视频积分。
- 只想比对静态图差异 → 属判读，不启动本阶段。

## 四个动作

1. **出片**：`scripts/run_video.py`，通道与节点见 `reference/channels.md`；时长只能取通道支持的档（`1`=5s／`5`=9s／`6`=10s），不许自造。
2. **落快照**：`<tag>.mp4.prompt.txt` 必须与片子同时落盘——无快照视为未发送，事后无法归因。
3. **判读**：`scripts/diff.py` 出客观切点（帧号、秒数、峰值），`scripts/sheet.py` 抽帧拼条供人看；脚本只出数，不下结论。
4. **归档**：按 `reference/archive.md` 写 `manifest.json`（卡 sha1、任务、消耗、产物、切点），账本走 `scripts/ledger.py`。

## 交付物

| 项 | 位置 |
| --- | --- |
| 视频与快照 | `video/<tag>.mp4`、`<tag>.mp4.prompt.txt` |
| 诊断 | `_diag/` 抽帧、拼条、diff 输出 |
| 清单 | `manifest.json`（`verdict.pass` 只能由人填，AI 填 `null`） |
| 账本 | `Log/Circle<id>/ledger.json` |

## 通过线

三件齐了才算完链：链内能离线复现（卡＋快照＋产物＋切点）；账本与 manifest 对得上；用户明确说过「过」。

## 边界

技能终止于「候选」——卡入 `RAG/`、经验进 `evidence/`，都必须用户逐条点头；不建轮、不结轮。
