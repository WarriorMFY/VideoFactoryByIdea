# loop3_real_speech/ — 真实外语素材验证 + 语音保护

> 真实外语素材验证 + 语音保护。关键结果：对白 4/4 保住，切除 13.52→11.57s；置信度 0.816→0.918；真实语音词准 ~55–65%
> 回链：[AGENTS.md §3.3](../../AGENTS.md) · [循环日志 #loop3](../../History/CircleLog/log.md#loop3) · [Prototype 索引](../Prototype.md)

## 目录内容

| 子目录 | 类型 | 内容量 |
|---|---|---|
| `case_D_sintel_en2zh/` | 子目录 | 14 项 |

根目录另有 5 个数据产物文件（.json×2 · .jpg×1 · .ps1×1 · .png×1），均为本轮产物，不单列。

## 说明（原 `README.md` 正文）

### 小循环 3 · 真实外语素材（真人说话）验证

> 需求原话：**"你自行去网上下载一下外语素材，先自己跑通验证"**
> 上一轮（小循环 2）只验证了 **TTS 合成语音**，真实人声未测——本轮补上：自己找素材、自己跑通、把真实素材暴露的问题修掉并复测。
> 时间：2026-10-27 15:40–16:20（约 40 分钟，含下载/调参/回归）。

---

#### 1. 一句话结论

**跑通了，而且真实素材立刻暴露并修掉了一个会毁片的 bug**：原规则在真实影视素材上把**对白段当黑场剪掉了**（暗场景误判 + 台词夹在黑场卡里）。新增「语音保护」（有 ASR 识别到语音的区间一律不剪）+ 收紧黑场判定后，对白 100% 保住，切除量从 13.52s 降到 11.57s。

同时给出一个诚实的坏消息：**小模型 Vosk 在真实影视音轨上准确率明显不够**（音乐/音效/低语混在一起），字幕"能看但错得多"。这直接推翻了"小循环 2 的 6.1% WER"可以外推到真实片子的乐观假设。

---

#### 2. 素材：自己找的、可商用、可复现

| 项 | 内容 |
| --- | --- |
| 素材 | **Sintel 预告片**（Blender Foundation 开放电影，**CC-BY 3.0**） |
| 来源 | `https://media.w3.org/2010/05/sintel/trailer.mp4`（W3C 测试媒体，实测 0.5~5MB/s） |
| 规格 | 52.2s / 854×480 / H.264 / AAC 48k 立体声，**真人英语对白** + 音乐 + 音效 |
| 下载脚本 | `Tool/setup/fetch_realspeech.mjs`（幂等，含失败候选） |

为什么选它：真实人声、真实混音、有镜头切换与黑场卡（正好考验剪辑规则），且许可允许测试使用。测试过的其它候选都被否掉：`bunny-trailer` 无对白（纯音乐）；`test-videos.co.uk` 的片段无音轨；`movie_300` 前 120s 无人声；GitHub Release / Wikimedia / Internet Archive 全域不可达。

---

#### 3. 真实素材暴露的问题与修复

##### 问题 1（严重）：对白被当黑场剪掉

原黑场参数 `pix_th=0.10 / dur=0.12` 在影视素材上把**暗场景**判为黑场：首轮 EDL 出现 9 段"黑场"，其中 16.5–18.17s 直接切掉了 "What brings you to the land of the gatekeepers" 的一半，字幕行因此被判"保留比例 31% < 35%"整行丢弃。

**修复 A：收紧黑场判定** `pix_th 0.10 → 0.04`、显式 `pic_th=0.98`、`dur 0.12 → 0.30`。

**修复 B：语音保护（核心）** `vfactory --protect <transcript.json>`：把 ASR 词级时间戳按 0.8s 间隙合并成语音区间（两侧各留 0.25s 余量，且只采信 `conf ≥ 0.5` 的词），**切除集合先减去语音区间再执行**。实测锁住 4 段语音、切除量 13.52s → 11.57s，对白全部保住（其中一句正是压在片尾黑底字幕卡上的台词）。

| 版本 | 保留 | 切除 | 保留段数 | 结果 |
| --- | --- | --- | --- | --- |
| 不加语音保护 | 38.69s | 13.52s | 6 | 对白被剪断，字幕丢 1 行 |
| **加语音保护（正式）** | **40.64s** | **11.57s** | 5 | 对白 4 句全保住，字幕 4/4 全出 |

##### 问题 2：识别质量（真实混音）

4 种音频预处理实测（同一素材、同一模型）：

| 预处理 | 词数 | 平均置信度 | 效果 |
| --- | --- | --- | --- |
| 无 | 29 | 0.816 | "the land **are** the gatekeepers"（错） |
| mono + loudnorm | 29 | 0.821 | 同上，仍错 |
| **降噪 + 带通 300–3400Hz** | 25 | **0.918** | "the land **of** the gatekeepers"（对了） |
| 降噪 + 高通 + loudnorm | 27 | 0.882 | 仍有两处错 |

**结论**：真实影视音轨上，`afftdn=nf=-25,highpass=300,lowpass=3400` 明显更好（置信度 +0.10，纠正了关键字），已作为 `asr_vosk.mjs --af` 的推荐值写入本轮验收脚本。

##### 问题 3：短句被合并，翻译被带歪

真实对白常是短句（"I'm searching for someone."）。原 `min-sent=24` 会把两句并成一句再翻译，译文直接串味（"是什么把你带到我正在寻找的守门人的土"）。**改为 `min-sent=12`** 后正确拆成两句，首句译文恢复正确（"是什么让你来到守门人的国度"）。回归测试：小循环 2（TTS 素材）仍 PASS。

##### 问题 4（已知取舍，未修）：语音保护会连带保住黑屏

最后一句台词压在黑底字幕卡上，保护它就必须保住那段黑屏。质检因此报"残留黑场"——这是"要声音还是要画面"的取舍，**不是流水线错误**。已把质检黑场阈值与剪辑规则对齐（0.30s / pix 0.04），残留从 5 段降到 3 段，并在验收里单独标注为「仅残留黑场告警」。

---

#### 4. 验收结果（reference-free 模式）

真实素材没有官方逐句讲稿，所以 **WER / 句界误差不可测**；验收切换到 reference-free：只看字幕自身合理性与成片质量。

| 指标 | 值 | 判定 |
| --- | --- | --- |
| 识别 | 25 词 / 平均置信度 0.918 | — |
| 译文覆盖 | 4/4 条 | OK |
| 中文可读性峰值 | 6.17 字/秒 | OK（≤20） |
| 重映射 | 4 条 / 越界 0 / 重叠 0 / 最短 0.81s | OK |
| 成片 | 39.10s / 1280×720 / −14.9 LUFS / 音画时长差 0.004s | PASS（仅残留黑场告警） |
| 剪辑一致性 | 两次渲染 EDL 相同 | OK |

一键复跑：`.\Prototype\loop3_real_speech\reproduce.ps1`

---

#### 5. 识别结果实况（诚实展示）

| # | 时间 | ASR 识别 | 机翻 | 真实台词（我按影片常识对照） |
| --- | --- | --- | --- | --- |
| 1 | 12.18–14.37 | what brings you to the land of the gatekeepers | 是什么让你来到守门人的国度 | ✅ 正确 |
| 2 | 18.66–19.47 | i'm searching for | 我正在寻找 | ⚠️ 漏了 "someone" |
| 3 | 36.99–38.97 | dangerous quest for a number two | 危险的追求二号 | ❌ 应为 "for a lone hunter" |
| 4 | 41.97–43.80 | you don't long as i can remember | 你不会只要我记得 | ❌ 应为 "I've been alone for as long as I can remember" |

粗略估计真实语音上的**词准确率约 55–65%**（4 句里 1 句全对、1 句漏词、2 句明显错），与小循环 2 在 TTS 上的 6.1% WER 形成鲜明对比。**这是本轮最重要的发现**：TTS 上的好成绩不能外推。

---

#### 6. 结论与建议

**能做到的**：真实视频 → 真实人声识别 → 中文/双语字幕 → 随剪辑重映射 → 烧入成片，全链路自动、可复现、有验收数据；并且**不会再把对白剪掉**。

**还差什么**（按优先级）：

1. **换更强的 ASR**：Vosk 小模型在混音素材上不够用。可选：更大的 Vosk 模型（本机正在下 128MB 的 `en-us-0.22-lgraph` 做对照，源站限速约 30 分钟）、或 Whisper 系（但 HuggingFace 全域不可达，需另找通道）。
2. **无标点 → 断句与翻译质量**：ASR 无标点导致 MT 串句/错位；需要标点恢复（可用规则 + 语言模型，或直接换自带标点的 ASR）。
3. **音频预处理再打磨**：本轮已证明"降噪+带通"有效，可再试双声道中置提取（影视对白多在中置声道）。
4. **语音保护的画面侧优化**：对白压在黑屏/字幕卡上时，理想做法是保留音频、替换画面（本流水线音画绑定，暂做不到）。

##### 追加实验：换更大的模型有用吗？——**没用，反而更差**

下完 128MB 的 `vosk-model-en-us-0.22-lgraph` 做对照，结果：

| 模型 | 预处理 | 置信度 | 表现 |
| --- | --- | --- | --- |
| small 39MB | 降噪+带通 | **0.918** | 关键句 "the land **of** the gatekeepers" 正确 |
| small 39MB | 仅降噪 | **0.944** | 同上，且少一处插入 |
| lgraph 128MB | 降噪+带通 | 0.788 | 插入大量 "the"、把 i'm 听成 am、置信度更低 |
| lgraph 128MB | 无 | 0.928 | 词数掉到 18（漏得更多） |

结论：**问题不在模型大小，而在模型能力上限**——两个模型都没听出 "a lone hunter"、"I've been alone"。lgraph 为大词表听写优化，在音乐掩蔽的影视混音上更容易插入。默认继续用小模型 + 带通预处理。完整对照见 `History/loops/loop03/model_compare.md`。

---

#### 7. 交付物（`case_D_sintel_en2zh/`）

| 文件 | 是什么 |
| --- | --- |
| `final.mp4` | **成片**：真实素材 + 双语硬字幕（39.10s） |
| `source_sintel_trailer.mp4` | 原始素材（CC-BY 3.0，便于对照） |
| `frame_dialogue1.jpg` / `frame_dialogue2.jpg` | 抽帧：真实场景上的中英双语字幕 |
| `bilingual_final_timeline.srt` | 与成片对齐的双语字幕 |
| `zh_source_timeline.srt` | 原片时间轴的中文字幕 |
| `transcript.json` | 词级识别结果（含置信度，预处理参数记录在内） |
| `cues.json` | 句子 + 译文 + 显示行 |
| `edits.json` / `edits_noprotect_for_compare.json` | 正式 EDL（含语音保护）/ 对照 EDL（无保护，用于对比） |
| `verify_subs.json` / `qa.json` / `timeline.png` / `contact_sheet.jpg` / `report.md` | 验收、质检、决策时间轴、抽帧、报告 |

素材许可：**Sintel © Blender Foundation, CC-BY 3.0**（随包保留原始片段，用于复现与对照）。

## 验收记录（原 `acceptance.md` 正文）

### 小循环 3 验收记录：真实外语素材（真人说话）→ 中文字幕

生成时间：2026-10-27T08:13:27.296Z　素材：`Workspace\assets\realspeech\sintel-trailer.mp4`（52.2s，Sintel © Blender Foundation, CC-BY 3.0）

#### 结论

- 字幕链路（reference-free 模式）：**PASS**
- 成片质检：**WARN**
- 剪辑一致性：**一致**

#### 音频预处理对识别的影响（本轮关键实验）

| 预处理 | 识别词数 | 平均置信度 | 时长句数 | 识别文本（前 90 字符） |
| --- | --- | --- | --- | --- |
| baseline | 29 | 0.8162 | 4 | what brings you to the land are the gatekeepers i'm searching for so a dangerous quest for |
| mono+loudnorm | 29 | 0.821 | 4 | what brings you to the land are the gatekeepers i'm searching for so dangerous quest for a |
| bandpass+denoise | 25 | 0.9175 | 4 | what brings you to the land of the gatekeepers i'm searching for dangerous quest for a num |
| denoise+highpass+loudnorm | 27 | 0.8821 | 4 | what brings you to the land of the gatekeepers i'm searching for so dangerous quest for a  |

#### 剪辑对照：语音保护的效果（本轮核心修复）

| 版本 | 保留 | 切除 | 保留段数 | 说明 |
| --- | --- | --- | --- | --- |
| 不加语音保护 | 38.69s | 13.52s | 6 | 对白段可能被黑场/冻帧规则剪掉 |
| 加语音保护（正式） | 40.64s | 11.57s | 5 | 识别到语音的 4 段区间不许剪 |

#### 字幕链路指标（reference-free，无讲稿）

| 指标 | 值 | 判定 |
| --- | --- | --- |
| 识别词数 / 置信度 | 25 / 0.9175 | — |
| 译文覆盖 | 4/4 | OK |
| 中文可读性峰值 | 6.17 字/秒 | OK |
| 重映射 | 4 条 / 越界 0 / 重叠 0 / 最短 0.81s | OK |
| 成片 | 39.104s / 1280x720 / -14.9 LUFS | WARN |

#### 识别出的句子与译文

| # | 时间 | 英文（ASR） | 中文（机翻） |
| --- | --- | --- | --- |
| 1 | 12.18–14.37 | what brings you to the land of the gatekeepers | 是什么让你来到守门人的国度 |
| 2 | 18.66–19.47 | i'm searching for | 我正在寻找 |
| 3 | 36.99–38.97 | dangerous quest for a number two | 危险的追求二号 |
| 4 | 41.97–43.80 | you don't long as i can remember | 你不会只要我记得 |

#### 产物

- 成片：`History\runs\real3_subs\final.mp4`
- 双语字幕（成片时间轴）：`History\subs\real3\remapped\out_bilingual.srt`
- 识别稿：`History\asr\transcript_real.json`（音频预处理：`afftdn=nf=-25,highpass=f=300,lowpass=f=3400`）
- 预处理对比：`History/asr/variant_*.json`
- 剪辑/质检产物：`History\runs\real3_subs`
- 耗时：81s

## 模型对照（原 `model_compare.md` 正文）

### 额外实验：换更大的 Vosk 模型有用吗？（真实素材，手工补充）

时间：2026-10-27 16:30　素材：Sintel 预告片（52.2s，真人英语对白 + 音乐 + 音效）
原始数据：`History/asr/cmp_small.json`、`cmp_small_dn.json`、`cmp_big.json`、`cmp_big_noaf.json`、`cmp_big_dn.json`

#### 结论先说

**换更大的模型没有变好，反而更差。** 在真实影视混音素材上，`vosk-model-en-us-0.22-lgraph`（128MB，宽词表）比 `vosk-model-small-en-us-0.15`（39MB）表现更差：大量插入 "the"、丢词、置信度更低。

#### 对照表（同一素材、同一预处理条件下横向比较）

| 模型 | 预处理 | 词数 | 平均置信度 | 识别文本 |
| --- | --- | --- | --- | --- |
| small-0.15 | 降噪+带通(300–3400) | 25 | **0.918** | what brings you to the land **of** the gatekeepers i'm searching for dangerous quest for a number two you don't long as i can remember |
| small-0.15 | 仅降噪 | 26 | **0.944** | what brings you to the land **of** the gatekeepers i'm searching for so dangerous quest for a moment you don't raise long as i can remember |
| small-0.15 | 无 | 29 | 0.816 | what brings you to the land **are** the gatekeepers i'm searching for so a dangerous quest for … |
| **lgraph(128MB)** | 降噪+带通 | 25 | 0.788 | **the** what brings you to the land **are** the gatekeepers **am** searching **and** dangerous quest **from the matter the** long as i can remember **the** |
| lgraph(128MB) | 仅降噪 | 24 | 0.866 | **the** what brings you to the land **are** the gatekeepers **am** search **the** dangerous quest **from the the** long as i can remember **the** |
| lgraph(128MB) | 无 | 18 | 0.928 | **the** what brings you to the land **are** the gatekeepers **am** search **the the** dangerous quest for the |

真实台词（对照用，来自影片）：
1. "What brings you to the land of the gatekeepers?"
2. "I'm searching for someone."
3. "A dangerous quest for a lone hunter."
4. "I've been alone for as long as I can remember."

#### 为什么大模型更差（推断，非结论）

- lgraph（"lookahead graph"）为大词表连续听写优化，**在信噪比差、语速慢、夹杂音乐的片段上更容易插入/替换**；
- 影视混音里对白被音乐/音效掩蔽，声学条件与 Vosk 的朗读训练集差距大；
- 小模型词表窄、语言模型更强约束，反而"少犯错"（插入少），但漏词（"someone" 没听出来）。

**共同短板**：两个模型都没听出 "lone hunter"、"I've been alone" 这类低信噪比片段——这是**模型能力上限**，不是参数问题。

#### 因此

- 默认仍用 `small-en-us-0.15`（快、插入少）；
- 预处理默认保留 `afftdn + 300–3400Hz 带通`（置信度 0.816→0.918，且纠正了 "are→of"）；
- 真要提升到可交付水平，需要 **Whisper 类模型**（本机 HF/ModelScope 不可达）或**人工/LLM 校听**——这属于下一轮要解决的下载通道问题。
- 128MB 的 lgraph 模型已完整保留在 `Workspace/deps/asr/models/`，下一轮可直接复用（不需要重下）。
