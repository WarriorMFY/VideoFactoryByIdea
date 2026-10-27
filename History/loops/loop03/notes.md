# 小循环 3 · 执行记录（时间线 / 命令 / 数据）

时区：本机 UTC+8。全部命令在仓库根执行。

## 时间线

| 时间 | 动作 | 结果 |
| --- | --- | --- |
| 15:40 | 探测"带人声的真实视频"源 | w3c/media 可达；GitHub/Wikimedia/archive 不可达 |
| 15:45 | 下载候选并跑 ASR 判断有无真人声 | Sintel trailer ✅ 有对白；bunny 无；movie_300 前 120s 无 |
| 15:50 | 音频预处理对照（4 变体） | 带通+降噪最优：置信度 0.816 → 0.918 |
| 15:55 | 首次全链路（无语音保护） | **发现对白被黑场规则剪掉**（16.5–18.17s） |
| 16:00 | 收紧黑场参数 + 新增 `--protect` 语音保护 | 切除 13.52s → 11.57s，对白保住 |
| 16:05 | 修 `--min-sent` 24 → 12（短句合并问题） | 首句译文恢复正确 |
| 16:10 | QA 黑场阈值与剪辑阈值对齐 | 残留黑场 5 → 3 段（仍有 1 段为"对白压黑底"取舍） |
| 16:13 | 回归小循环 1 / 2 | 均 PASS（黑场参数改动未破坏原用例） |
| 16:20 | 组装 Prototype/loop3_real_speech + 文档 | 交付 |

## 关键命令

```powershell
node Tool\fetch_realspeech.mjs                         # 下真实素材（Sintel trailer, CC-BY 3.0）
# 音频预处理对照（4 变体，脚本内自动跑）
node Tool\asr_vosk.mjs Workspace\assets\realspeech\sintel-trailer.mp4 --out History\asr\transcript_real.json `
  --af "afftdn=nf=-25,highpass=f=300,lowpass=f=3400"
node Tool\vfactory.mjs Workspace\assets\realspeech\sintel-trailer.mp4 --out History\runs\real3_cut `
  --protect History\asr\transcript_real.json
node Tool\make_subs.mjs History\asr\transcript_real.json --out History\subs\real3 --mt mymemory --glossary Tool\glossary_zh.json
node Tool\remap_subs.mjs History\subs\real3\cues.json History\runs\real3_cut\edits.json --out History\subs\real3\remapped --style bilingual
node Tool\vfactory.mjs Workspace\assets\realspeech\sintel-trailer.mp4 --out History\runs\real3_subs `
  --protect History\asr\transcript_real.json --srt History\subs\real3\remapped\out_bilingual.srt
node Tool\verify_subs.mjs History\asr\transcript_real.json History\bench\real_en\ground_truth.json `
  --cues History\subs\real3\cues.json --remap History\subs\real3\remapped\remap.json
node Tool\run_real_acceptance.mjs                      # 一键全量（含对照与预处理实验）
```

## 实测数据

| 指标 | 值 |
| --- | --- |
| 素材 | Sintel trailer 52.21s / 854×480 / AAC 48k（CC-BY 3.0） |
| 识别 | 25 词 / 平均置信度 0.918（预处理后） |
| 剪辑（无语音保护） | 保留 38.69s / 切除 13.52s / 6 段 |
| 剪辑（语音保护，正式） | 保留 40.64s / 切除 11.57s / 5 段 |
| 受保护语音区间 | 4 段（11.93–14.62 / 18.41–19.72 / 36.74–39.22 / 41.72–44.05） |
| 字幕 | 4 句 → 4 行，译文 4/4，可读性峰值 6.17 字/秒 |
| 重映射 | 4 条，越界 0，重叠 0，最短 0.81s |
| 成片 | 39.104s / 1280×720 / −14.9 LUFS / 音画差 0.004s |
| 残留黑场 | 3 段（其中 1 段为"对白压在黑底字幕卡"的已知取舍） |
| 真实语音词准确率（人工核对 4 句） | 约 55–65%（1 句全对、1 句漏词、2 句明显错） |
| 端到端耗时 | 81s（不含下载与模型准备） |

## 产物清单

- 素材：`Workspace/assets/realspeech/sintel-trailer.mp4`（另有 bunny/movie300 备选）
- 识别：`History/asr/transcript_real.json`；预处理对照 `History/asr/variant_*.json`
- 字幕：`History/subs/real3/`（cues.json、en/zh/bilingual.srt、remapped/）
- 运行产物：`History/runs/real3_cut`（正式 EDL）、`real3_cut_noprotect`（对照）、`real3_subs`（成片+质检）
- 验收：`History/loops/loop03/acceptance.md`
- 交付包：`Prototype/loop3_real_speech/`

## 后台任务

`vosk-model-en-us-0.22-lgraph`（128MB，更大模型对照）在后台分段下载中——源站限速，若本轮结束前未完成，留待下一轮直接复用（下载器支持断点续传）。

## 未做（边界）

Whisper 级 ASR（下载通道不通）、标点恢复、中置声道提取、音画分离式的"保音频换画面"、多语种真实素材。
