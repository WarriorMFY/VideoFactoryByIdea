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
└── loop3_real_speech/             # 小循环 3：真实素材（真人说话）验证 + 语音保护修复
    ├── README.md                  # 说明：素材来源 / 暴露的问题 / 修复 / 识别实况 / 建议
    ├── reproduce.ps1              # 一键复现（下素材 → 识别 → 带语音保护剪辑 → 字幕 → 验收）
    ├── acceptance.md              # reference-free 验收（真实素材无讲稿）
    └── case_D_sintel_en2zh/       # Sintel 预告片(CC-BY)：成片 + 双语 SRT + 识别稿 + 保护前后 EDL 对照
```

## 三轮结果一览

| 小循环 | 增量 | 关键结果 | 耗时 |
| --- | --- | --- | --- |
| 1（13:33–13:55） | 自动剪辑：黑场/冻帧/静音 → 删减 + 转场 + 响度 + 标题 → 成片 | 决策 IoU **1.000 / 0.998**，**误删有效内容 0s**，切点误差 ≤0.017s，成片 −15.9 LUFS | ~22 min |
| 2（13:56–15:10） | 字幕：离线 ASR → 句子级机翻 → 显示行 → **随剪辑重映射** → 烧入 | **WER 6.1%**（TTS 素材），字幕覆盖 **99.8%**，句界误差 **0.016s** | ~75 min |
| 3（15:40–16:20） | **真实素材验证**：真人说话 → 发现对白被剪 → 加「语音保护」+ 收紧黑场 | 对白 **4/4 保住**，切除 13.52→11.57s；音频预处理让置信度 0.816→**0.918**；真实语音词准确率仅 **~55–65%**（小模型不够用） | ~40 min |

验收记录分别在 `loop1_autocut/acceptance.md`、`loop2_subtitles/acceptance_*.md`、`loop3_real_speech/acceptance.md`；循环摘要见 `History/CircleLog/log.md`。

## 怎么跑（在仓库根执行）

```powershell
# 小循环 1（自动剪辑）：装 ffmpeg → 造 A/B 用例 → 跑流水线 → 真值验收 → 成片质检
.\Prototype\loop1_autocut\reproduce.ps1

# 小循环 2（外语视频→中文字幕）：装 ASR 依赖 + 拉模型 → 造素材 → 识别/翻译/重映射/烧入 → 验收
.\Prototype\loop2_subtitles\reproduce.ps1

# 小循环 3（真实素材验证）：下真实片段（Sintel, CC-BY）→ 识别 → 带语音保护剪辑 → 字幕 → 验收
.\Prototype\loop3_real_speech\reproduce.ps1
```

三个脚本都幂等：已装好的依赖、已下载的模型与素材会复用；耗时主要卡在首次下载（ffmpeg ~160MB、Vosk 英语模型 39MB，后者在源站限速下约 15 分钟）。

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
- ✅ 外语（英语）→ 中文字幕：全链路自动跑通；**真实素材上古对白已不会被剪掉**（语音保护）。
- ⚠️ **识别是当前最大短板**：TTS 素材 WER 6.1%，但真实影视混音上词准确率仅约 55–65%。
- ⚠️ 机翻质量只到"能看懂"（vs 人工精译 62.9% 字相似度），且 ASR 无标点会加重串句。
- ⚠️ 语音保护会连带保住"对白压在黑屏/字幕卡"上的黑场（已知取舍，验收里单独标注）。
- ⚠️ 模型下载通道受限（HuggingFace 全域不可达），未能用 Whisper 级模型。

细节与限制见各 loop 的 README；下一步建议见 `loop3_real_speech/README.md` 第 6 节。
