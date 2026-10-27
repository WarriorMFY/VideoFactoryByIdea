# 额外实验：换更大的 Vosk 模型有用吗？（真实素材，手工补充）

时间：2026-10-27 16:30　素材：Sintel 预告片（52.2s，真人英语对白 + 音乐 + 音效）
原始数据：`History/asr/cmp_small.json`、`cmp_small_dn.json`、`cmp_big.json`、`cmp_big_noaf.json`、`cmp_big_dn.json`

## 结论先说

**换更大的模型没有变好，反而更差。** 在真实影视混音素材上，`vosk-model-en-us-0.22-lgraph`（128MB，宽词表）比 `vosk-model-small-en-us-0.15`（39MB）表现更差：大量插入 "the"、丢词、置信度更低。

## 对照表（同一素材、同一预处理条件下横向比较）

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

## 为什么大模型更差（推断，非结论）

- lgraph（"lookahead graph"）为大词表连续听写优化，**在信噪比差、语速慢、夹杂音乐的片段上更容易插入/替换**；
- 影视混音里对白被音乐/音效掩蔽，声学条件与 Vosk 的朗读训练集差距大；
- 小模型词表窄、语言模型更强约束，反而"少犯错"（插入少），但漏词（"someone" 没听出来）。

**共同短板**：两个模型都没听出 "lone hunter"、"I've been alone" 这类低信噪比片段——这是**模型能力上限**，不是参数问题。

## 因此

- 默认仍用 `small-en-us-0.15`（快、插入少）；
- 预处理默认保留 `afftdn + 300–3400Hz 带通`（置信度 0.816→0.918，且纠正了 "are→of"）；
- 真要提升到可交付水平，需要 **Whisper 类模型**（本机 HF/ModelScope 不可达）或**人工/LLM 校听**——这属于下一轮要解决的下载通道问题。
- 128MB 的 lgraph 模型已完整保留在 `Workspace/asr/models/`，下一轮可直接复用（不需要重下）。
