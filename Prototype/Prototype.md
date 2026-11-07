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
├── loop2_subtitles/               # 小循环 2：外语视频 → 中文字幕（含随剪辑重映射）
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
├── loop4_multi_samples/           # 小循环 4：多样本英译中（真实影视 + 多口音 TTS）
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
├── loop6_text_quality/            # 小循环 6：字幕文本层（标点恢复 + 精译 + 阅读速度）
    ├── README.md                  # 说明：根因/做法/三种变体对比/残留差距
    ├── acceptance.md              # 自动验收（标点 F1、翻译缺陷、字幕回归）
    ├── reproduce.ps1              # 一键复现
    └── case_l2_textquality/       # 精译版样片 + 三种变体字幕 + 验收数据
├── loop7_short_utterance/         # 小循环 7：真实影视"短句漏识"——一条被证伪的假设
│   ├── README.md                  # 说明：假设/做法/为什么救不回来/落地了什么
│   ├── acceptance.md              # 自动验收（预处理链收益 + 证伪证据 + 分桶）
│   ├── reproduce.ps1              # 一键复现（下 TOS 电影+字幕 → 三支探针 → 验收）
│   └── case_tos_short/            # 预处理链穷举 / 干净 TTS 对照 / 链穷举 / 分桶指标
├── loop8_review_loop/             # 小循环 8：校对回写闭环（人改中文 → 回灌时间轴）
    ├── README.md                  # 说明：为什么要有/两个工具/5 项硬判据/限制
    ├── acceptance.md              # 自动验收（恒等回写/改动落点/拒绝危险输入/重渲染）
    ├── reproduce.ps1              # 一键复现
    └── case_l2_review/            # 校对表（改前/改后）、回写 cues、双语 SRT、成片
├── loop9_long_video/              # 小循环 9：49 分钟长视频压测 + 术语一致性审计
    ├── README.md                  # 说明：成本表 / 长片才暴露的 2 个 bug / 术语审计 / 限制
    ├── acceptance.md              # 自动验收（7 阶段跑通、273 行回写恒等、术语审计回归）
    ├── reproduce.ps1              # 一键复现（冷跑约 25 分钟）
    └── case_long/                 # 273 行 cues / 校对表 / 术语审计 / 质检 / 抽帧
├── loop10_karaoke_scale/          # 小循环 10：逐词高亮在 49 分钟上的规模验收
    ├── README.md                  # 说明：事件数口径修正 / 两个坑 / 结论
    ├── acceptance.md              # 自动验收（1030 事件、120s 烧入、像素抽检 12/12）
    ├── reproduce.ps1              # 一键复现（依赖 loop9 产物，约 1 分钟）
    └── case_long_karaoke/         # 长片 ASS / verify_karaoke / 120s 烧入样片
└── loop11_knowledge_content/      # 小循环 11：知识型内容链路（分诊 + 数值单位规范化 + 术语候选）
    ├── README.md                  # 说明：为什么这类内容更稳 / 三个工具 / 8 项验收 / 限制
    ├── acceptance.md              # 自动验收（分诊、单位规范化幂等、中文单位、术语候选）
    ├── reproduce.ps1              # 一键复现
    └── case_l2_knowledge/         # 分诊结果 / 规范化前后双语 SRT 对照 / 术语候选
├── loop12_market_loop/            # 小循环 12：市场 ↔ 工厂 闭环（侦查 → 开工 → 交付包 → 反馈机制）
    ├── README.md                  # 说明：链路状态 / 侦查数据 / 交付包 / 反馈规则 / 挂账
    ├── acceptance.md              # 自动验收（9 项：侦查/成片/双语/高亮/交付包/反馈诚实性）
    ├── reproduce.ps1              # 一键复现（无需登录任何平台）
    ├── case_market/               # B 站侦查报告（榜单 + 关键词市场）与反馈规则自检
    └── case_ep01/                 # EP01 样片：成片 37s / 封面 / 双语 SRT / 高亮 ASS / 文案 / 质检
```

## 十二轮结果一览

| 小循环 | 增量 | 关键结果 | 耗时 |
| --- | --- | --- | --- |
| 1（13:33–13:55） | 自动剪辑：黑场/冻帧/静音 → 删减 + 转场 + 响度 + 标题 → 成片 | 决策 IoU **1.000 / 0.998**，**误删有效内容 0s**，切点误差 ≤0.017s，成片 −15.9 LUFS | ~22 min |
| 2（13:56–15:10） | 字幕：离线 ASR → 句子级机翻 → 显示行 → **随剪辑重映射** → 烧入 | **WER 6.1%**（TTS 素材），字幕覆盖 **99.8%**，句界误差 **0.016s** | ~75 min |
| 3（15:40–16:20） | **真实素材验证**：真人说话 → 发现对白被剪 → 加「语音保护」+ 收紧黑场 | 对白 **4/4 保住**，切除 13.52→11.57s；音频预处理让置信度 0.816→**0.918**；真实语音词准确率仅 **~55–65%**（小模型不够用） | ~40 min |
| 4（21:25–22:15） | **多样本英译中**：新下 3 段真实素材（含 Tears of Steel 电影）+ 4 种口音 TTS，7 样本批量跑全链路 | 口音 WER：GB **1.1%** / AU 5.6% / US=IN 6.7%；**真实电影（官方字幕作真值）WER 30.5%、覆盖 59.9%**，漏的几乎全是 1–3 词短句（覆盖 24%）；附带修掉「ASR 工作目录串台」与「空 SRT 渲染崩溃」两个 bug | ~50 min |
| 5（08:55–10:05；11:30 修抖动） | **双语 + 逐词彩色高亮字幕（karaoke）**：中文整句静态 + 英文逐词重绘上色，ASS 输出，随剪辑重映射 | 高亮存在 **12/12**、无重影 **12/12**、重心位移 502/453px；抖动修复：闪断 30 帧→**0**、高亮缺失 80 帧→**0** | ~70 + 70 min |
| 6（12:00–13:40） | **字幕文本层**：标点/大小写恢复 + 精译后端 + 源端术语纠错 + 阅读速度节流 | 句界 F1 **1.00**、句末标点 **100%**、去标点 WER 6.1%（不变）；句末缺标点 **7→0**、术语错误 **1→0**；精译达人工参考 **94.1%** | ~100 min |
| 7（13:05–13:45） | **真实影视"短句漏识"**：假设"切窗重识别能救回短句"→ 做 `asr_rescue` 验证；顺带穷举音频预处理链 | WER 31.6%→**28.4%**（预处理链收益），但短句覆盖只 **+3.0pp**（目标 +10pp 未达成）；证伪证据：干净 TTS 听得出 **8/10**、原片混音 **0/10**、7 条链 × 10 条漏句 **0 命中** → **模型能力上限** | ~40 min |
| 8（13:30–13:50） | **校对回写闭环**：`export_review`（带 5 类机器标记）→ 人改 CSV → `apply_review`（严格校验后回写 cues+SRT） | 恒等回写 **逐字节一致**；4 处真实改动只落指定行；删行/改时间码/空译文 **3/3 被拒绝**；回写后出片 QA **PASS** | ~20 min |
| 9（14:00–14:45） | **49 分钟长视频压测** + **术语一致性审计**（`term_missing`/`term_variant`） | 48.7 分钟成片跑通、**273 条字幕 / 校对表 273 行**、273 行回写恒等；成本 = 两次渲染约 22 分钟 + 识别 6.5 分钟（文本层全秒级）；长片暴露并修掉 **2 个 bug**（回写 trim、机翻脏数据） | ~45 min |
| 10（14:50–15:05） | **逐词高亮 @ 49 分钟规模**：长片 ASS 事件数/体积/烧入 + 120s 像素抽检 | **1030 事件 / 103KB / 生成 0.1s**；libass 正常烧、12/12 帧高亮在、重心位移 280px；口径修正为 **≈1 事件/词**（对话密集 1h ≈ 8–9k，线性） | ~15 min |
| 11（16:50–17:30） | **知识型内容链路**：内容分诊（`classify_content`）+ 数值单位规范化（`normalize_units`/`lib/units`）+ 术语候选（`term_candidates`） | 分诊 **l2=knowledge 0.95 / TOS=narrative 0.17**（配乐占比 0% vs 73%）；`minus sixty sixteen l u fs` → **−16 LUFS**、`15 Mbps`（幂等、不误伤 `two hours`）；中文侧统一且对照组拿不到；术语候选：长片 61 个 / l2 31 个 | ~40 min |
| 12（18:05–19:25，**按人要求暂停**） | **市场 ↔ 工厂闭环**：B 站公开数据侦查 → 选题 → 37s 样片（合成口播+CC-BY 画面）→ 交付包 → 反馈追踪机制 | 侦查样本 **134 条**、关键词市场「编程教程 英文」前 8 条 **2517 万**播放；样片 **12/12 行双语 + 88 条高亮事件**、QA **PASS**、WER **9.5%**/覆盖 **100%**；交付包齐全（文案/标签/分区/上传清单/合规）；反馈器空表输出「待采集」、自检 4 条动作。**上架与真实反馈仍需人工** | ~80 min |

验收记录分别在 `loop1_autocut/acceptance.md`、`loop2_subtitles/acceptance_*.md`、`loop3_real_speech/acceptance.md`、`loop4_multi_samples/acceptance.md`、`loop5_karaoke_subs/acceptance.md`、`loop6_text_quality/acceptance.md`、`loop7_short_utterance/acceptance.md`、`loop8_review_loop/acceptance.md`、`loop9_long_video/acceptance.md`、`loop10_karaoke_scale/acceptance.md`、`loop11_knowledge_content/acceptance.md`、`loop12_market_loop/acceptance.md`；循环摘要见 `History/CircleLog/log.md`，阶段总结见 `History/reports/progress_report_2026-10-30.md`。

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

# 小循环 7（短句救援）：下 TOS 电影+官方字幕 → 90s 片段 → 预处理链穷举/证伪探针 → 验收
.\Prototype\loop7_short_utterance\reproduce.ps1

# 小循环 8（校对回写）：导出校对表 → 恒等回写 → 4 处真实改动 → 3 类误操作拦截 → 重新出片
.\Prototype\loop8_review_loop\reproduce.ps1

# 小循环 9（49 分钟压测）：拼长素材 → 识别/剪辑/字幕/回写/术语审计 → 两遍渲染 → 质检（冷跑约 25 分钟）
.\Prototype\loop9_long_video\reproduce.ps1

# 小循环 10（karaoke 长片规模）：生成 49 分钟 ASS → 烧前 120s → 像素抽检（依赖 loop9 产物，约 1 分钟）
.\Prototype\loop10_karaoke_scale\reproduce.ps1

# 小循环 11（知识型内容链路）：内容分诊 → 数值单位规范化 → 术语候选 → 8 项验收
.\Prototype\loop11_knowledge_content\reproduce.ps1

# 小循环 12（市场闭环）：B 站公开数据侦查 → 37s 样片 → 交付包 → 反馈追踪（无需登录任何平台）
.\Prototype\loop12_market_loop\reproduce.ps1
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
- ⚠️ 全自动机翻仍是"能看懂"级（缺陷已清零但表达生硬）；发布级 = `--mt agent` 精译（或机翻 + 小循环 8 的人工校对回写）。
- ⚠️ 语音保护会连带保住"对白压在黑屏/字幕卡"上的黑场（已知取舍，验收里单独标注）。
- ⚠️ 模型下载通道受限（HuggingFace 全域不可达），未能用 Whisper 级模型。
- ✅ **双语逐词高亮字幕**（小循环 5）：中文整句 + 英文当前词上色，ASS 输出、随剪辑重映射，像素级验收通过；
  长片规模已实测（小循环 10）：49 分钟 **1030 条 ASS 事件 / 103KB / 生成 0.1s**，libass 正常烧、12/12 帧高亮在；
  口径修正为 **≈1 事件/词**（不是平方级爆炸，对话密集 1h ≈ 8–9k）。
  ⚠️ 词级时间来自 ASR，识别错的地方高亮也会错。
- ✅ **人工校对回写闭环**（小循环 8）：机翻/精译字幕 → 导出带标记的校对表 → 人改中文 → 严格校验后回写 cues+SRT，
  恒等回写逐字节一致、三类误操作全部拒绝；发布流程从此是"机器出稿 + 人改 + 一条命令回灌"。
- ⚠️ **短句漏识已被证伪为"模型上限"**（小循环 7）：干净 TTS 能识别 8/10 的漏句，原片混音 0/10，
  7 条预处理链 × 10 条漏句 = 0 命中 → 再调"喂法"无意义，只能换 Whisper 级模型（本机通道不通，需外部提供）。
  附带落地的只有预处理链：真实影视 `--af "afftdn=nf=-25,highpass=f=200,lowpass=f=4000"`，TOS WER 31.6%→28.4%（代价是词数略降）。
- ✅ **能扛长片**（小循环 9）：49 分钟素材全链路跑通，成片 48.7 分钟、273 条字幕、校对表 273 行、
  回写在 273 行规模下仍逐字节恒等；成本结构清晰——**两次渲染约 22 分钟 + 识别 6.5 分钟，文本层全秒级**。
  顺带修掉两个"只有长片才会暴露"的 bug（回写 trim 破坏恒等、MyMemory 返回 HTML/占位符脏数据）。
- ✅ **内容分诊 + 知识型专项**（小循环 11）：`classify_content` 用可计算信号（语音覆盖/置信度/配乐占比/短句占比/句长/术语密度）
  给出**当前版本**的策略建议——l2 教学片 `knowledge` 0.95，TOS 电影 `narrative` 0.17（配乐占比 0% vs 73%）；
  `normalize_units` 把 `minus sixty sixteen l u fs` → **−16 LUFS**、`15 Mbps`（幂等、只在单位语境动数字），
  中文侧同步统一；`term_candidates` 自动挑术语（长片 61 个 / l2 31 个）。
  ⚠️ 分诊是启发式、单片段调参，属于"当前能力画像"，会随版本迭代变化（不是内容类型定义）。
- ✅ **市场 ↔ 工厂 链路**（小循环 12）：B 站公开接口可直连 → 侦查样本 134 条 + 8 个关键词市场 →
  选出「英文原声 + 中英双语」方向 → 37s 样片（12/12 行双语、88 条高亮事件、QA PASS、WER 9.5%/覆盖 100%）→
  交付包（成片/封面/文案/标签/分区/上传清单/合规声明）→ 反馈追踪器（空表说"待采集"，有数据给 P0 动作）。
  ⚠️ **上架与真实反馈需要人工**（工厂不代登录）；竖屏版与封面文字观感待补。

细节与限制见各 loop 的 README；下一步建议：
1. **换 ASR 模型**（唯一能真正解决漏句的路）—— 需要外部提供模型文件 / 可用下载通道 / 一个 ASR HTTP 接口；
2. 知识型链路继续加厚：货币/百分比单位、术语表回填界面、批量队列、竖屏/多比例模板；
3. 术语一致性 + 多版本字幕对照（都能直接挂在小循环 8 的校对表上）；
4. 语义级断句（当前断句仍是"停顿 + 长度"，从句/长句靠规则）。
