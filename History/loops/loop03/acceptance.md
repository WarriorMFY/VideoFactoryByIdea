# 小循环 3 验收记录：真实外语素材（真人说话）→ 中文字幕

生成时间：2026-10-27T08:13:27.296Z　素材：`Workspace\assets\realspeech\sintel-trailer.mp4`（52.2s，Sintel © Blender Foundation, CC-BY 3.0）

## 结论

- 字幕链路（reference-free 模式）：**PASS**
- 成片质检：**WARN**
- 剪辑一致性：**一致**

## 音频预处理对识别的影响（本轮关键实验）

| 预处理 | 识别词数 | 平均置信度 | 时长句数 | 识别文本（前 90 字符） |
| --- | --- | --- | --- | --- |
| baseline | 29 | 0.8162 | 4 | what brings you to the land are the gatekeepers i'm searching for so a dangerous quest for |
| mono+loudnorm | 29 | 0.821 | 4 | what brings you to the land are the gatekeepers i'm searching for so dangerous quest for a |
| bandpass+denoise | 25 | 0.9175 | 4 | what brings you to the land of the gatekeepers i'm searching for dangerous quest for a num |
| denoise+highpass+loudnorm | 27 | 0.8821 | 4 | what brings you to the land of the gatekeepers i'm searching for so dangerous quest for a  |

## 剪辑对照：语音保护的效果（本轮核心修复）

| 版本 | 保留 | 切除 | 保留段数 | 说明 |
| --- | --- | --- | --- | --- |
| 不加语音保护 | 38.69s | 13.52s | 6 | 对白段可能被黑场/冻帧规则剪掉 |
| 加语音保护（正式） | 40.64s | 11.57s | 5 | 识别到语音的 4 段区间不许剪 |

## 字幕链路指标（reference-free，无讲稿）

| 指标 | 值 | 判定 |
| --- | --- | --- |
| 识别词数 / 置信度 | 25 / 0.9175 | — |
| 译文覆盖 | 4/4 | OK |
| 中文可读性峰值 | 6.17 字/秒 | OK |
| 重映射 | 4 条 / 越界 0 / 重叠 0 / 最短 0.81s | OK |
| 成片 | 39.104s / 1280x720 / -14.9 LUFS | WARN |

## 识别出的句子与译文

| # | 时间 | 英文（ASR） | 中文（机翻） |
| --- | --- | --- | --- |
| 1 | 12.18–14.37 | what brings you to the land of the gatekeepers | 是什么让你来到守门人的国度 |
| 2 | 18.66–19.47 | i'm searching for | 我正在寻找 |
| 3 | 36.99–38.97 | dangerous quest for a number two | 危险的追求二号 |
| 4 | 41.97–43.80 | you don't long as i can remember | 你不会只要我记得 |

## 产物

- 成片：`History\runs\real3_subs\final.mp4`
- 双语字幕（成片时间轴）：`History\subs\real3\remapped\out_bilingual.srt`
- 识别稿：`History\asr\transcript_real.json`（音频预处理：`afftdn=nf=-25,highpass=f=300,lowpass=f=3400`）
- 预处理对比：`History/asr/variant_*.json`
- 剪辑/质检产物：`History\runs\real3_subs`
- 耗时：81s