# loop12_market_loop/ — 市场 ↔ 工厂闭环（侦查 → 样片 → 交付包 → 反馈）

> 市场 ↔ 工厂闭环（侦查 → 样片 → 交付包 → 反馈）。关键结果：侦查 134 条、前 8 条 2517 万播放；样片 WER 9.5% / 覆盖 100%、QA PASS；上架与真实反馈仍需人工
> 回链：[AGENTS.md §3.3](../../AGENTS.md) · [循环日志 #loop12](../../History/CircleLog/log.md#loop12) · [Prototype 索引](../Prototype.md)

## 目录内容

| 子目录 | 类型 | 内容量 |
|---|---|---|
| `case_ep01/` | 子目录 | 24 项 |
| `case_market/` | 子目录 | 3 项 |

根目录另有 1 个数据产物文件（.ps1×1），均为本轮产物，不单列。

## 说明（原 `README.md` 正文）

### 小循环 12 · 市场 ↔ 工厂 闭环（侦查 → 开工 → 交付包 → 反馈机制）

> **✅ 本轮通过结束**（人工判定 2026-10-31 17:11，无返工）。链路状态：4 段全部连通——前 3 段验收 PASS；第 4 段「上架」已于 2026-10-31 完成（[BV1AaxC6hExH](https://www.bilibili.com/video/BV1AaxC6hExH/)）；「反馈」已自动化（**每 30 分钟**采集一次 + 有信号时生成下一轮提案），真实数据从 T+1 起积累。
> 一句话证据链：真实 B 站公开数据 → 选出「剪辑技巧（英文原声 + 中英双语）」→ 37s 可发布样片（QA PASS）→ 交付包齐全 → 反馈追踪器可运行。

#### 1. 这一轮验证的是什么

不是单点技术指标，而是**闭环能不能转**：

```
市场侦查 → 选题 → 工厂开工 → 可交付包 → 上架 → 反馈采集 → 下一轮提案
   ✅        ✅      ✅          ✅      ✅已发布   ✅每30分钟    ✅写进 plan.md（等人点头）
```

#### 2. 侦查：市场数据是真的（不是编的）

`Tool/ops/recon_bilibili.mjs` 直连 B 站**公开**接口（`ranking/v2`、`popular`、`search/type`）。2026-10-30 首跑时 5 个关键词全部 200、0.2–0.4s；**2026-10-31 重跑时有 1 个词（"科普"/"编程教程 英文"）返回 HTML 被脚本容错跳过**，其余仍 200 —— 即"全部 200"只是当日快照，不是恒定状态。

- 榜单样本 **134 条**（分区：搞笑/日常/电子竞技…；时长：1–5 分钟最多 58–60 条）
- 关键词市场（每个词封顶 1000 条结果，**数据为 `case_market/market_report_niche.md`，另有默认 6 词版 `market_report.md`**）：

| 关键词 | 前 8 条播放合计（10-30） | 10-31 重跑 | 解读 |
| --- | --- | --- | --- |
| 编程教程 英文 | **2517 万** | 抓取失败（跳过） | 英文长教程受众最大 |
| Blender 教程 双语 | **1903 万** | 1909 万 | 软件教程 + 双语是刚需 |
| TED 中英 | 1288 万 | 1254 万 | 需求大、供给多是"搬运+机翻" |
| **剪辑教程 英文** | **418 万** | 438 万 | 与工厂现有素材/能力最贴合 → **本期选它** |

> 口径提醒：上表最大值是"**方向验证**"（证明英文原声+双语有需求），**不是**本期选题；本期做的是「剪辑技巧」（438 万）。验收表里这两件事分两行列。

候选打分 = 题材匹配(0.45) × 热度(0.30) × 互动(0.25)，全部可复现（见 `case_market/market_report.md`）。

#### 3. 开工：一条能直接发的样片

| 项 | 数值 |
| --- | --- |
| 成片 | `case_ep01/final_16x9.mp4`（1280×720 / h264 / 30fps / AAC 48k，19MB） |
| 时长 | 37.375s（2026-10-31 重跑实测；首跑 37.374s） |
| 字幕 | **12/12 行双语**，逐词高亮 ASS（**88 条事件**；其中词级 81 条 + 中文整句 7 条） |
| 质检 | **PASS**（−16.3 LUFS / 真峰 −1.8 dBTP / 音画差 0.008s / 黑场 0 / 冻帧 0） |
| 高亮像素验收 | **12/12** 帧有高亮、**12/12** 帧单块不重影、重心位移 **391px**（`verify_karaoke`，扫像素不靠肉眼） |
| 识别 | WER **9.5%**、语音覆盖 **100%**（对合成语音；109 词 / 7 句） |
| 单位 | 正文里 `−16 LUFS`、`15 Mbps`、`−1 dB` 全部规范（小循环 11 的能力） |
| 封面 | `case_ep01/cover_16x9.jpg`（标题+副标题+角标） |

素材合规：画面 Big Buck Bunny（CC-BY 3.0）+ Edge TTS 合成语音 —— **不涉及搬运侵权**，可以直接公开。

#### 4. 交付包（`case_ep01/`，原 `Deliverables/ep01_editing_tips/` 已并入）

成片 / 封面 / 双语 SRT / 高亮 ASS / **发布文案**（3 版标题、简介、标签、分区、置顶评论）/ **上传清单** / 合规声明 / `feedback.csv`。

目录（2026-10-31 目录整理后，交付包与本轮快照同目录，根目录只留约定目录）：

```
case_ep01/
├── publish.md  cover_16x9.jpg  desc_publish.txt      # 发布物料（含 2026-10-31 线上回执）
├── final_16x9.mp4                                    # 入库快照（唯一入库 mp4，供干净的 clone 回填）
├── render_16x9/                                      # 成片与质检（final.mp4 / qa.json / probe.json / report.md，mp4 不入库）
├── subs/  bilingual.srt  karaoke.ass                 # 双语字幕 + 逐词高亮
├── transcript*.json  verify_subs.json  zh_agent.json # 识别/对齐/验收留痕
├── script.txt  script_en.txt  ground_truth.json      # 讲稿与真值（WER 基准）
├── source.mp4  speech.wav                            # 源片与合成音（可再生，不入库）
└── feedback.csv  feedback_report.md  feedback_report.json  feedback_template.csv
```

上架（2026-10-31 已由代理在用户授权下完成，`Tool/ops/publish_bilibili.mjs`）：
1. 上传成片 + 封面，填标题/简介/7 标签/知识分区；
2. 创作声明勾选"含 AI 生成内容"，正文声明画面 CC-BY、语音合成；
3. 线上回执：标题 A 版、**BV1AaxC6hExH**；发布后把 T+1/T+3/T+7 数据填进 `feedback.csv`。

#### 5. 反馈与迭代：从「手填 CSV」升级为「自动感知 + 自动规划」

```powershell
# 一条命令跑完：采集 → 诊断 → 排下一轮
node Tool\ops\watch_feedback.mjs
```

三个环节各自可单跑（各自有用法头，可单独复现）：

| 脚本 | 干什么 |
| --- | --- |
| `Tool\ops\collect_feedback.mjs` | 采 B 站**公开**接口：播放/点赞/投币/收藏/评论数/分享/弹幕数 + **评论原文** + **弹幕原文（带秒数）** + 粉丝总数 → 写 `feedback.csv`（每天一行，同日重跑只刷新数值，人工备注保留） |
| `Tool\ops\track_feedback.mjs` | 完播率/点赞率/收藏率/评论率/千播涨粉 + 环比 + P0/P1 动作（空数据明确输出"待采集"，不编） |
| `Tool\ops\plan_next_loop.mjs` | 把信号翻成**下一轮任务书** → `History\loops\next\plan.md`：目标 / 改哪个脚本哪个参数 / 验收阈值 / 成本 / 风险 |

- **感知是定时的**：已挂 automation（**每 30 分钟一次**，至 2026-11-14），到期前不用人催。日内时序落在 `History/runs/feedback/ticks.jsonl`（一 tick 一行），用来判断推荐流从哪一刻起没再推。
- **规划不等于开跑**：`plan.md` 顶部写死"待批准"，开轮次仍要人点头（AGENTS 的人环规则）。
- **拿不到的指标不编**：平均播放时长/完播率只有登录态创作中心有，`avg_watch_s` 留空并提示用 `--avg-watch <秒>` 补录；空值不会被当成 0（踩过：`Number('')===0` 会让"没填"变成"完播率 0%"，推出假的 P0"重做前 3 秒"）。
- `plan_next_loop.mjs --demo` 用**内置合成样本**验证 10 条规则能跑，产物落 `_demo/`，不碰正式 `plan.md`。
- 规则阈值集中在 `plan_next_loop.mjs` 的 `const T`（几条反馈才算数 = `hitMin`，几天算冷启动 = `coldStartDays`），词表在同文件的 `const CLS`。

#### 6. 本轮修的 3 个 bug（都属于"市场化才暴露"）

1. 合片默认流选择取到了画面自带配乐 → 成片没口播、ASR 0 词（`acceptHits=7` 全空，极像模型坏了）→ 显式 `-map 0:v:0 -map 1:a:0`；
2. 手工写的 `zh_agent.json` 带 BOM → `make_subs` 解析崩 → 统一 `readJson()` 去 BOM；
3. TTS 词间无停顿 → `restore_punct` 把 7 句并成 5 句还串行 → 新增 **`align_script.mjs`**（有讲稿/官方字幕时按真值句子强制对齐词流，109 词 → 7 句，覆盖 100%）。

#### 7. 验收（9 项，`acceptance.md`）

侦查有数据 / 有需求方向已验证 / 成片可发布 / 双语齐全 / 高亮存在 / 识别够用 / 交付包完整 / 空反馈诚实 / 规则可跑 —— **9/9 PASS**。

**可一键复现，无需先出片**：`node Tool/acceptance/run_market_loop_acceptance.mjs`。
交付位 `case_ep01/render_16x9/final.mp4` 因 `.gitignore`（mp4 不入库）在干净 clone 后不存在，脚本会**自动从同目录快照 `case_ep01/final_16x9.mp4` 回填**，并在验收表里标注"成片由 Prototype 快照回填"，不隐藏来源。

#### 8. 怎么复现

```powershell
.\Prototype\loop12_market_loop\reproduce.ps1     # 全链路重跑（需网络：B 站 + Edge TTS）
node Tool\acceptance\run_market_loop_acceptance.mjs   # 只验已有产物（快照回填，秒级）
```

流程：市场侦查 → 造 37s 样片 → 识别 → 讲稿强制对齐 → 精译字幕 → 逐词高亮 → 烧入 → 封面 → 反馈追踪 → 验收。
无需登录任何平台；样片素材全部可授权。

依赖（`Tool/setup/`）：ffmpeg（79MB×2，npmmirror）、`bootstrap_asr`（koffi/vosk/edge-tts，82MB）、`fetch_vosk_model`（39MB，分段续传）、CC-BY 画面素材。

#### 9. 还没做（挂账）

1. **真实反馈数据**（T+1/T+3/T+7 回填 `feedback.csv`，视频已上线）；
2. **竖屏 9:16 版**（抖音/视频号）——字幕字号与换行要另配一套；
3. **封面文字是否压主体**需人眼确认（我读不了图）；
4. 选题雷达常态化（每天跑一次侦查，自动积累选题库）；
5. 真实搬运类内容涉及版权，工厂只能做"可授权素材 + 自有内容"，这条边界要人确认。

#### 10. 2026-10-31 全链路重跑记录

在干净 clone（`Workspace/` 全空）上从零重建依赖并完整重跑，用于验证"这条链路离开原机器还能不能转"。

| 环节 | 本次实测 | 与 10-30 产物对比 |
| --- | --- | --- |
| 依赖 | ffmpeg 6.1.1（79MB×2，37s）、koffi/vosk/edge-tts（82MB，53s）、Vosk 模型（41MB，36s） | 全部从 npmmirror / alphacephei 重新拉取 |
| Edge TTS | 7 句、语音总长 37.38s | 与首跑一致（同讲稿同音色） |
| ASR | 109 词 / **2 句** / 平均置信度 0.9759 | 词数一致；2 句正是"TTS 无停顿"的已知现象，靠 `align_script` 修正 |
| 对齐 | 7 句 / 109 词全覆盖，时间码 0.00–3.25 … 32.20–37.38 | 与首跑时间码逐句一致 |
| 高亮 ASS | 7 句 + 81 个词级事件 = **88 条 Dialogue** | 完全一致 |
| 渲染 + QA | 37.375s / **−16.3 LUFS** / −1.8 dBTP / 音画差 0.008s / 黑场 0 / **冻帧 0** | 响度与真峰完全一致；首跑冻帧 17 段（本次 BBB 素材无冻帧） |
| 字幕验收 | WER **9.5%** / 覆盖 **100%** | 完全一致 |
| 高亮像素验收 | 12/12 帧有高亮、12/12 单块、重心位移 391px | 首跑未做该项，本次补上（不靠 ASS 自证） |
| 市场侦查 | 134 条样本；Blender 1909 万 / 剪辑 438 万 / TED 1254 万；**"编程教程 英文"当日抓取失败** | 量级一致；最大需求词因此从"编程"变成"Blender" |

**同时修掉的环境 bug**（都已落进 `Tool/setup/`）：

1. `bootstrap_asr.mjs`：Node 在 Windows 解析到的 tar 可能是 system32 的 bsdtar，绝对路径 `F:\...` 里的盘符被当作远程主机（`Cannot connect to F:`）→ 改成 cwd 到缓存目录 + 正斜杠相对路径。
2. `fetch_vosk_model.mjs`：模型包是 **zip** 不是 tar，GNU tar 解不了；且 bsdtar 同样怕盘符 → 显式优先调用 `%SystemRoot%\System32\tar.exe`，失败再退回 `tar`。
3. `run_market_loop_acceptance.mjs`：干净 clone 缺成片时自动从快照回填；验收表把"方向验证（最大需求词）"与"本期选题"拆成两行，避免误读。

**留痕澄清**：10-30 首跑的产物内部时间戳是 17:44–17:53（`market_report`/`qa`/`acceptance`），而 CircleLog 记录本轮"18:05 开工"，两者不一致——原始产物疑似来自更早的一次会话（`verify_subs.json` 里还留着 `D:\Data\DeepseekHarness\...` 路径）。本次重跑已让产物时间戳与日志自洽，此后再出现偏差即可视为真问题。

## 验收记录（原 `acceptance.md` 正文）

### 小循环 12 · 市场 ↔ 工厂 闭环验收（自动生成）

> 生成时间：2026-10-31T09:17:57.082Z　交付包：`Prototype\loop12_market_loop\case_ep01`

#### 判定

**PASS**

| 环节 | 检查 | 结果 | 数据 |
| --- | --- | --- | --- |
| A 侦查 | 拿到公开市场样本 | ✅ | 134 条榜单 / 60 个候选 |
| A 侦查 | 有需求方向已验证（取最大需求词） | ✅ | 「Blender 教程 双语」前 8 条 1909 万播放（方向证据，非本期选题） |
| A 侦查 | 本期选题与能力匹配 | — | 「剪辑教程 英文」438 万播放，见 `Prototype\loop12_market_loop\case_ep01\publish.md` §1 |
| B 开工 | 成片可发布（时长/编码/质检） | ✅ | 37.375s 1280x720 h264 / QA PASS |
| B 开工 | 双语字幕齐全 | ✅ | 12/12 行双语 |
| B 开工 | 逐词高亮（ASS） | ✅ | 88 条事件 |
| B 开工 | 识别质量够用 | ✅ | WER 9.5% / 覆盖 100.0% |
| C 交付 | 发布文案/标签分区/上传清单/合规 | ✅ | 6/6 |
| D 反馈 | 空数据时诚实标"待采集" | ✅ | |
| D 反馈 | 规则能跑并给出动作 | ✅ | 自检 4 条动作（DRY-RUN） |

#### 链路状态（诚实版）

| 段 | 状态 | 说明 |
| --- | --- | --- |
| ① 市场侦查 | ✅ 已跑 | B 站公开接口（ranking/popular/search）可直连；产出 `market_report.md`（样本/分区/时长/关键词市场/候选排序） |
| ② 工厂开工 | ✅ 已跑 | 37s 样片：合成口播 → 识别 → **讲稿强制对齐** → 精译 → 逐词高亮 → 烧入 → 质检 PASS |
| ③ 交付市场 | ⏳ 待人工 | 交付包已就绪（成片/封面/文案/标签/分区/合规声明）；**上架需要你的账号**，工厂不代登录 |
| ④ 反馈追踪 | ⏳ 待数据 | `feedback.csv` 目前为空；追踪器已能算完播/点赞/收藏/评论率并给 P0/P1 动作（自检用 DRY-RUN 合成数据验证） |
| ⑤ 迭代 | ⏳ 待反馈 | 迭代规则已就绪（完播<35% → 重做前 3 秒；评论提字幕 → 调字号/CPS；提译文 → 走校对回写重发） |

#### 这一轮暴露并修掉的问题

| 问题 | 现象 | 修法 |
| --- | --- | --- |
| 合成素材音轨取错 | 成片里是影片自带的配乐，ASR 0 词（acceptHits=7 但全空） | `make_episode` 显式 `-map 0:v:0 -map 1:a:0` |
| BOM 让 JSON 解析崩 | 手工写的 `zh_agent.json` 带 BOM → `Unexpected token` | `make_subs` 统一 `readJson`（去 BOM） |
| TTS 词间无停顿 → 断句崩 | `restore_punct` 把 7 句并成 5 句且串行（"number two" 被吃） | 新增 `align_script.mjs`：有讲稿时按真值句子强制对齐词流 |

#### 复现

```powershell
node Tool\acceptance\run_market_loop_acceptance.mjs
```
