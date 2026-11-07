# loop4_multi_samples/ — 多样本英译中（真实影视 + 多口音 TTS）

> 多样本英译中（真实影视 + 多口音 TTS）。关键结果：口音 WER 1.1–6.7%；真实电影 WER 30.5% / 覆盖 59.9%，漏的几乎全是 1–3 词短句
> 回链：[AGENTS.md §3.3](../../AGENTS.md) · [循环日志 #loop4](../../History/CircleLog/log.md#loop4) · [Prototype 索引](../Prototype.md)

## 目录内容

| 子目录 | 类型 | 内容量 |
|---|---|---|
| `cases/` | 子目录 | 7 项 |

根目录另有 3 个数据产物文件（.json×2 · .ps1×1），均为本轮产物，不单列。

## 说明（原 `README.md` 正文）

### 小循环 4 · 多样本英译中测试（真实影视 + 多口音 TTS）

> **人工反馈驱动的增量**：2026-10-27 21:20 用户说「继续跑循环，我认为你可以再多从网上下载几个视频样本来进行英文转中文翻译测试」。
> 于是本轮**不再改算法主线**，而是把「英→中字幕」放到**一批新下载的样本**上跑，用来回答三个问题：
> ①预处理结论能不能迁移？②口音/素材类型有多敏感？③真实电影到底漏在哪？
>
> 结论提前说：**真实电影上 WER 30.5%、语音覆盖 59.9%（未达标）**，漏掉的几乎全是 1–3 词的短句（覆盖率 24%）；
> TTS 上 WER 1.1%–6.7%。**短板是识别模型能力，不是链路 bug**——顺带修掉了两个真 bug（见第 5 节）。

#### 1. 样本清单（全部为公开授权素材，可自由分发）

| 样本 id | 类型 | 来源 / 授权 | 时长 | 真值 |
| --- | --- | --- | --- | --- |
| `sintel_trailer` | 真实影视 | Sintel 预告片 · Blender Foundation **CC-BY 3.0**（media.w3.org） | 52.2s | 无（reference-free） |
| `tos_90s` | 真实电影 | Tears of Steel 90s 对白密集片段 · Blender Foundation **CC-BY 3.0**（nluug 镜像） | 90.0s | **官方英文字幕 TOS-en.srt**（另存官方中文 TOS-CH.srt 作机翻参照） |
| `bbb_trailer` | 阴性对照 | Big Buck Bunny 预告片 · **CC-BY 3.0**（media.w3.org，5.1 声道、只有音乐） | 33.0s | 无（**期望识别不出对白**） |
| `tts_en-US-Aria` | TTS | 同一讲稿 / 美音女声（Edge TTS） | 26.9s | 逐句真值 |
| `tts_en-GB-Sonia` | TTS | 英音女声 | 28.6s | 逐句真值 |
| `tts_en-AU-Natasha` | TTS | 澳音女声 | 28.4s | 逐句真值 |
| `tts_en-IN-Neerja` | TTS | 印度英语女声 | 30.3s | 逐句真值 |

> 素材获取命令：`node Tool\setup\fetch_more_speech.mjs`（真实片段）、`make_speech4_tts.mjs`（多口音 TTS）、
> `fetch_tos_movie.mjs` + `make_tos_excerpt.mjs`（ToS 电影与真值）。
> 下载过程本身也踩了坑：`test-videos.co.uk` 会挂死、`download.blender.org` 403、nluug 单连接只有 0.07MB/s
> → 最终用 **dotsrc 镜像 + 8 线程分段**把 355MB 拉到 **1.9 分钟（3.0MB/s）**。

#### 2. 结果总表（7 个样本，6 通过）

| 样本 | 识别(词/置信度) | 预处理胜出 | 剪辑(保留/切除) | 字幕行 | 译文覆盖 | 可读性峰值 | WER | 成片 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `sintel_trailer` | 25 / 0.918 | bandpass | 40.64s / 11.57s | 4 | 4/4 | 6.17 字/秒 | 无真值 | WARN（残留黑场，已知取舍） |
| `tos_90s` | 77 / 0.900 | bandpass | 90s / 0s（13 段语音全保护） | 13 | 14/14 | 10.53 字/秒 | **30.5%** ❌ | WARN |
| `bbb_trailer` | 0 / – | – | – | – | – | – | – | 阴性对照 ✅（不凭空造字幕） |
| `tts_en-GB-Sonia` | 89 / 0.981 | baseline | 28.62s / 0s | 6 | 12/12 | 10.08 字/秒 | **1.1%** | PASS |
| `tts_en-AU-Natasha` | 88 / 0.975 | baseline | 28.4s / 0s | 6 | 11/11 | 6.35 字/秒 | **5.6%** | WARN |
| `tts_en-US-Aria` | 88 / 0.974 | baseline | 26.87s / 0s | 6 | 13/13 | 13.33 字/秒 | **6.7%** | PASS |
| `tts_en-IN-Neerja` | 89 / 0.959 | baseline | 30.28s / 0s | 6 | 12/12 | 11.61 字/秒 | **6.7%** | PASS |

判定口径：WER ≤ 25%、语音覆盖 ≥ 95%、译文覆盖 100%、中文可读性 ≤ 20 字/秒、重映射无越界/重叠、成片质检 PASS
（「仅残留黑场告警」是已知取舍，不算失败）。完整表格与逐句译文见 [`acceptance.md`](acceptance.md)。

#### 3. 三个关键发现

##### 3.1 预处理不能一刀切（小循环 3 的结论只对影视混音成立）

| 样本 | baseline 置信度 | bandpass 置信度 | 采用 |
| --- | --- | --- | --- |
| Sintel 预告片（音乐+音效） | 0.8162（29 词） | **0.9175**（25 词） | bandpass |
| Tears of Steel（真人+配乐） | 0.8788（82 词） | **0.9001**（77 词） | bandpass |
| 4 个 TTS 样本（干净语音） | **0.959–0.981** | 0.938–0.978 | baseline |

→ 结论：**带通降噪只对"音乐/音效压着人声"的影视混音有利；干净语音上反而略伤**。
脚本已做成"两种都跑一遍、按置信度择优"，所以两种素材都不吃亏（代价是识别时间翻倍）。

##### 3.2 口音敏感度：同一讲稿，只换音色

`en-GB 1.1%` < `en-AU 5.6%` < `en-US 6.7%` = `en-IN 6.7%`（WER，逐句真值）。
Vosk 小模型是美音训练为主，**英音反而最好、印度英语最难** —— 与直觉相反，值得记一笔：
"印式口音难"这条经验在当前模型上不成立，真正的短板是**短句/连读**。

##### 3.3 真实电影漏在哪：短句（这是本轮最有用的结论）

ToS 90s 片段（官方英文字幕作真值，95 词）按真值句长分桶统计覆盖率：

| 真值句长 | 句数 | 平均覆盖率 | 整句被漏掉 |
| --- | --- | --- | --- |
| 1–3 词（感叹/呼叫/应答） | 11 | **24%** | 8 句 |
| 4–8 词 | 11 | 70% | 1 句 |
| ≥9 词 | 2 | 84% | 0 句 |

被整句漏掉的原始台词：`Speed it up, Thom!` / `Vivacissimo!` / `Abort!` / `Cut!` / `Whoaaa!` / `Whoaaa!` / `Nooooo!` / `I know.`

→ 所以"字幕不好"的成因排序是：**漏句 > 错译**。漏掉的都是短促感叹与快速插话（能量低、时长短、常与音效重叠）。
这解释了为什么长句反而更可靠 —— 也直接指出下一步该做什么（见第 7 节）。

#### 4. 交付物（`cases/` 下每个样本一套）

```text
Prototype/loop4_multi_samples/
├── README.md                 # 本文件
├── reproduce.ps1             # 一键复现（装依赖 → 下素材 → 造样本 → 批量验收）
├── acceptance.md             # 自动生成的验收报告（7 样本横向对比 + 逐句译文）
├── metrics.json              # 机器可读指标（每样本一行）
├── excerpts.json             # 截取片段登记（ToS 选段依据）
└── cases/<样本 id>/
    ├── final.mp4             # 烧入双语字幕的成片
    ├── out_bilingual.srt     # 成片时间轴的双语字幕
    ├── frame.jpg             # 抽帧（可直接看字幕效果）
    ├── verify_subs.json      # WER/覆盖/可读性/重映射 判定数据
    ├── qa.json               # 成片质检
    └── edits.json            # 剪辑决策（EDL）
```

#### 5. 顺带修掉的两个真 bug（诚实记录）

1. **识别工作目录被共用 → 静默串台**：`asr_vosk.mjs` 原来固定用 `.asr_work/asr_16k.pcm`。
   一个被 kill 的批处理留下了孤儿子进程继续识别 596s 整片，与新一轮的 33s 预告片抢同一个 PCM 文件，
   结果 **33 秒的片子识别出 262 秒的词**，字幕时间码全部错位（且不报错）。
   修复：工作目录改成 `<输出名>_<pid>/` 隔离 + **抽音频后校验时长与输入一致**（差 >2% 直接失败）+ 用完即删。
2. **空 SRT 让渲染崩溃**：素材只有 1 个噪声词时，重映射会把唯一一行丢掉 → 0 字节 SRT →
   libass 报 `Unable to open ...srt`，整条成片渲染失败。修复：`vfactory` 先判空/判合法，跳过烧入并告警，成片照常输出。

另外补了一条并发保护：`run_multi_speech_acceptance.mjs` 现在用 pid 锁阻止两个 driver 同时写 `metrics.json`
（实测被孤儿进程盖过结果）。

#### 6. 已知限制

- **识别仍是天花板**：真实电影 30.5% WER / 59.9% 覆盖；小模型（39MB）对短句无能为力。
  大模型（128MB lgraph）在小循环 3 已验证更差，未在本轮重复。
- **机翻只到"能看懂"**：MyMemory 免费接口；`tos_90s` 的官方中文字幕已保存
  （`Workspace/assets/tos/TOS-CH.srt`），可用于下一轮做"机翻 vs 人工"定量对比。
- **真值口径**：ToS 真值来自官方字幕（含标点与断句），ASR 无标点，WER 计算已忽略标点；
  中文字幕是按时间就近对齐的，个别行会错配（不影响英文侧 WER）。
- **阴性对照只有 1 个**：BBB 预告片（只有音乐）证明"没对白就不编字幕"，但还没覆盖"纯音效"、"多语种混播"等场景。

#### 7. 下一步建议（等人选方向）

1. **补短句通道**（收益最大）：对 `chunk` 级的低置信/短时长区间做二次识别（提高能量、降噪更强、或换模型），
   目标把 1–3 词短句覆盖率从 24% → 60%+。
2. **机翻质量定量化**：用已下载的 `TOS-CH.srt` 做参照，算"机翻 vs 人工"的字相似度分布，给出发布门槛。
3. **换更强模型**：若打通 Whisper（需要新的下载通道），把这一批样本当固定回归集重跑，直接看 WER 曲线。
4. **批量跑真实素材**：把 ToS 全片切 10 段各 90s，看 WER 随内容的分布（现在只有 1 段）。

## 验收记录（原 `acceptance.md` 正文）

### 小循环 4 验收记录：多样本英文 → 中文（真实影视 + 多口音 TTS）

生成时间：2026-10-27T14:08:26.916Z　样本数：7　通过：6/7　总耗时：275s

#### 横向对比总表

| 样本 | 类型 | 时长 | 识别(词/置信度) | 预处理胜出 | 剪辑(保留/切除) | 字幕句数 | 译文覆盖 | 可读性峰值 | WER | 成片 | 结论 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| bbb_trailer | control | 33s | 0 / 0 | baseline | - | - | - | - | 无真值 | - | ✅ PASS |
| sintel_trailer | real | 52.21s | 25 / 0.9175 | bandpass | 40.64s / 11.57s | 4 | 4/4 | 6.17 字/秒 | 无真值 | WARN（黑场告警） | ✅ PASS |
| tts_en-AU-Natasha | tts | 28.4s | 88 / 0.9746 | baseline | 28.4s / 0s | 6 | 11/11 | 6.35 字/秒 | 5.6% | WARN | ✅ PASS |
| tts_en-GB-Sonia | tts | 28.62s | 89 / 0.9814 | baseline | 28.62s / 0s | 6 | 12/12 | 10.08 字/秒 | 1.1% | PASS | ✅ PASS |
| tts_en-IN-Neerja | tts | 30.28s | 89 / 0.959 | baseline | 30.28s / 0s | 6 | 12/12 | 11.61 字/秒 | 6.7% | PASS | ✅ PASS |
| tts_en-US-Aria | tts | 26.87s | 88 / 0.9736 | baseline | 26.87s / 0s | 6 | 13/13 | 13.33 字/秒 | 6.7% | PASS | ✅ PASS |
| tos_90s | real | 90s | 77 / 0.9001 | bandpass | 90s / 0s | 13 | 14/14 | 10.53 字/秒 | 30.5% | WARN | ⚠️ 未通过 |

#### 关键问题 1：小循环 3 的"带通降噪更优"能迁移到别的素材吗？

| 样本 | baseline 词数/置信度 | bandpass 词数/置信度 | 采用 |
| --- | --- | --- | --- |
| bbb_trailer | 0 / 0 | 0 / 0 | baseline |
| sintel_trailer | 29 / 0.8162 | 25 / 0.9175 | bandpass |
| tts_en-AU-Natasha | 88 / 0.9746 | 88 / 0.9737 | baseline |
| tts_en-GB-Sonia | 89 / 0.9814 | 89 / 0.9777 | baseline |
| tts_en-IN-Neerja | 89 / 0.959 | 89 / 0.9377 | baseline |
| tts_en-US-Aria | 88 / 0.9736 | 88 / 0.9673 | baseline |
| tos_90s | 82 / 0.8788 | 77 / 0.9001 | bandpass |

#### 关键问题 2：什么素材最容易崩？

按识别置信度升序（越低越难）：

| 样本 | 音频 | 置信度 | 识别文本（前 140 字符） |
| --- | --- | --- | --- |
| tos_90s | 44100Hz 2ch | 0.9001 | look celia we have to follow our passions you have your robotics i just want to be awesome in space come in two minutes left financial just  |
| sintel_trailer | 48000Hz 2ch | 0.9175 | what brings you to the land of the gatekeepers i'm searching for dangerous quest for a number two you don't long as i can remember |
| tts_en-IN-Neerja | 48000Hz 2ch | 0.959 | good evening and welcome to the second half of all factory tour in the next five minutes you will see how iraq live becomes a finished film  |
| tts_en-US-Aria | 48000Hz 2ch | 0.9736 | good evening and welcome to the second half of our factory tour in the next five minutes you will see how iraq lip becomes a finished fill t |
| tts_en-AU-Natasha | 48000Hz 2ch | 0.9746 | good evening and welcome to the second half of our factory to in the next five minutes you will see how role clip becomes the finished film  |
| tts_en-GB-Sonia | 48000Hz 2ch | 0.9814 | good evening and welcome to the second half of our factory tour in the next five minutes you will see how a roar clip becomes a finished fil |

#### 关键问题 3：字幕"漏"在什么地方？（有真值样本，按真值句长分桶）

| 样本 | 短句(1–3 词) 覆盖/句数/漏掉 | 中句(4–8 词) | 长句(≥9 词) | 被整句漏掉的句子 |
| --- | --- | --- | --- | --- |
| tts_en-AU-Natasha | - | - | 100% / 6 / 0 | 无 |
| tts_en-GB-Sonia | - | - | 100% / 6 / 0 | 无 |
| tts_en-IN-Neerja | - | - | 100% / 6 / 0 | 无 |
| tts_en-US-Aria | - | - | 100% / 6 / 0 | 无 |
| tos_90s | 24% / 11 / 8 | 70% / 11 / 1 | 84% / 2 / 0 | Speed it up, Thom! / Vivacissimo! / Abort! / Cut! / Whoaaa! / Whoaaa! / Nooooo! / I know. |

> 读法：短句（感叹、呼叫、单字应答）在影视混音里最容易被吞掉 —— 这直接决定了"译文缺句"而不是"译文错译"。

#### 译文抽检（每样本前 6 句）

##### sintel_trailer

| 时间 | 英文（识别） | 中文（机翻） |
| --- | --- | --- |
| 12.18–14.37 | what brings you to the land of the gatekeepers | 是什么让你来到守门人的国度 |
| 18.66–19.47 | i'm searching for | 我正在寻找 |
| 36.99–38.97 | dangerous quest for a number two | 危险的追求二号 |
| 41.97–43.80 | you don't long as i can remember | 你不会只要我记得 |

##### tts_en-AU-Natasha

| 时间 | 英文（识别） | 中文（机翻） |
| --- | --- | --- |
| 0.03–3.78 | good evening and welcome to the second half of our factory to | 晚上好，欢迎来到我们工厂的下半部分， |
| 4.11–8.43 | in the next five minutes you will see how role clip becomes the finished film | 在接下来的五分钟内，您将看到角色剪辑如何成为 |
| 8.79–13.74 | the robot arm picks up twelve small boxes and stacks them beside the conveyor belt | 机械臂拿起十二个小盒子，堆放在传送带旁边 |
| 14.07–18.21 | notice that the editor never touches the color wheel before the sound is balanced | 请注意，在平衡声音之前，编辑器从未触摸过色轮 |
| 18.51–23.61 | if the dialogue is louder than them music by more than six decibels the audience will complain | 如果对话声音比音乐大6分贝以上，观众会抱怨 |
| 23.97–28.38 | that is all for tonight thank you for watching and see you tomorrow at eight | 今晚到此结束，感谢大家收看，明天八点见 |

##### tts_en-GB-Sonia

| 时间 | 英文（识别） | 中文（机翻） |
| --- | --- | --- |
| 0.03–3.60 | good evening and welcome to the second half of our factory tour | 晚上好，欢迎来到我们工厂参观的后半部分 |
| 3.93–8.31 | in the next five minutes you will see how a roar clip becomes a finished film | 在接下来的五分钟内，您将看到咆哮剪辑如何成为成品电影 |
| 8.64–13.38 | the robot arm picks up twelve small boxes and stacks them beside the conveyor belt | 机械臂拿起十二个小盒子，堆放在传送带旁边 |
| 13.74–18.18 | notice that the editor never touches the color wheel before the sound is balanced | 请注意，在平衡声音之前，编辑器从未触摸过色轮 |
| 18.54–23.88 | if the dialogue is louder than the music by more than six decibels the audience will complain | 如果对话声音比音乐大6分贝以上，观众会抱怨 |
| 24.21–28.59 | that is all for tonight thank you for watching and see you tomorrow at eight | 今晚到此结束，感谢大家收看，明天八点见 |

##### tts_en-IN-Neerja

| 时间 | 英文（识别） | 中文（机翻） |
| --- | --- | --- |
| 0.03–3.72 | good evening and welcome to the second half of all factory tour | 晚上好，欢迎来到所有工厂参观的下半场 |
| 4.08–8.73 | in the next five minutes you will see how iraq live becomes a finished film | 在接下来的五分钟内，您将看到伊拉克现场如何成为一部成品电影 |
| 9.09–14.25 | the robot arm picks up twelve small boxes and stacks them beside the conveyor belt | 机械臂拿起十二个小盒子，堆放在传送带旁边 |
| 14.58–19.11 | notice that the editor never touches the color wheel before the sound is balanced | 请注意，在平衡声音之前，编辑器从未触摸过色轮 |
| 19.44–25.20 | if the dialogue org is louder than the music by more than six decibels the audience will complain | 如果对话组织比音乐响亮超过六分贝，观众会抱怨 |
| 25.59–30.24 | that is all for tonight thank you for watching and see you tomorrow at it | 今晚到此结束，感谢您的收看，明天见 |

##### tts_en-US-Aria

| 时间 | 英文（识别） | 中文（机翻） |
| --- | --- | --- |
| 0.03–3.33 | good evening and welcome to the second half of our factory tour | 晚上好，欢迎来到我们工厂参观的后半部分 |
| 3.66–7.71 | in the next five minutes you will see how iraq lip becomes a finished fill | 在接下来的五分钟内，您将看到伊拉克LIP如何成为成品填充物 |
| 8.07–12.72 | the robot arm picks up twelve small boxes and stacks them beside the conveyor belt | 机械臂拿起十二个小盒子，堆放在传送带旁边 |
| 13.05–17.07 | noticed that the editor never touches the color wheel before the sound is balanced | 注意到编辑器在平衡声音之前从未触摸过色轮 |
| 17.40–22.53 | if the dialogue is louder than the music by more than sick decibels the audience will complain | 如果对话比音乐响亮超过病态分贝，观众会抱怨 |
| 22.89–26.85 | that is all for tonight thank you for watching and see you tomorrow at eight | 今晚到此结束，感谢大家收看，明天八点见 |

##### tos_90s

| 时间 | 英文（识别） | 中文（机翻） |
| --- | --- | --- |
| 6.03–6.75 | look celia | 看起来Celia |
| 8.39–10.35 | we have to follow our passions | 我们必须追随我们的激情 |
| 11.40–12.81 | you have your robotics | 你有你的机器人 |
| 15.90–29.87 | i just want to be awesome in space come in | 我只想在太空中表现出色 |
| 30.36–31.11 | two minutes left | 两分钟 |
| 37.05–39.99 | financial just admit that your freaked out by my robot him | 财务只是承认你被我的机器人他吓坏了 |

#### 产物位置

- 逐样本产物：`History/runs/multi/<样本id>/`（final.mp4、edits.json、qa.json、verify_subs.json）
- 逐样本字幕：`History/subs/multi/<样本id>/remapped/out_bilingual.srt`
- 识别稿：`History/asr/multi/<样本id>.json`（另有 `.baseline.json` / `.bandpass.json` 对照）
- 机器可读指标：`History/loops/loop04/metrics.json`
- 交付快照：`Prototype/loop4_multi_samples/`
