# 验收记录（自动生成）

生成时间：2026-10-27T07:25:06.895Z  
命令：`node Tool/acceptance/run_acceptance.mjs`

## 结论

- **synth**：PASS
- **real**：PASS

## 明细

| 用例 | 真值应切 | 实际切 | 过切 | 漏切 | IoU | 最大边界误差 | 成片时长 | 成片规格 | 响度 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| synth | 10s | 10s | 0s | 0s | 1 | 0s | 31.621s | 1280x720 h264/High 30/1 | -15.9 LUFS |
| real | 7s | 6.983s | 0s | 0.017s | 0.998 | 0.017s | 9.626s | 1280x720 h264/High 30/1 | -70 LUFS |

### 分段存活率（keep 应≈100%，drop 应≈0%）

**synth**

| 段 | 时间 | 期望 | 存活 | 判定 |
| --- | --- | --- | --- | --- |
| A | 0-8 | keep | 100.0% | OK |
| B | 8-14 | keep | 100.0% | OK |
| C | 14-20 | drop | 0.0% | OK |
| D | 20-24 | drop | 0.0% | OK |
| E | 24-30 | keep | 100.0% | OK |
| F | 30-36 | keep | 100.0% | OK |
| G | 36-42 | keep | 100.0% | OK |

**real**

| 段 | 时间 | 期望 | 存活 | 判定 |
| --- | --- | --- | --- | --- |
| HEAD_BLACK | 0-3 | drop | 0.0% | OK |
| REAL_A | 3-6.5 | keep | 100.0% | OK |
| MID_BLACK | 6.5-8.5 | drop | 0.0% | OK |
| REAL_B | 8.5-15 | keep | 100.0% | OK |
| TAIL_BLACK | 15-17 | drop | 0.0% | OK |

### 成片质检检查项

- **synth**：has_video=ok，h264=ok，yuv420p=ok，cfr=ok，audio_aac_48k=ok，loudness_ok=ok，no_residual_black=ok，av_synced=ok
  - 残留信号：黑场 0、冻帧 1、静音 1（冻帧/静音残留可能是设计内保留）
- **real**：has_video=ok，h264=ok，yuv420p=ok，cfr=ok，audio_aac_48k=ok，loudness_ok=n/a，no_residual_black=ok，av_synced=ok
  - 注：音轨实质静音（素材本身无真实音频），响度归一不适用
  - 残留信号：黑场 0、冻帧 0、静音 1（冻帧/静音残留可能是设计内保留）

## 产物位置

- synth: `History\runs\bench01`（final.mp4 / edits.json / timeline.png / verify.json / qa.json / report.md / contact_sheet.jpg / runlog.jsonl）
- real: `History\runs\real01`（final.mp4 / edits.json / timeline.png / verify.json / qa.json / report.md / contact_sheet.jpg / runlog.jsonl）