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
- 交付包：`Prototype/loop12_market_loop/case_ep01/`（成片/封面/双语 SRT/高亮 ASS/文案/反馈表；原 `Deliverables/ep01_editing_tips/` 已并入）
- 快照：`Prototype/loop12_market_loop/`（含 37s 样片，唯一入库的视频，8MB）
- 验收：`History/loops/loop12/acceptance.md`（9 项，PASS）

## 还没做的（明确挂账）

1. **上架**：2026-10-31 已在用户授权下由代理自动完成（`Tool/ops/publish_bilibili.mjs`，BV1AaxC6hExH）；待 T+1/T+3/T+7 把数据填 `Prototype/loop12_market_loop/case_ep01/feedback.csv`；
2. **真实反馈/迭代**：现在只有机制，没有数据 —— 有 T+1 数据后跑 `track_feedback.mjs`，按 P0 动作改；
3. **竖屏版（9:16）**：B 站横屏为主，但抖音/视频号需要竖屏，字幕字号/换行要单独一套参数；
4. **封面文字是否压主体**：我读不了图，需要人眼确认（`cover_16x9.jpg`）；
5. **选题库常态化**：现在是一次性侦查，可以做成"每天跑一次的选题雷达"（同一脚本 + 定时）。

## 2026-10-31 目录整理（结构变更，路径以本节为准）

- `Deliverables/ep01_editing_tips/` **并入** `Prototype/loop12_market_loop/case_ep01/`：AGENTS.md 只允许根目录出现 `Idea/ Prototype/ History/ Tool/ Workspace/`，交付包属"反馈产物"，与快照同目录最省心。本文件上文出现的旧路径按当时语境保留。
- 去重：`cover_16x9.jpg` / `ground_truth.json` / `karaoke.ass` / `feedback_template.csv` 两处 sha256 完全一致，只留一份；`publish.md`、`feedback_report.md` 取交付包内的新版（含 2026-10-31 线上回执）。
- 临时件 `render_16x9/{.work,.qa,.karaoke_verify}` 与 `.asr_work` 移到 `Workspace/loop12_ep01_intermediate/`（ffmpeg 分段缓存，可直接删）。
- 发布留痕从 `Workspace/` 迁到 `History/publish/bilibili/`：`runs/` 为脚本产物（截图 + run.log + 回执），`adhoc/` 为调试截图；`publish_bilibili.mjs` 的产物目录同步改成 `History/publish/bilibili/runs`。登录态仍留 `Workspace/.bili_profile`（临时、不入库）。
- 路径全量更新：`run_market_loop_acceptance.mjs`（默认 `--ep`）、`make_episode.mjs`（默认 `--out`）、`track_feedback.mjs`（用法注释）、`Tool/ops/ops.md`、`Prototype/loop12_market_loop/README.md`、`case_ep01/publish.md`、`case_ep01/render_16x9/report.md`；`Prototype/loop12_market_loop/acceptance.md` 从 `History/loops/loop12/acceptance.md` 重新同步。**验收重跑仍 9/9 PASS。**
- 顺带修的两个真问题：① `track_feedback` 遇到"播放为 0 的 T0 基线行"会推出假动作（"重做前 3 秒"），改为识别基线、标"待采集"；② `.gitignore` 两行编码坏掉的注释修正，并补 `Prototype/**` 的 `.work/.qa/.karaoke_verify`、`*.mp4`、`*.wav` 规则（保留 `final_16x9.mp4` 例外）。
- 遗留：`case_ep01/**/*.json`（`qa.json`/`edits.json`/`probe.json`/`cues.json`/`transcript*.json`）里的 `file` 字段仍是旧绝对路径——那是产物生成时写死的值，重跑一遍流程才刷新，不影响验收与交付。
