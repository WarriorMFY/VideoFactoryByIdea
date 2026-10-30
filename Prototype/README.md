# Prototype/ — 每轮小循环的最终反馈

> 按 AGENTS.md 约定：`Prototype\` 放**可运行原型 + 说明 + 复现步骤 + 验证记录**，一个子目录 = 一轮小循环的增量。
> 这里只放"给人看/给人跑"的交付快照；**代码在 `Tool/`，过程留痕在 `History/`，依赖在 `Workspace/`**。

## 目录结构

```text
Prototype/
├── README.md                      # 本文件：入口索引
├── loop1_autocut/                 # 小循环 1：自动剪辑 + 成片交付
│   ├── README.md                  # 说明：能力 / 结果 / 用法 / 限制 / 依赖
│   ├── reproduce.ps1              # 一键复现（装 ffmpeg → 造用例 → 跑工厂 → 验收）
│   ├── acceptance.md              # 两用例真值验收 + 成片质检汇总（自动生成）
│   ├── case_A_synth/              # 合成素材（7 段含病态段）→ 成片 + EDL + 时间轴图 + 真值/验收
│   └── case_B_real/               # 真实素材 BBB(CC-BY) + 已知废镜头 → 同上
└── loop2_subtitles/               # 小循环 2：外语视频 → 中文字幕（含随剪辑重映射）
│   ├── README.md                  # 说明：链路 / 结果 / 用法 / 机翻vs精译 / 限制
│   ├── reproduce.ps1              # 一键复现（装 ASR 依赖 + 拉模型 + 全链路验收）
│   ├── acceptance_mt.md           # 机翻版验收（全自动）
│   ├── acceptance_polished.md     # 精译版验收（人工级译文，同时间轴）
│   └── case_C_en2zh/              # 英→中：成片 ×2 + 双语 SRT + 识别稿 + 抽帧 + 验收数据
├── loop3_real_speech/             # 小循环 3：真实素材（真人说话）验证 + 语音保护修复
│   ├── README.md                  # 说明：素材来源 / 暴露的问题 / 修复 / 识别实况 / 建议
│   ├── reproduce.ps1              # 一键复现（下素材 → 识别 → 带语音保护剪辑 → 字幕 → 验收）
│   ├── acceptance.md              # reference-free 验收（真实素材无讲稿）
│   └── case_D_sintel_en2zh/       # Sintel 预告片(CC-BY)：成片 + 双语 SRT + 识别稿 + 保护前后 EDL 对照
└── loop4_multi_samples/           # 小循环 4：多样本英译中（真实影视 + 多口音 TTS）
    ├── README.md                  # 说明：样本清单 / 三个关键发现 / 修掉的 bug / 建议
    ├── reproduce.ps1              # 一键复现（装依赖 → 下素材 → 造 TTS 样本 → 批量验收 → 快照）
    ├── acceptance.md              # 7 样本横向对比 + 逐句译文（自动生成）
    ├── metrics.json               # 机器可读指标（每样本一行）
    └── cases/<7 个样本>/          # 每样本：成片 + 双语 SRT + 抽帧 + 验收/质检数据
├── loop5_karaoke_subs/            # 小循环 5：双语 + 随语流逐词彩色高亮字幕（karaoke）
│   ├── README.md                  # 说明：技术路线 / 三个坑 / 客观验收 / 用法
│   ├── acceptance.md              # 两用例验收数据（高亮存在/不重影/会移动）
│   ├── reproduce.ps1              # 一键复现（生成 ASS → 烧入 → 像素级客观验收）
│   ├── case_E_l2_karaoke/         # TTS 素材：逐词高亮 + 3 张不同词抽帧
│   └── case_F_real3_karaoke/      # Sintel 真实素材：25 词 + 剪辑重映射后的时间轴
└── loop6_text_quality/            # 小循环 6：字幕文本层（标点恢复 + 精译 + 阅读速度）
    ├── README.md                  # 说明：根因/做法/三种变体对比/残留差距
    ├── acceptance.md              # 自动验收（标点 F1、翻译缺陷、字幕回归）
    ├── reproduce.ps1              # 一键复现
    └── case_l2_textquality/       # 精译版样片 + 三种变体字幕 + 验收数据
```

## 六轮结果一览

| 小循环 | 增量 | 关键结果 | 耗时 |
| --- | --- | --- | --- |
| 1（13:33–13:55） | 自动剪辑：黑场/冻帧/静音 → 删减 + 转场 + 响度 + 标题 → 成片 | 决策 IoU **1.000 / 0.998**，**误删有效内容 0s**，切点误差 ≤0.017s，成片 −15.9 LUFS | ~22 min |
| 2（13:56–15:10） | 字幕：离线 ASR → 句子级机翻 → 显示行 → **随剪辑重映射** → 烧入 | **WER 6.1%**（TTS 素材），字幕覆盖 **99.8%**，句界误差 **0.016s** | ~75 min |
| 3（15:40–16:20） | **真实素材验证**：真人说话 → 发现对白被剪 → 加「语音保护」+ 收紧黑场 | 对白 **4/4 保住**，切除 13.52→11.57s；音频预处理让置信度 0.816→**0.918**；真实语音词准确率仅 **~55–65%**（小模型不够用） | ~40 min |
| 4（21:25–22:15） | **多样本英译中**：新下 3 段真实素材（含 Tears of Steel 电影）+ 4 种口音 TTS，7 样本批量跑全链路 | 口音 WER：GB **1.1%** / AU 5.6% / US=IN 6.7%；**真实电影（官方字幕作真值）WER 30.5%、覆盖 59.9%**，漏的几乎全是 1–3 词短句（覆盖 24%）；附带修掉「ASR 工作目录串台」与「空 SRT 渲染崩溃」两个 bug | ~50 min |
| 5（08:55–10:05；11:30 修抖动） | **双语 + 逐词彩色高亮字幕（karaoke）**：中文整句静态 + 英文逐词重绘上色，ASS 输出，随剪辑重映射 | 高亮存在 **12/12**、无重影 **12/12**、重心位移 502/453px；抖动修复：闪断 30 帧→**0**、高亮缺失 80 帧→**0** | ~70 + 70 min |
| 6（12:00–13:40） | **字幕文本层**：标点/大小写恢复 + 精译后端 + 源端术语纠错 + 阅读速度节流 | 句界 F1 **1.00**、句末标点 **100%**、去标点 WER 6.1%（不变）；句末缺标点 **7→0**、术语错误 **1→0**；精译达人工参考 **94.1%** | ~100 min |

验收记录分别在 `loop1_autocut/acceptance.md`、`loop2_subtitles/acceptance_*.md`、`loop3_real_speech/acceptance.md`、`loop4_multi_samples/acceptance.md`、`loop5_karaoke_subs/acceptance.md`、`loop6_text_quality/acceptance.md`；循环摘要见 `History/CircleLog/log.md`。

## 怎么跑（在仓库根执行）

```powershell
# 小循环 1（自动剪辑）：装 ffmpeg → 造 A/B 用例 → 跑流水线 → 真值验收 → 成片质检
.\Prototype\loop1_autocut\reproduce.ps1

# 小循环 2（外语视频→中文字幕）：装 ASR 依赖 + 拉模型 → 造素材 → 识别/翻译/重映射/烧入 → 验收
.\Prototype\loop2_subtitles\reproduce.ps1

# 小循环 3（真实素材验证）：下真实片段（Sintel, CC-BY）→ 识别 → 带语音保护剪辑 → 字幕 → 验收
.\Prototype\loop3_real_speech\reproduce.ps1

# 小循环 4（多样本英译中）：下 3 段真实素材 + 4 种口音 TTS + Tears of Steel 电影 → 批量验收 → 快照
.\Prototype\loop4_multi_samples\reproduce.ps1

# 小循环 5（双语逐词高亮）：生成 ASS → 烧入 → 像素级客观验收（高亮存在/不重影/随语流移动）
.\Prototype\loop5_karaoke_subs\reproduce.ps1

# 小循环 6（字幕文本层）：标点恢复 → 三种翻译变体对比 → 字幕回归 → 精译版样片
.\Prototype\loop6_text_quality\reproduce.ps1
```

脚本都幂等：已装好的依赖、已下载的模型与素材会复用；耗时主要卡在首次下载
（ffmpeg ~160MB、Vosk 英语模型 39MB、ToS 电影 355MB——后者在 dotsrc 镜像 + 8 线程下约 2 分钟）。

## 用自己的视频

```powershell
# 只要自动剪辑
node Tool\edit/vfactory.mjs "你的视频.mp4" --out out\cut --title "标题"

# 外语视频 → 中文字幕（含剪辑；推荐全链路：先恢复标点再翻译）
node Tool\subtitle/asr_vosk.mjs "你的外语视频.mp4" --out work\transcript.json
node Tool\edit/vfactory.mjs  "你的外语视频.mp4" --out out\cut --protect work\transcript.json
node Tool\subtitle/restore_punct.mjs work\transcript.json --out work\tr_punct.json --glossary Tool\subtitle/glossary_zh.json
node Tool\subtitle/make_subs.mjs  work\tr_punct.json --out work\subs --mt mymemory --punct --glossary Tool\subtitle/glossary_zh.json --cps 20
node Tool\subtitle/remap_subs.mjs work\subs\cues.json out\cut\edits.json --out work\subs\remap --style bilingual
node Tool\edit/vfactory.mjs  "你的外语视频.mp4" --out out\final --protect work\transcript.json --srt work\subs\remap\out_bilingual.srt
```

要**发布级**译文：先把待译句子导出成模板，填好中文再喂回流水线（缺句会直接报错，不会静默补机翻）：

```powershell
node Tool\subtitle/make_subs.mjs work\tr_punct.json --punct --glossary Tool\subtitle/glossary_zh.json --dump-en work\zh_todo.json
# ← 填 work\zh_todo.json（{ "英文原句": "中文译文" }）
node Tool\subtitle/make_subs.mjs work\tr_punct.json --out work\subs --punct --glossary Tool\subtitle/glossary_zh.json --mt agent --zh-file work\zh_todo.json --cps 20
```

## 当前状态（诚实版）

- ✅ 自动删减 + 成片交付：可复现地剪对（有真值判定数据）。
- ✅ 外语（英语）→ 中文字幕：全链路自动跑通；**真实素材上对白已不会被剪掉**（语音保护）。
- ✅ 多样本回归：7 个样本（3 真实 + 4 口音 TTS）批量可跑，6 通过；**干净语音 WER 1.1%–6.7%**。
- ✅ **字幕文本层（小循环 6）**：标点/大小写恢复（句界 F1 **1.00**、句末标点 **100%**，去标点 WER 6.1% 不变）、
  源端术语纠错、精译后端、阅读速度节流（CPS 峰值 8.9，0 句超限）；句末缺标点 **7→0**、术语错误 **1→0**；
  精译版对人工参考相似度 **94.1%**（机翻约 47%）。
- ⚠️ **识别是当前最大短板**：真实电影（有官方字幕真值）**WER 30.5%、语音覆盖 59.9%**；
  漏的几乎全是 1–3 词短句（覆盖仅 24%，`Abort!`/`Cut!`/`Nooooo!` 这类感叹全丢）→ 短板是"漏句"而不是"错译"。
  标点与翻译只能改善"文本层"，**补不回漏掉的词**。
- ⚠️ 全自动机翻仍是"能看懂"级（缺陷已清零但表达生硬）；发布级必须 `--mt agent`（人/LLM 精译）。
- ⚠️ 语音保护会连带保住"对白压在黑屏/字幕卡"上的黑场（已知取舍，验收里单独标注）。
- ⚠️ 模型下载通道受限（HuggingFace 全域不可达），未能用 Whisper 级模型。
- ✅ **双语逐词高亮字幕**（小循环 5）：中文整句 + 英文当前词上色，ASS 输出、随剪辑重映射，像素级验收通过；
  ⚠️ 词级时间来自 ASR，识别错的地方高亮也会错；长片事件数未压测（1h ≈ 1–1.5 万条）。

细节与限制见各 loop 的 README；下一步建议见 `loop6_text_quality/README.md` 第 7 节
（校对回写闭环、语义断句、术语一致性检查、长视频压测 + 离线翻译后端）。
