# 小循环 4 验收记录：多样本英文 → 中文（真实影视 + 多口音 TTS）

生成时间：2026-10-27T14:08:26.916Z　样本数：7　通过：6/7　总耗时：275s

## 横向对比总表

| 样本 | 类型 | 时长 | 识别(词/置信度) | 预处理胜出 | 剪辑(保留/切除) | 字幕句数 | 译文覆盖 | 可读性峰值 | WER | 成片 | 结论 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| bbb_trailer | control | 33s | 0 / 0 | baseline | - | - | - | - | 无真值 | - | ✅ PASS |
| sintel_trailer | real | 52.21s | 25 / 0.9175 | bandpass | 40.64s / 11.57s | 4 | 4/4 | 6.17 字/秒 | 无真值 | WARN（黑场告警） | ✅ PASS |
| tts_en-AU-Natasha | tts | 28.4s | 88 / 0.9746 | baseline | 28.4s / 0s | 6 | 11/11 | 6.35 字/秒 | 5.6% | WARN | ✅ PASS |
| tts_en-GB-Sonia | tts | 28.62s | 89 / 0.9814 | baseline | 28.62s / 0s | 6 | 12/12 | 10.08 字/秒 | 1.1% | PASS | ✅ PASS |
| tts_en-IN-Neerja | tts | 30.28s | 89 / 0.959 | baseline | 30.28s / 0s | 6 | 12/12 | 11.61 字/秒 | 6.7% | PASS | ✅ PASS |
| tts_en-US-Aria | tts | 26.87s | 88 / 0.9736 | baseline | 26.87s / 0s | 6 | 13/13 | 13.33 字/秒 | 6.7% | PASS | ✅ PASS |
| tos_90s | real | 90s | 77 / 0.9001 | bandpass | 90s / 0s | 13 | 14/14 | 10.53 字/秒 | 30.5% | WARN | ⚠️ 未通过 |

## 关键问题 1：小循环 3 的"带通降噪更优"能迁移到别的素材吗？

| 样本 | baseline 词数/置信度 | bandpass 词数/置信度 | 采用 |
| --- | --- | --- | --- |
| bbb_trailer | 0 / 0 | 0 / 0 | baseline |
| sintel_trailer | 29 / 0.8162 | 25 / 0.9175 | bandpass |
| tts_en-AU-Natasha | 88 / 0.9746 | 88 / 0.9737 | baseline |
| tts_en-GB-Sonia | 89 / 0.9814 | 89 / 0.9777 | baseline |
| tts_en-IN-Neerja | 89 / 0.959 | 89 / 0.9377 | baseline |
| tts_en-US-Aria | 88 / 0.9736 | 88 / 0.9673 | baseline |
| tos_90s | 82 / 0.8788 | 77 / 0.9001 | bandpass |

## 关键问题 2：什么素材最容易崩？

按识别置信度升序（越低越难）：

| 样本 | 音频 | 置信度 | 识别文本（前 140 字符） |
| --- | --- | --- | --- |
| tos_90s | 44100Hz 2ch | 0.9001 | look celia we have to follow our passions you have your robotics i just want to be awesome in space come in two minutes left financial just  |
| sintel_trailer | 48000Hz 2ch | 0.9175 | what brings you to the land of the gatekeepers i'm searching for dangerous quest for a number two you don't long as i can remember |
| tts_en-IN-Neerja | 48000Hz 2ch | 0.959 | good evening and welcome to the second half of all factory tour in the next five minutes you will see how iraq live becomes a finished film  |
| tts_en-US-Aria | 48000Hz 2ch | 0.9736 | good evening and welcome to the second half of our factory tour in the next five minutes you will see how iraq lip becomes a finished fill t |
| tts_en-AU-Natasha | 48000Hz 2ch | 0.9746 | good evening and welcome to the second half of our factory to in the next five minutes you will see how role clip becomes the finished film  |
| tts_en-GB-Sonia | 48000Hz 2ch | 0.9814 | good evening and welcome to the second half of our factory tour in the next five minutes you will see how a roar clip becomes a finished fil |

## 关键问题 3：字幕"漏"在什么地方？（有真值样本，按真值句长分桶）

| 样本 | 短句(1–3 词) 覆盖/句数/漏掉 | 中句(4–8 词) | 长句(≥9 词) | 被整句漏掉的句子 |
| --- | --- | --- | --- | --- |
| tts_en-AU-Natasha | - | - | 100% / 6 / 0 | 无 |
| tts_en-GB-Sonia | - | - | 100% / 6 / 0 | 无 |
| tts_en-IN-Neerja | - | - | 100% / 6 / 0 | 无 |
| tts_en-US-Aria | - | - | 100% / 6 / 0 | 无 |
| tos_90s | 24% / 11 / 8 | 70% / 11 / 1 | 84% / 2 / 0 | Speed it up, Thom! / Vivacissimo! / Abort! / Cut! / Whoaaa! / Whoaaa! / Nooooo! / I know. |

> 读法：短句（感叹、呼叫、单字应答）在影视混音里最容易被吞掉 —— 这直接决定了"译文缺句"而不是"译文错译"。

## 译文抽检（每样本前 6 句）

### sintel_trailer

| 时间 | 英文（识别） | 中文（机翻） |
| --- | --- | --- |
| 12.18–14.37 | what brings you to the land of the gatekeepers | 是什么让你来到守门人的国度 |
| 18.66–19.47 | i'm searching for | 我正在寻找 |
| 36.99–38.97 | dangerous quest for a number two | 危险的追求二号 |
| 41.97–43.80 | you don't long as i can remember | 你不会只要我记得 |

### tts_en-AU-Natasha

| 时间 | 英文（识别） | 中文（机翻） |
| --- | --- | --- |
| 0.03–3.78 | good evening and welcome to the second half of our factory to | 晚上好，欢迎来到我们工厂的下半部分， |
| 4.11–8.43 | in the next five minutes you will see how role clip becomes the finished film | 在接下来的五分钟内，您将看到角色剪辑如何成为 |
| 8.79–13.74 | the robot arm picks up twelve small boxes and stacks them beside the conveyor belt | 机械臂拿起十二个小盒子，堆放在传送带旁边 |
| 14.07–18.21 | notice that the editor never touches the color wheel before the sound is balanced | 请注意，在平衡声音之前，编辑器从未触摸过色轮 |
| 18.51–23.61 | if the dialogue is louder than them music by more than six decibels the audience will complain | 如果对话声音比音乐大6分贝以上，观众会抱怨 |
| 23.97–28.38 | that is all for tonight thank you for watching and see you tomorrow at eight | 今晚到此结束，感谢大家收看，明天八点见 |

### tts_en-GB-Sonia

| 时间 | 英文（识别） | 中文（机翻） |
| --- | --- | --- |
| 0.03–3.60 | good evening and welcome to the second half of our factory tour | 晚上好，欢迎来到我们工厂参观的后半部分 |
| 3.93–8.31 | in the next five minutes you will see how a roar clip becomes a finished film | 在接下来的五分钟内，您将看到咆哮剪辑如何成为成品电影 |
| 8.64–13.38 | the robot arm picks up twelve small boxes and stacks them beside the conveyor belt | 机械臂拿起十二个小盒子，堆放在传送带旁边 |
| 13.74–18.18 | notice that the editor never touches the color wheel before the sound is balanced | 请注意，在平衡声音之前，编辑器从未触摸过色轮 |
| 18.54–23.88 | if the dialogue is louder than the music by more than six decibels the audience will complain | 如果对话声音比音乐大6分贝以上，观众会抱怨 |
| 24.21–28.59 | that is all for tonight thank you for watching and see you tomorrow at eight | 今晚到此结束，感谢大家收看，明天八点见 |

### tts_en-IN-Neerja

| 时间 | 英文（识别） | 中文（机翻） |
| --- | --- | --- |
| 0.03–3.72 | good evening and welcome to the second half of all factory tour | 晚上好，欢迎来到所有工厂参观的下半场 |
| 4.08–8.73 | in the next five minutes you will see how iraq live becomes a finished film | 在接下来的五分钟内，您将看到伊拉克现场如何成为一部成品电影 |
| 9.09–14.25 | the robot arm picks up twelve small boxes and stacks them beside the conveyor belt | 机械臂拿起十二个小盒子，堆放在传送带旁边 |
| 14.58–19.11 | notice that the editor never touches the color wheel before the sound is balanced | 请注意，在平衡声音之前，编辑器从未触摸过色轮 |
| 19.44–25.20 | if the dialogue org is louder than the music by more than six decibels the audience will complain | 如果对话组织比音乐响亮超过六分贝，观众会抱怨 |
| 25.59–30.24 | that is all for tonight thank you for watching and see you tomorrow at it | 今晚到此结束，感谢您的收看，明天见 |

### tts_en-US-Aria

| 时间 | 英文（识别） | 中文（机翻） |
| --- | --- | --- |
| 0.03–3.33 | good evening and welcome to the second half of our factory tour | 晚上好，欢迎来到我们工厂参观的后半部分 |
| 3.66–7.71 | in the next five minutes you will see how iraq lip becomes a finished fill | 在接下来的五分钟内，您将看到伊拉克LIP如何成为成品填充物 |
| 8.07–12.72 | the robot arm picks up twelve small boxes and stacks them beside the conveyor belt | 机械臂拿起十二个小盒子，堆放在传送带旁边 |
| 13.05–17.07 | noticed that the editor never touches the color wheel before the sound is balanced | 注意到编辑器在平衡声音之前从未触摸过色轮 |
| 17.40–22.53 | if the dialogue is louder than the music by more than sick decibels the audience will complain | 如果对话比音乐响亮超过病态分贝，观众会抱怨 |
| 22.89–26.85 | that is all for tonight thank you for watching and see you tomorrow at eight | 今晚到此结束，感谢大家收看，明天八点见 |

### tos_90s

| 时间 | 英文（识别） | 中文（机翻） |
| --- | --- | --- |
| 6.03–6.75 | look celia | 看起来Celia |
| 8.39–10.35 | we have to follow our passions | 我们必须追随我们的激情 |
| 11.40–12.81 | you have your robotics | 你有你的机器人 |
| 15.90–29.87 | i just want to be awesome in space come in | 我只想在太空中表现出色 |
| 30.36–31.11 | two minutes left | 两分钟 |
| 37.05–39.99 | financial just admit that your freaked out by my robot him | 财务只是承认你被我的机器人他吓坏了 |

## 产物位置

- 逐样本产物：`History/runs/multi/<样本id>/`（final.mp4、edits.json、qa.json、verify_subs.json）
- 逐样本字幕：`History/subs/multi/<样本id>/remapped/out_bilingual.srt`
- 识别稿：`History/asr/multi/<样本id>.json`（另有 `.baseline.json` / `.bandpass.json` 对照）
- 机器可读指标：`History/loops/loop04/metrics.json`
- 交付快照：`Prototype/loop4_multi_samples/`