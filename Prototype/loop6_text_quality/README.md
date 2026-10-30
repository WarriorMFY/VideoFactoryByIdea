# 小循环 6 · 字幕文本层：标点恢复 + 精译 + 阅读速度

> 背景：小循环 5 交付了"双语 + 逐词高亮"，但对照 B 站那类**发布级双语字幕**，差的是**内容**而不是渲染：
> ASR 输出没有标点/大小写，断句只能靠停顿，机翻因此变差（实测 `luf` 不认、术语被译坏）。
> 本轮把文本层补上，并给出可复现的量化。
> 时间：2026-10-29 12:00–13:30。

---

## 1. 一句话结论

**补上了标点/大小写，机翻缺陷清零，精译后端可达人工水平**：

| 指标 | 改之前（无标点机翻） | **改之后** |
| --- | --- | --- |
| 句末标点缺失 | **7/7 句** | **0/7 句** |
| 术语错误（`luf`、`l u fs` 之类） | 1 处 | **0 处** |
| 句界与真值对齐（TTS 素材有讲稿） | 4 句 / 真值 7 句 | **7 句 / 7 句，F1 = 1.00** |
| 句末标点类型正确率 | — | **100%**（问句 `?` / 陈述 `.`） |
| 文本完整性（去标点后 WER） | 6.1%（ASR 自身水平） | **6.1%（不变）** → 只补标点、没改词 |
| 与人工精译相似度 | 47.8% | 机翻 47.2% / **人工级精译 94.1%** |
| 阅读速度（峰值） | — | 8.9 字/秒（上限 20），超标 0/13 条 |
| 字幕链路回归（WER/覆盖/句界） | PASS | **PASS**（覆盖 99.8%、句界误差 0.02s） |

> 相似度只说明"像不像人工译文"，同义改写也会扣分 → **真正对账的是缺陷计数**（7→0、1→0）。

---

## 2. 做了什么

```
transcript.json（ASR：小写、无标点）
   │  restore_punct.mjs   ← 本轮新增
   │     · 切句：停顿分位数(p80) 自适应阈值（不再硬编码 0.55 / 中位数×3）
   │     · 大小写：句首、代词 I、术语/专名
   │     · 句末：wh- 开头 或 助动词倒装 → "?"；感叹词短句 → "!"；其余 "."
   │     · 逗号：连词/关系代词前；序数副词后（"the first render" 这种不加）
   ▼
transcript_punct.json（带标点句子 + 词级时间不变）
   │  make_subs.mjs --punct   ← 本轮扩展
   │     · 翻译直接吃带标点整句（实测：LUFS 不再被译成 "luf"）
   │     · 源端术语纠错（_source_fixes：把 ASR 拆坏的 "l u fs" 还原成 LUFS 再送翻译）
   │     · MyMemory 500 字符上限保护（超长句拆两次请求）
   │     · 阅读速度节流 --cps（先延长、再按标点拆分；报告超标条数）
   │     · --mt agent 精译后端（人工/LLM 产出译文文件，按句 key 校验，缺句直接报错）
   ▼
cues.json / 双语 SRT / 逐词高亮 ASS
```

## 3. 三种做法横向对比（同一素材、同一时间轴）

| 变体 | 与人工精译相似度 | 句末缺标点 | 术语错误 | 中英未空格 | 峰值 CPS | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| A 无标点机翻（旧） | 47.8% | **7** | 1 | 2 | — | 现状基线 |
| **B 标点 + 源端纠错** | 47.2% | **0** | **0** | 2 | 8.9 | 全自动、可批量 |
| **C 人工级精译**（`--mt agent`） | **94.1%** | 0 | 0 | 0 | 8.9 | 需人/LLM 过一遍，代表质量上限 |

> A→B 相似度没涨是正常的：机翻改写本就与人工译文不同；**B 的收益在缺陷清零**（标点/术语）。
> C 证明"只要有译文，我们的时间轴/排版/高亮链路能直接到发布质量"。

## 4. 怎么用

```powershell
# 1) 识别（已有）
node Tool\subtitle\asr_vosk.mjs "外语视频.mp4" --out work\tr.json --af "afftdn=nf=-25,highpass=f=300,lowpass=f=3400"
# 2) 标点/大小写恢复（新增）
node Tool\subtitle\restore_punct.mjs work\tr.json --out work\tr_punct.json --glossary Tool\subtitle\glossary_zh.json
# 3) 字幕：机翻（自动）或精译（人/LLM 提供译文）
node Tool\subtitle\make_subs.mjs work\tr_punct.json --out work\subs --mt mymemory --punct --glossary Tool\subtitle\glossary_zh.json --cps 20
node Tool\subtitle\make_subs.mjs work\tr_punct.json --out work\subs2 --mt agent --punct --zh-file work\zh.json --cps 20
# 4) 验收
node Tool\acceptance\verify_punct.mjs work\tr_punct.json <讲稿.txt> <真值.json>     # 有讲稿时
node Tool\acceptance\verify_translation.mjs work\subs\cues.json <参考译文.json>     # 有参考译文时
```

**术语表**（`Tool/subtitle/glossary_zh.json`）现在支持两类：
- 普通键值：修**译文**里的错误写法（`lufs → LUFS`）；
- `_source_fixes`：修**源句**里的 ASR 坏写法（`"l u fs" → "LUFS"`），再送翻译 —— 这条比事后修译文更有效。

## 5. 交付物

```text
Prototype/loop6_text_quality/
├── README.md                      # 本文件
├── acceptance.md                  # 自动生成的验收报告（含逐句对照）
├── reproduce.ps1                  # 一键复现
└── case_l2_textquality/
    ├── final_polished.mp4         # 用"精译版"字幕渲染的成片（观感样本）
    ├── contact_sheet.jpg / frame_*.jpg
    ├── transcript_punct.json      # 标点恢复结果（词级时间不变）
    ├── verify_punct.json          # 标点验收（F1 1.00 / 句末标点 100% / WER 6.1%）
    ├── mt_quality_A/B/C.json      # 三种做法的缺陷计数与相似度
    ├── B_bilingual.srt / C_bilingual_polished.srt / C_zh_polished.srt
    ├── verify_subs_B.json         # 字幕链路回归
    ├── script_ground_truth.txt / reference_zh.json
    └── qa.json                    # 成片质检
```

## 6. 残留差距（对照"发布级双语字幕"）

| 差距 | 现状 | 影响 |
| --- | --- | --- |
| **ASR 本身** | 真实影视 WER 30%+、短句覆盖 24% | 标点和翻译再好，源文错了就错（本轮不解决，需 Whisper 类模型/更大模型/二次识别） |
| 机翻质量 | 缺陷清零，但仍是"能看懂"级（47%） | 要发布必须走 `--mt agent`（人工/LLM 精译），即"人机协作" |
| 语义断句 | 仍靠停顿分位数 + 长度上限 | 长句/从句复杂时会切在不太自然的位置 |
| 术语库 | 只有演示用的几条 | 需要按题材维护（人名、机构、产品名） |
| 长视频 | 未压测 49 分钟级；MyMemory 免费配额不够 | 需离线/池化翻译后端 |
| 校对闭环 | 可导出 SRT，但**没有"改完回写"**工具 | 人工校对目前要手工回填（下一轮可做） |

## 7. 下一步建议

1. **校对闭环**（导出双语 SRT → 人工修 → 回写时间轴并校验）——这是把"能发"变成"可持续生产"的最后一环，工作量小；
2. **术语库 + 全文一致性检查**（同一专名全片统一，导出不一致清单）；
3. ASR 升级/二次识别（针对低置信与 1–3 词短句）；
4. 长视频压测（49 分钟）+ 离线翻译后端。
