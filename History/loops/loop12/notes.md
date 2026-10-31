# 小循环 12 · 过程笔记（市场 ↔ 工厂 闭环）

## 一句话

链路**前三段已跑通并验收 PASS**：能读真实市场数据（B 站公开接口直连）→ 能挑出"能力匹配的题" → 能产出一条可发布样片（37s，双语+逐词高亮，QA PASS）；
**第四段（上架/真实反馈）停在人工关卡**：工厂不代登录，交付包与反馈机制已就绪；本轮按人要求**暂停并留痕**。

## 时间线（实际发生）

| 时间 | 动作 | 结果 |
| --- | --- | --- |
| 18:0x | 探路：Node fetch 直打 B 站 4 个入口 | `popular`/`ranking`/`search`/首页 **全部 200**，0.2–0.4s（这是本轮最大的意外收获） |
| 18:1x | 写 `Tool/ops/recon_bilibili.mjs` 并跑榜单侦查 | 样本 134 条；分区前 3：搞笑/日常/电子竞技；时长 1–5min 最多 |
| 18:2x | 补关键词市场（TED/编程/Blender/剪辑/纪录片等 8 个词） | 单关键词命中量均封顶 1000；「编程教程 英文」前 8 条 2517 万播放，「Blender 教程 双语」1903 万 → **"英文原声+双语"是验证过的需求** |
| 18:3x | 定选题：剪辑技巧（与工厂现有素材/能力最贴合，且市场关键词有 418 万播放） | 交付《EP01 5 个剪辑提速技巧》 |
| 18:4x | 造素材：`Tool/ops/make_episode.mjs`（Edge TTS 7 句 + BBB 循环画面） | 37.37s / 1280×720 |
| 18:5x | ASR → 标点 → 精译 → 双语字幕 → 逐词高亮 ASS → 烧入 | 12 行双语（100%）、88 条 ASS 事件；**QA PASS**（−16.3 LUFS / 峰值 −1.8 dBTP） |
| 19:0x | 封面 + 发布文案 + 反馈表 + 追踪器 | 交付包齐全；追踪器空数据输出"待采集"、自检输出 4 条动作 |
| 19:1x | 验收 `run_market_loop_acceptance.mjs` | **9/9 PASS**（WER 9.5% / 覆盖 100%） |
| 19:2x | 人要求："先停下，把当前进度记下来，推送到远端" | 本轮暂停（不是失败），状态入日志 |

## 本轮修的三个 bug（都是"上了市场才发现"的那类）

1. **合成素材取错音轨**：`-stream_loop` 画面自带配乐，ffmpeg 默认流选择挑了它 → 成片里没有口播，ASR 0 词（`acceptHits=7` 但结果全空，很像模型坏了）。
   修法：`make_episode` 显式 `-map 0:v:0 -map 1:a:0`。
2. **BOM 让 JSON 解析崩**：手工写的 `zh_agent.json` 带 UTF-8 BOM → `make_subs` 报 `Unexpected token`。
   修法：`make_subs` 统一 `readJson()`（去 BOM），glossary/cache/zh-file 全走它。
3. **TTS 词间无停顿 → 断句崩**：`restore_punct` 靠"停顿分位"，TTS 词时间轴首尾相接（gap 中位数 0.000s），7 句被并成 5 句还串行（`number two` → `number to`）。
   修法：新增 **`Tool/subtitle/align_script.mjs`** —— 有讲稿/官方字幕时，按真值句子强制对齐词流（109 词 → 7 句，覆盖 100%）。

## 交付物

- 市场：`History/loops/loop12/market_report.md`（+ `niche/market_report.md` 关键词市场）
- 交付包：`Deliverables/ep01_editing_tips/`（成片/封面/双语 SRT/高亮 ASS/文案/反馈表）
- 快照：`Prototype/loop12_market_loop/`（含 37s 样片，唯一入库的视频，8MB）
- 验收：`History/loops/loop12/acceptance.md`（9 项，PASS）

## 还没做的（明确挂账）

1. **上架**：需要人用自己账号发布（工厂不代登录）；发布后把数据填 `Deliverables/ep01_editing_tips/feedback.csv`；
2. **真实反馈/迭代**：现在只有机制，没有数据 —— 有 T+1 数据后跑 `track_feedback.mjs`，按 P0 动作改；
3. **竖屏版（9:16）**：B 站横屏为主，但抖音/视频号需要竖屏，字幕字号/换行要单独一套参数；
4. **封面文字是否压主体**：我读不了图，需要人眼确认（`cover_16x9.jpg`）；
5. **选题库常态化**：现在是一次性侦查，可以做成"每天跑一次的选题雷达"（同一脚本 + 定时）。

---

## 路径迁移说明（2026-10-31，方案 A）

> 上文提到的 `Deliverables/ep01_editing_tips/` 已按 AGENTS.md 目录约定迁移，**旧记录保留原样**，以新位置为准：

| 内容 | 旧位置 | 新位置 |
| --- | --- | --- |
| 构建产物（transcript / edits / verify / render 中间件） | `Deliverables/ep01_editing_tips/` | `Workspace/deliverables/ep01_editing_tips/`（可重建，不入库） |
| 可发布成品快照（成片/封面/双语SRT/高亮ASS/文案/上传清单） | 同上 | `Prototype/loop12_market_loop/case_ep01/`（不变，入库） |
| 人工反馈表与反馈报告 | `Deliverables/ep01_editing_tips/feedback.csv` | `Prototype/loop12_market_loop/case_ep01/feedback.csv` |

迁移后复跑：`node Tool\acceptance\run_market_loop_acceptance.mjs` → 9/9 PASS。
