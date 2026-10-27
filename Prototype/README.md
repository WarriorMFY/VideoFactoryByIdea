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
    ├── README.md                  # 说明：链路 / 结果 / 用法 / 机翻vs精译 / 限制
    ├── reproduce.ps1              # 一键复现（装 ASR 依赖 + 拉模型 + 全链路验收）
    ├── acceptance_mt.md           # 机翻版验收（全自动）
    ├── acceptance_polished.md     # 精译版验收（人工级译文，同时间轴）
    └── case_C_en2zh/              # 英→中：成片 ×2 + 双语 SRT + 识别稿 + 抽帧 + 验收数据
```

## 两轮结果一览

| 小循环 | 增量 | 关键结果 | 耗时 |
| --- | --- | --- | --- |
| 1（13:33–13:55） | 自动剪辑：黑场/冻帧/静音 → 删减 + 转场 + 响度 + 标题 → 成片 | 决策 IoU **1.000 / 0.998**，**误删有效内容 0s**，切点误差 ≤0.017s，成片 −15.9 LUFS | ~22 min |
| 2（13:56–15:10） | 字幕：离线 ASR → 句子级机翻 → 显示行 → **随剪辑重映射** → 烧入 | **WER 6.1%**，字幕覆盖 **99.8%**，句界误差 **0.016s**，成片 −16.2 LUFS | ~75 min |

两轮验收记录分别在 `loop1_autocut/acceptance.md`、`loop2_subtitles/acceptance_*.md`；循环摘要见 `History/CircleLog/log.md`。

## 怎么跑（在仓库根执行）

```powershell
# 小循环 1（自动剪辑）：装 ffmpeg → 造 A/B 用例 → 跑流水线 → 真值验收 → 成片质检
.\Prototype\loop1_autocut\reproduce.ps1

# 小循环 2（外语视频→中文字幕）：装 ASR 依赖 + 拉模型 → 造素材 → 识别/翻译/重映射/烧入 → 验收
.\Prototype\loop2_subtitles\reproduce.ps1
```

两个脚本都幂等：已装好的依赖、已下载的模型、已合成的素材会复用；耗时主要卡在首次下载（ffmpeg ~160MB、Vosk 英语模型 39MB，后者在源站限速下约 15 分钟）。

## 用自己的视频

```powershell
# 只要自动剪辑
node Tool\vfactory.mjs "你的视频.mp4" --out out\cut --title "标题"

# 外语视频 → 中文字幕（含剪辑）
node Tool\asr_vosk.mjs "你的外语视频.mp4" --out work\transcript.json
node Tool\vfactory.mjs  "你的外语视频.mp4" --out out\cut
node Tool\make_subs.mjs  work\transcript.json --out work\subs --mt mymemory --glossary Tool\glossary_zh.json
node Tool\remap_subs.mjs work\subs\cues.json out\cut\edits.json --out work\subs\remap --style bilingual
node Tool\vfactory.mjs  "你的外语视频.mp4" --out out\final --srt work\subs\remap\out_bilingual.srt
```

## 当前状态（诚实版）

- ✅ 自动删减 + 成片交付：可复现地剪对（有真值判定数据）。
- ✅ 外语（英语）→ 中文字幕：全链路自动跑通，识别与时间轴合格。
- ⚠️ 机翻质量只到"能看懂"（vs 人工精译 62.9% 字相似度）→ 正式发布建议过人工/LLM 润色。
- ⚠️ 字幕素材是神经 TTS 合成的英文（讲稿已知才可量化），**真人原声/口音/噪声未测**。
- ⚠️ 模型下载通道受限（HuggingFace 全域不可达），因此未能用 Whisper 级模型。

细节与限制见各 loop 的 README；下一步建议见 `loop2_subtitles/README.md` 第 7 节。
