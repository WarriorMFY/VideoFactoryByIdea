# State.md — 基于 Idea 走过的路

> **定位**：`Idea.md` 是「要去哪」（人写，LLM 只读）；本文件是「走到哪了」（LLM 收工时更新）。
> **与日志的分工**：`History/CircleLog/log.md` 是逐轮流水，记录怎么走过来的；本文件把同一条路压成**一张当前快照**——现在在哪、能做什么、还差什么。
> 回链：[Idea.md](Idea.md) · [循环日志](../History/CircleLog/log.md) · [Prototype 增量清单](../Prototype/Prototype.md) · [AGENTS.md](../AGENTS.md)

**起点**：2026-10-27 10:44「搭建一个视频剪辑工厂，以原视频为基础材料，内部完成剪辑、修订，最后交付」。
**周期**：想法驱动，时间不限。

---

## 一、当前状态（诚实版）

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

## 二、下一步建议

1. **换 ASR 模型**（唯一能真正解决漏句的路）—— 需要外部提供模型文件 / 可用下载通道 / 一个 ASR HTTP 接口；
2. 知识型链路继续加厚：货币/百分比单位、术语表回填界面、批量队列、竖屏/多比例模板；
3. 术语一致性 + 多版本字幕对照（都能直接挂在小循环 8 的校对表上）；
4. 语义级断句（当前断句仍是"停顿 + 长度"，从句/长句靠规则）。

## 三、复现入口（早期 12 轮，在仓库根执行）

小循环 1–12 各自留有 `reproduce.ps1`，脚本幂等：已装好的依赖、已下载的模型与素材会复用；耗时主要卡在首次下载
（ffmpeg ~160MB、Vosk 英语模型 39MB、ToS 电影 355MB——后者在 dotsrc 镜像 + 8 线程下约 2 分钟）。

```powershell
.\Prototype\loop1_autocut\reproduce.ps1            # 自动剪辑：装 ffmpeg → 造 A/B 用例 → 流水线 → 真值验收 → 成片质检
.\Prototype\loop2_subtitles\reproduce.ps1          # 外语视频→中文字幕：ASR 依赖 + 拉模型 → 识别/翻译/重映射/烧入
.\Prototype\loop3_real_speech\reproduce.ps1        # 真实素材：下 Sintel CC-BY → 带语音保护剪辑 → 字幕 → 验收
.\Prototype\loop4_multi_samples\reproduce.ps1      # 多样本：3 真实 + 4 口音 TTS + Tears of Steel → 批量验收 → 快照
.\Prototype\loop5_karaoke_subs\reproduce.ps1       # 双语逐词高亮：生成 ASS → 烧入 → 像素级客观验收
.\Prototype\loop6_text_quality\reproduce.ps1       # 字幕文本层：标点恢复 → 三种翻译变体 → 回归 → 精译样片
.\Prototype\loop7_short_utterance\reproduce.ps1    # 短句救援：TOS + 官方字幕 → 预处理链穷举/证伪探针 → 验收
.\Prototype\loop8_review_loop\reproduce.ps1        # 校对回写：导出校对表 → 恒等回写 → 真实改动 → 误操作拦截
.\Prototype\loop9_long_video\reproduce.ps1         # 49 分钟压测（冷跑约 25 分钟）
.\Prototype\loop10_karaoke_scale\reproduce.ps1     # karaoke 长片规模（依赖 loop9 产物，约 1 分钟）
.\Prototype\loop11_knowledge_content\reproduce.ps1 # 知识型链路：分诊 → 单位规范化 → 术语候选 → 8 项验收
.\Prototype\loop12_market_loop\reproduce.ps1       # 市场闭环：B 站侦查 → 37s 样片 → 交付包 → 反馈追踪
```

## 四、当前能力怎么用（拿自己的视频）

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

---

## 五、本文件怎么维护

- **谁写**：LLM，在每轮小循环收工时与 `log.md` 同批更新（一样是"该写时不写就会烂"的东西）；
- **写什么**：只写**当前仍成立**的能力与短板。被后续轮次推翻的结论要删掉或改写，不保留历史——历史在 `log.md`；
- **不写什么**：不写逐轮过程、不写待办清单（那在 `Prototype.md` 进度板与日志里）。
