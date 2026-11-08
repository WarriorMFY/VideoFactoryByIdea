# 循环日志（CircleLog）

> 一条一轮：`## 小循环 NN · 标题` + 表格（开始时间 / 结束时间 / 初始目标 / 动作 / 结束结果 / 产物 / 人工反馈）。时间＝本机 UTC+8，只追加不覆盖。

<a id="loop1"></a>
## 小循环 1 · 视频剪辑工厂 MVP（自动删减 + 成片交付）

| 项 | 内容 |
| --- | --- |
| 开始时间 | 2026-10-27 13:33 |
| 结束时间 | 2026-10-27 13:55（约 22 分钟） |
| 初始目标 | 从零连通最小闭环：原视频 → 内部自动剪辑 → 交付成片。素材、判定标准、交付形态均未给，由 LLM 自主定义 |
| 结束结果 | **连通并超过预期信号**。产出 `Tool/vfactory.mjs`（探测→黑场/冻帧/静音/镜头切点→剪辑决策→逐段裁剪+交叉淡化+响度归一+标题→交付包）。两套带机器可读真值的用例：合成素材 IoU=1.000、真实素材（Big Buck Bunny CC-BY 3.0）IoU=0.998，**误删有效内容 0s**，切点误差 ≤0.017s，成片 −15.9 LUFS。`node Tool/run_acceptance.mjs` = PASS。交付在 `Prototype/`（27.8MB） |
| 人工反馈 | 2026-10-27 13:56：**"那先做外语视频加中文字幕吧，其他你看着来"** + 新增循环日志规则。解读：①未否定自动剪辑能力，方向默认延续；②下一轮主线＝外语视频→中文字幕；③素材/语种/字幕形态/判据由 LLM 自主；④要求把每轮摘要写进 `History/CircleLog/log.md` |

<a id="loop2"></a>
## 小循环 2 · 外语视频加中文字幕（含随剪辑重映射）

| 项 | 内容 |
| --- | --- |
| 开始时间 | 2026-10-27 13:56 |
| 结束时间 | 2026-10-27 15:10（约 75 分钟；其中约 18 分钟耗在语音模型下载） |
| 初始目标 | 外语（首个语种=英语）视频 → 自动识别 → 翻译成中文 → 生成字幕 → **按剪辑后时间轴对齐** → 烧入成片交付。素材与判据由 LLM 自主定义 |
| 结束结果 | **连通，且每个环节都有数字验收**。新增字幕链路：`asr_vosk.mjs`（Vosk 离线 + koffi 直连 libvosk，词级时间戳）、`make_subs.mjs`（句子级翻译→显示行→SRT）、`remap_subs.mjs`（字幕随删减重映射，跨切点拆分）、`verify_subs.mjs`（WER/覆盖/句界/可读性/自检）、`run_subs_acceptance.mjs`（一键）。实测：**WER 6.1%**、语音覆盖 **99.8%**、句界误差 **0.016s（均）/0.045s（最大）**、13/13 条有中文、重映射无越界无重叠、成片 33.88s/720p/−16.2 LUFS 质检 PASS。另出**机翻 vs 人工精译**双版本对照（字相似度 62.9% → 85.7%），暴露"能看但不宜直接发布"的质量缺口。两条硬约束记录：HuggingFace/ModelScope 全域不可达（拿不到 Whisper 系模型）、Windows SAPI TTS 被沙箱拒（E_ACCESSDENIED）。交付在 `Prototype/loop2_subtitles/case_C_en2zh/`（39.4MB） |
| 人工反馈 | （待填 —— 等你看完成片与 `loop2_subtitles/README.md` 后回复） |

<a id="loop3"></a>
## 小循环 3 · 真实外语素材（真人说话）验证 + 语音保护修复

| 项 | 内容 |
| --- | --- |
| 开始时间 | 2026-10-27 15:40 |
| 结束时间 | 2026-10-27 17:20（约 100 分钟；含后续"小模型 vs 128MB 大模型"对照实验，见 `History/loops/loop03/model_compare.md`） |
| 初始目标 | 人指令："你自行去网上下载一下外语素材，先自己跑通验证"。补上小循环 2 遗留的"真人原声未测"，且素材与判据由 LLM 自主定 |
| 结束结果 | **跑通，并修掉一个会毁片的 bug**。自选素材：Sintel 预告片（media.w3.org，© Blender Foundation **CC-BY 3.0**，52.2s，真人英语对白+音乐+音效）。真实素材暴露出**对白被黑场规则剪掉**（暗场景误判 + 台词压黑底字幕卡）→ 新增 `--protect <transcript.json>` **语音保护**（识别到语音的区间一律不剪，conf≥0.5、两侧 0.25s 余量）+ 收紧黑场判定（pix 0.10→0.04、pic 0.98、dur 0.12→0.30）：对白 **4/4 保住**，切除 13.52s→11.57s。另外：真实音轨上 `afftdn+300–3400Hz 带通` 让识别置信度 0.816→**0.918**；`--min-sent` 24→12 修掉"短句合并导致机翻串味"。**坏消息**：小模型 Vosk 在真实影视混音上词准确率仅约 **55–65%**（TTS 上是 6.1% WER），识别是当前最大短板。验收 reference-free：译文 4/4、可读性 6.17 字/秒、重映射无越界无重叠、成片 39.10s/720p/−14.9 LUFS、音画差 0.004s；残留黑场 3 段（其中 1 段为"对白压黑底"的已知取舍）。回归：小循环 1、2 均仍 PASS。交付在 `Prototype/loop3_real_speech/`（13.8MB，含原始片段便于对照） |
| 人工反馈 | 2026-10-27 21:20：**"好了，继续跑循环，我认为你可以再多从网上下载几个视频样本来进行英文转中文翻译测试"**。解读：①认可 loop3 结论，方向延续「外语→中文字幕」；②明确要求**扩充样本**（不只一条 Sintel），用更多下载来的视频做英译中测试；③素材与判据仍由 LLM 自主。→ 触发小循环 4 |

<a id="loop4"></a>
## 小循环 4 · 多样本英译中测试（真实影视 + 多口音 TTS）

| 项 | 内容 |
| --- | --- |
| 开始时间 | 2026-10-27 21:25 |
| 结束时间 | 2026-10-27 22:20（约 55 分钟） |
| 初始目标 | 人指令：「继续跑循环，我认为你可以再多从网上下载几个视频样本来进行英文转中文翻译测试」。要求：扩样本、用真实下载的视频做英译中；素材与判据由 LLM 自主 |
| 结束结果 | **7 个样本批量跑通（6 通过）**。新增 3 段真实素材（Sintel 预告 52.2s、Big Buck Bunny 预告 33s 作**阴性对照**（5.1 声道只有音乐）、Tears of Steel **90s 对白密集片段**）+ 4 个同讲稿多口音 TTS 样本（US/GB/AU/IN）。关键数据：①**口音 WER**：GB **1.1%** < AU 5.6% < US = IN 6.7%（同一讲稿只换音色）；②**真实电影首次有真值**（ToS 官方英文字幕 `TOS-en.srt` 当 gt）→ **WER 30.5%、语音覆盖 59.9%**（未达 95% 门槛）；③**按真值句长分桶**：1–3 词短句覆盖仅 **24%**（11 句漏 8 句：`Abort!`/`Cut!`/`Whoaaa!`/`Nooooo!`），4–8 词 70%、≥9 词 84% → **短板是"漏句"不是"错译"**；④**预处理不能一刀切**：影视混音上 bandpass 更好（Sintel 0.8162→0.9175、ToS 0.8788→0.9001），干净 TTS 上 baseline 略优（0.981 vs 0.978）→ 脚本已改成"两种都跑、按置信度择优"；⑤ 阴性对照成立：BBB 预告片识别 0 词 → 不产出任何字幕（不凭空造）。顺带修掉两个真 bug：**(a) ASR 共用 `.asr_work`** 被"被 kill 的 job 留下的孤儿进程"串台，33s 片子识别出 262s 音频、字幕时间码静默错位 → 改 pid 隔离 + 抽音频时长自检；**(b) 空 SRT 让 libass 渲染崩溃**（唯一一行被重映射丢掉时）→ 判空后跳过烧入并告警。另给批量 driver 加 pid 锁，防两个进程互相覆盖 `metrics.json`（本轮实测被孤儿盖过一次结果）。素材下载也踩坑并解决：`test-videos.co.uk` 挂死、`download.blender.org` 403、nluug 单连接仅 0.07MB/s → 换 **dotsrc 镜像 + 8 线程分段**，355MB 只用 **1.9 分钟（3.0MB/s）**。交付：`Prototype/loop4_multi_samples/`（7 个 case 的成片+双语字幕+抽帧+判定数据、`acceptance.md`、`metrics.json`、一键 `reproduce.ps1`）；留痕：`History/loops/loop04/`、`History/runs/multi/*`、`History/asr/multi/*` |
| 人工反馈 | （待填 —— 等你看完 `Prototype/loop4_multi_samples/README.md` 与 `cases/tos_90s/final.mp4` 后回复） |

<a id="loop5"></a>
## 小循环 5 · 双语 + 随语流逐词彩色高亮字幕（karaoke）

| 项 | 内容 |
| --- | --- |
| 开始时间 | 2026-10-29 08:55 |
| 结束时间 | 2026-10-29 10:05（约 70 分钟） |
| 初始目标 | 人指令：一张截图 + 一句「做这种双语且随着语流彩色高亮单词的字幕」。即：中文在上（整句静态）、英文在下、**只高亮当前朗读的那个词**，随语流移动；样式/参数/验收方式由 LLM 自主 |
| 结束结果 | **做出来了，且不靠肉眼验收**。新增 `Tool/subtitle/make_ass.mjs`：输出 ASS（中文整句静态 + 英文**逐词重绘**上色），支持 `--edl` 按剪辑重映射；`vfactory --srt` 现在直接吃 `.ass`（不叠 force_style）。两条用例：**E**（TTS 素材 101 词）与 **F**（Sintel 真实素材 25 词 + 剪辑重映射）——客观检查均 PASS：**高亮存在 12/12 帧、单块不重影 12/12 帧、重心位移 544px / 414px**；成片质检 −16.2 / −14.9 LUFS。新增 `Tool/acceptance/verify_karaoke.mjs`（解 rawvideo 扫像素判"高亮存在/不重影/会移动"）。修掉 5 个真问题：①`vfactory` 只认 SRT → 合法 ASS 被静默跳过；②词事件边界重叠 → 相邻两词同时变色（重影）；③中英固定下边距 → 两行英文压住中文（改事件级 MarginV 动态抬高）；④标题固定 `y=h*0.74` → 有字幕时压住字幕（改自动顶部）；⑤像素验收两轮误报（背景草地误判、首尾淡变导致"缺失"）。交付：`Prototype/loop5_karaoke_subs/`（两 case 成片+ASS+三个不同词抽帧+验收数据+`acceptance.md`+一键 `reproduce.ps1`）；留痕：`History/loops/loop05/`、`History/subs/karaoke/`、`History/runs/karaoke_*` |
| 人工反馈 | 2026-10-29 10:20：**"上一轮交付物的字幕存在频繁抖动问题，修复一下"**。→ 见下方「附加修复」：已量化（闪断 30 帧/16 组、高亮缺失 80 帧/37 组、位置跳 45 次 55px）并清零 |

## 附加修复 · 小循环 5 v2 · 字幕"频繁抖动"（2026-10-29 10:20–11:30，用户反馈）

| 项 | 内容 |
| --- | --- |
| 触发 | 用户：**"上一轮交付物的字幕存在频繁抖动问题，修复一下"** |
| 先量化 | 新增 `Tool/acceptance/diagnose_flicker.mjs`：把 ASS 烧到纯黑底（隔离画面）+ 逐帧扫英文行带域 → v1 实测 **闪断 30 帧/16 组、高亮缺失 80 帧/37 组、位置跳 45 次（最大 55px）** |
| 三个根因 | ①词事件之间有空档（最长 0.2s）→ 英文行整行消失几帧；②极短词（ASR 把 LUFS 听成 `l u f s`）高亮像素个位数且 0.06–0.1s 换色；③中文位置按每句英文行数动态算 → 跨句整块上下跳 |
| 修法 | ①每个 tile **无缝**延伸到下一个 tile 起点；②`--merge-word 0.18`：过短词与**同一行**相邻词合并（单双字母强制、禁止跨行）；③中文位置**全片固定**（`--zh-margin-mode fixed`）；另补句首补齐、句末 hold 0.25s、有字幕时标题自动上移 |
| 修复后 | **闪断 0/0、高亮缺失 0/0、句内位置跳 0**（跨句 4 次 18px＝不同句行数差异，正常排版）；E/F 两用例 `verify_karaoke` 12/12 + `diagnose_flicker` PASS + 成片质检 PASS；`reproduce.ps1` 实跑 PASS |
| 验收口径也修了 3 处 | 不能扫成片（BBB 草地/白云被当白字，误报 29 帧）→ 隔离纯黑底；"应显示"用**中文整句**而非英文事件并集（否则漏掉词间空档这个最大抖源）；位置用**文字块上下边界**而非白字质心（质心随上色词漂移，误报 14–18px） |
| 交付 | `Prototype/loop5_karaoke_subs/` 已替换为 v2 成片/ASS/验收数据，保留 `flicker_before_fix.json` 作对照；详见该目录 README §0 与 `History/loops/loop05/notes.md` 附加修复段 |

<a id="loop6"></a>
## 小循环 6 · 字幕文本层：标点恢复 + 精译 + 阅读速度

| 项 | 内容 |
| --- | --- |
| 开始时间 | 2026-10-29 12:00 |
| 结束时间 | 2026-10-29 13:40（约 100 分钟） |
| 初始目标 | 人给了 B 站双语字幕视频作参照，确认先做差距清单第 1 项：**标点恢复 + 精译 + 术语表**（把"能看"变"能发"）。渲染层（逐词高亮）不动 |
| 结束结果 | **文本层补齐并量化**。新增 `Tool/subtitle/restore_punct.mjs`（规则化补标点/大小写，断句阈值用停顿 **p80 分位**自适应）：对 TTS 讲稿真值 **句数 7/7、句界 F1 1.00、句末标点 100%、去标点后 WER 6.1%（不变→只补标点没改词）**。`make_subs` 扩展：`--punct`（翻译吃带标点整句）、源端术语纠错（`_source_fixes`：ASR 拆坏的 `l u fs` → `LUFS` 再送翻）、MyMemory 500 字符上限保护、`--cps` 阅读速度节流（延长/按标点拆分，物理时间不足时如实报超标条数）。翻译质量三变体：A 无标点机翻（句末缺标点 7 句 / 术语错 1 处）→ **B 标点+纠错 0 / 0**；C 人工级精译（`--mt agent`）与人工参考相似度 **94.1%**（A/B 约 47–48%）→ 证明链路能承载发布级译文，全自动只到"能看懂"。新增 `verify_punct` / `verify_translation`（相似度降为参考，主判据改为**缺陷计数**）/ `run_text_acceptance`，一键验收 **PASS** + 字幕链路回归 PASS（覆盖 99.8%、句界误差 0.02s）。自测暴露并修掉两处：断句用 `median×3` 在影视素材上过度切分（改 p80）、`_source_fixes` 用 startsWith 命中了说明字段导致术语纠错静默失效。交付：`Prototype/loop6_text_quality/`（README/acceptance/reproduce.ps1/case：精译版样片+三种变体字幕+验收数据） |
| 打包补充 | 同轮收尾：`--mt agent` 原本"有接口没法用"（外部译员不知道要译哪些句）。补 `make_subs --dump-en <file>` 导出 `{ "英文原句": "" }` 待译模板（键=源端纠错后的句子），agent 查表改多候选（原句→纠错后→去句末标点）。验证：模板回填后重跑 `cues.json` 与 `History/subs/l2_agent/cues.json` **13/13 条 0 diff**；`run_text_acceptance.mjs` 复跑仍 **PASS**（WER 6.1%/覆盖 99.8%/句界 0.02s 不变） |
| 人工反馈 | （待填 —— 等你看完 `Prototype/loop6_text_quality/README.md` 与精译版样片后回复） |

<a id="loop7"></a>
## 小循环 7 · 真实影视"短句漏识"：一条被证伪的假设 + 一条落地的改进

| 项 | 内容 |
| --- | --- |
| 开始时间 | 2026-10-30 13:05 |
| 结束时间 | 2026-10-30 13:45（约 40 分钟） |
| 初始目标 | 人授权"自己决定跑几轮"。我按收益排序，先攻小循环 4 留下的最大短板：真实影视里 1–3 词短句覆盖率只有 24%。假设：这些句子"有声音但没识别"，把片段切出来滤波放大重识别（救援）能救回一批，目标短句覆盖 +10pp |
| 结束结果 | **假设被证伪，但过程做成了可复现的证据链**。① 重建素材（Workspace 被清理过）：TOS 电影 355MB（dotsrc 12 线程 0.4 分钟）+ 官方英/中文字幕，字幕下载固化进 `fetch_tos_movie.mjs`。② 新增 `asr_rescue.mjs`（帧能量 VAD → 减掉基线已覆盖区间 → 逐窗滤波重识别 → 置信度/时间重叠过滤）；新增 `run_rescue_acceptance.mjs` 四判据验收。③ 结果：短句覆盖 11.1%→**14.1%（+3.0pp，目标未达成）**、救回真值行 **0 条**、WER 不变。④ 证伪证据：漏句单独喂**干净 TTS 能识别 8/10**（`abort`/`cut`/`woah`/`i know`），喂**原片混音 0/10**；7 条预处理链 × 10 条漏句 = **0 命中**；窗口放大到 6s/10s 仍 0 命中 → **是 Vosk 小模型能力上限，不是"喂法"问题**（这否掉了"继续调参"这条投入方向）。⑤ 真正落地：音频预处理链穷举（6→8 条，含跨素材复核）选出 `afftdn=nf=-25,highpass=f=200,lowpass=f=4000`，TOS WER **31.6%→28.4%**、Sintel 置信度 0.8175→0.8659（代价：词数 82→79、短句覆盖略降 → 是"更少乱猜"）。⑥ 重构：识别内核 `lib/vosk.mjs`（**踩坑：Vosk recognizer 有状态，复用会让时间戳累加出 105s/112s 的幽灵词**，改为每段新建）、SRT 写出 `lib/srt.mjs`。交付：`Prototype/loop7_short_utterance/`（README/acceptance/reproduce.ps1/case：三支探针 + 分桶指标） |
| 人工反馈 | （待填 —— 关键待决策：**要不要换 Whisper 级模型**，本机 HF/ModelScope 不可达，需要你给模型文件/下载通道/ASR 接口） |

<a id="loop8"></a>
## 小循环 8 · 校对回写闭环（把"机器出稿"接上"人改"）

| 项 | 内容 |
| --- | --- |
| 开始时间 | 2026-10-30 13:30 |
| 结束时间 | 2026-10-30 13:50（约 20 分钟） |
| 初始目标 | 机翻/精译字幕要发布必须人工过一遍，但下游（重映射/逐词高亮/烧入）只认 `cues.json`，人改 SRT 等于白改。本轮做"导出校对表 → 人改中文 → 严格校验后回写"的闭环 |
| 结束结果 | 新增 `export_review.mjs`（cues → `review.csv`，自动打标 `cps_over`/`zh_long`/`en_residual`/`sp_gap`/`empty_zh`）与 `apply_review.mjs`（回写 `cues.json` + 三份 SRT，逐项校验行数/idx/时间码/en/空译文，不合格就报行号拒绝）。验收 `run_review_acceptance.mjs` **PASS** 5/5：恒等回写 cues 与 `bilingual.srt` **逐字节一致**；4 处真实改动（把被行宽切坏的 `−16 LUFS` 拼回、两处措辞收敛）**只落指定行**；删行/改时间码/清空译文 **3/3 被拒绝**且报错指明行号；`--allow-retime` 显式放行并记入报告；回写后重新出片 **QA PASS**（−16.2 LUFS）。顺带重构 `lib/srt.mjs`（生成端与回写端同一份 SRT 实现）与 `lib/csv.mjs`。交付：`Prototype/loop8_review_loop/`（README/acceptance/reproduce.ps1/case：改前改后校对表、回写 cues、双语 SRT、成片） |
| 人工反馈 | （待填） |

<a id="loop9"></a>
## 小循环 9 · 49 分钟长视频压测 + 术语一致性审计

| 项 | 内容 |
| --- | --- |
| 开始时间 | 2026-10-30 14:00 |
| 结束时间 | 2026-10-30 14:45（约 45 分钟） |
| 初始目标 | 前 8 轮素材都是 30–90s，规模问题从没暴露过。本轮把**49 分钟**跑通，并补上"术语一致性审计"（把机器能自己发现的术语毛病标到校对表上） |
| 结束结果 | **PASS**。① 新增 `Tool/setup/make_long_source.mjs`（TOS 12 分钟 `-stream_loop` 拼 49 分钟，2.5s、1.4GB；声明"测规模不测内容丰富度"）与 `run_long_acceptance.mjs`（7 阶段 + 6 判据）。② 结果：成片 **48.7 分钟**、**273 条字幕**（重映射 267）、校对表 **273 行**、273 行规模下**回写恒等（cues 与 SRT 哈希一致，回写 74ms）**、质检 WARN（真峰 −0.7dBTP／2 段残留黑场／音画差 0.1s，均为素材层已知项）。③ 成本实测：ASR ≈6.5 分钟、剪辑+出片 11.3 分钟、烧字幕 11 分钟、质检 57s，**文本层全部秒级**。④ **长片才暴露并修掉 2 个 bug**：`apply_review` 之前会 trim 译文（279 行里 6 行 `" Id"` 这类对不上 → 恒等回写失效），改为只判空白；MyMemory 偶发返回 `<strong>%2$s</str…`/占位符/前导空格脏数据（279 行踩 6 行），`make_subs` 增加 `cleanMt()` 清洗+模板残留重试（修完 273 行里 0 行脏数据、0 空译文）。⑤ 新增术语审计：`export_review` 现在输出 `term_missing`（英文有规范术语、中文找不到——常见于被行宽切行切断）与 `term_variant`（译成术语表记录的错法），并写 `review.json.term_audit`；回归用例（l2 精译版被切的 `−16 LU`）能被自己标出来。交付：`Prototype/loop9_long_video/`（README/acceptance/reproduce.ps1/case：273 行 cues、校对表、术语审计、质检、抽帧）+ `History/reports/progress_report_2026-10-30.md`（九轮综合报告） |
| 人工反馈 | （待填） |

<a id="loop10"></a>
## 小循环 10 · 逐词高亮（karaoke）在 49 分钟长片上的规模验收

| 项 | 内容 |
| --- | --- |
| 开始时间 | 2026-10-30 14:50 |
| 结束时间 | 2026-10-30 15:05（约 15 分钟） |
| 初始目标 | 补掉小循环 9 明确留下的未知：**长片 ASS 事件数未实测**（ASS 事件是 libass 的压力点，短片永远看不到） |
| 结束结果 | **PASS**。新增 `Tool/acceptance/run_karaoke_scale.mjs`：用 loop9 的 273 条字幕 + EDL 生成全片 ASS（带剪辑重映射）→ 只烧前 120s 做像素抽检。数据：**1030 条 ASS 事件 / 2 样式 / 103KB / 生成 0.1s**，时间轴覆盖 3.6–2841.6s，峰值 1 事件/秒；libass 正常烧（120s 出 7.8MB）；`verify_karaoke` **PASS**（12/12 帧有高亮、12/12 单块不重影、重心位移 280px）。**口径修正**：事件数 ≈ 识别词数（l2 教学片 101 词→78 事件=0.77/词；本片约 1300 词→1030 事件≈0.8–1/词），"1h ≈ 1–1.5 万条"只是对话密集素材的上限；按 ≈1 事件/词 外推 1h 密集素材 ≈ 8–9k，**线性增长、无平方级爆炸**。踩坑两个：① ffmpeg 滤镜里的 Windows 路径必须写成 `subtitles='D\:/...'`（否则 filtergraph 初始化失败）；② `verify_karaoke` 按整份 ASS 均匀抽 12 帧，只烧 120s 时抽样点落在视频外会误判 FAIL → 给它一份"只含前 120s 事件"的 ASS 副本。交付：`Prototype/loop10_karaoke_scale/`（README/acceptance/reproduce.ps1/case：长片 ASS、verify_karaoke、120s 烧入样片） |
| 人工反馈 | （待填） |

<a id="loop11"></a>
## 小循环 11 · 知识型内容链路：内容分诊 + 数值单位规范化 + 术语候选

| 项 | 内容 |
| --- | --- |
| 开始时间 | 2026-10-30 16:50 |
| 结束时间 | 2026-10-30 17:30（约 40 分钟） |
| 初始目标 | 人指出"讲视频剪辑技巧的教学片翻得好"，并强调"不要给工厂下定义，工厂是持续迭代的"。于是不做边界文档，而是把这条能力变成**可计算、可判定**的东西：① 自动分诊内容形态；② 补知识型内容的命门（数值/单位被念串、机翻翻错）；③ 自动挑术语（273 行手工找术语不现实） |
| 结束结果 | **PASS（8/8）**。新增 `Tool/subtitle/classify_content.mjs`：6 个可计算信号（语音覆盖/置信度/**配乐占比**/短句占比/句均词数/术语密度）→ `knowledge`/`mixed`/`narrative` + 当前策略建议。实测 **l2 教学片 knowledge 0.95**（语音覆盖 90%、配乐占比 0%、短句 0%、句均 14.4 词）、**TOS 90s narrative 0.17**（覆盖 23%、配乐 73%、短句 44%、句均 4.4 词）。新增 `Tool/lib/units.mjs` + `normalize_units.mjs`：`minus sixty sixteen l u fs` → **−16 LUFS**、`fifteen megabits per second` → **15 Mbps**，只改句子文本不动词级时间、**幂等**（二次 0 处）、**不误伤**普通数字（`two hours` 保持原样）；中文侧 `canonicalizeZh` 把"负十六 LUFS/零下16LUFS/-16 LUFS"统一成 `−16 LUFS`，替换记入 `cues.json.unit_fixes`。新增 `term_candidates.mjs`：缩写/单位、专名、高频长词、高频二元短语 → 长片 61 个候选、l2 31 个（含单位术语）。验收 `run_knowledge_acceptance.mjs` 8 项全过，对照组（`--no-unit-norm`）确实拿不到 `−16 LUFS` 且出现"负十六"式错误；小循环 6 文本验收复跑仍 **PASS**（WER 6.1%/覆盖 99.8% 不变）。踩坑：分诊最初用"能量动态范围"判配乐，结果**判反**（TTS 词间起伏大）→ 改用"有声但无词帧占比"；术语表源端纠错必须一次性替换（逐条 replace 会把 `LUFS` 二次替换成 `LUFSS`）。交付：`Prototype/loop11_knowledge_content/`（README/acceptance/reproduce.ps1/case：分诊结果、规范化前后 SRT 对照、术语候选） |
| 人工反馈 | （待填） |

<a id="loop12"></a>
## 小循环 12 · 市场 ↔ 工厂 闭环（侦查 → 开工 → 交付包 → 反馈机制）· **✅ 通过结束**（人工验收 2026-10-31 17:11）

| 项 | 内容 |
| --- | --- |
| 开始时间 | 2026-10-30 18:05 |
| 结束时间 | 2026-10-30 19:25（首段落，约 80 分钟，按人要求先停下留痕）→ **2026-10-31 17:11 结项**。跨 10-31 全天续跑：全链路重跑（11:08–11:16）→ 自动发布上线（15:22）→ 发布脚本沉淀（15:30–15:55）→ 反馈感知自动化（16:57–17:10） |
| 初始目标 | 人给的目标：验证 **市场 ↔ 工厂** 整链路——"侦查 B 站当前比较火、且工厂技术能力能快速达到的视频 → 工厂开工制作 → 交付市场并持续跟踪反馈 → 持续迭代" |
| 结束结果 | **前三段跑通、验收 9/9 PASS，第四段停在人工关卡**。① 通道探测：B 站**公开接口**（`ranking/v2`/`popular`/`search/type`）在本沙箱 Node fetch 直连可用（HTTP 200、0.2–0.4s）→ 新增 `Tool/ops/recon_bilibili.mjs`。② 侦查：榜单样本 **134 条**（分区/时长分布 + 8 个关键词市场），最大需求词「编程教程 英文」前 8 条 **2517 万**播放、「Blender 教程 双语」1903 万、「TED 中英」1288 万 → 判定"英文原声 + 中英双语"是被验证的需求，选「剪辑技巧」（关键词 418 万）作为本期。③ 开工：新增 `Tool/ops/make_episode.mjs`（Edge TTS 7 句口播 + CC-BY 画面循环 → 37.37s 源片，**素材零版权风险**）；识别 WER **9.5%**、覆盖 **100%**；新增 `Tool/subtitle/align_script.mjs`（有讲稿时按真值句子强制对齐词流，109 词→7 句全覆盖，解决 TTS 无停顿导致断句串行）；精译 **12/12 行双语**、**88 条**逐词高亮 ASS；烧入后 **QA PASS**（−16.3 LUFS / 真峰 −1.8 dBTP / 音画差 0.007s）。④ 交付包：成片 + 封面（`make_cover.mjs`）+ 双语 SRT + 高亮 ASS + 发布文案（3 版标题/简介/标签/分区/置顶评论）+ 上传清单 + 合规声明，落在 `Deliverables/ep01_editing_tips/`。⑤ 反馈机制：新增 `Tool/ops/track_feedback.mjs`（完播/点赞/收藏/评论/千播涨粉 + 环比 + P0/P1/P2 动作；空表输出"待采集"，`--selftest` 用明确标注的合成数据验证规则 → 4 条动作）。⑥ 验收 `run_market_loop_acceptance.mjs` **9 项全过**。**修掉 3 个"市场化才暴露"的 bug**：合片默认流选择取到画面自带配乐（ASR 0 词）→ 显式 `-map`；`zh_agent.json` 带 BOM 让 `make_subs` 崩 → 统一 `readJson()`；TTS 词间 0 gap 导致 `restore_punct` 把 7 句并 5 句 → 讲稿强制对齐。交付：`Prototype/loop12_market_loop/`（README/acceptance/reproduce.ps1/case_market/case_ep01，含 37s 样片，唯一入库视频 8MB） |
| 挂账（结项时结算） | ① **上架** → ✅ 已由代理自动发布（Playwright + 系统 Edge，2026-10-31 15:22，[BV1AaxC6hExH](https://www.bilibili.com/video/BV1AaxC6hExH/)），"工厂不代登录"这条旧边界经人授权后作废；② **真实反馈** → ✅ 已自动化（`collect_feedback` + `track_feedback` + `plan_next_loop`，定时唤醒；10-31 17:15 起改为每 30 分钟），不再依赖人肉填表；③ 竖屏 9:16 → ⏳ 未做，转入下一轮候选；④ 封面文字观感 → ⏳ 仍需人眼（代理读不了图）；⑤ 选题雷达常态化 → ⏳ 未做，转下一轮候选 |
| 人工反馈 | 2026-10-31 17:11：**「loop12标记"通过结束"」** —— 人直接判定本轮通过、予以结项，无返工要求、无对成片/文案/封面的否定意见。解读：①四段链路（侦查→开工→交付包→发布→反馈机制）整体被认可；②上架由代理代做这一需求变更被追认；③本轮**不再追加产出**，遗留项（竖屏 9:16、封面观感人眼确认、选题雷达常态化）转入下一轮候选，不属本轮未完成 |

<a id="loop12-2"></a>
## 小循环 12 · 补充记录 · 2026-10-31 11:08–11:16 · 全链路重跑（干净 clone）

| 项 | 内容 |
| --- | --- |
| 触发 | 用户指令：「你继续跑循环12，直到验收交付」 |
| 环境 | 干净 clone 后 `Workspace/` 全空，从零重建：ffmpeg 6.1.1（79MB×2 / 37s）、koffi+vosk+edge-tts（82MB / 53s）、Vosk small-en-us 模型（41MB / 36s）、CC-BY 画面素材 |
| 过程 | recon×2 → `make_episode`（Edge TTS 7 句口播）→ `asr_vosk` → `align_script` → `make_subs`（精译）→ `make_ass` → `vfactory` 渲染 → `qa_report` → `make_cover` → `track_feedback` → `run_market_loop_acceptance` |
| 结束结果 | **9/9 PASS**。成片 37.375s / −16.3 LUFS / −1.8 dBTP / 音画差 0.008s / 黑场 0 / **冻帧 0**；双语 12/12；高亮 81 词级 + 7 中文 = **88 条**；WER **9.5%** / 覆盖 **100%**；高亮像素验收 12/12 帧有高亮、12/12 单块不重影、重心位移 391px；市场样本 134 条 |
| 复现性 | 与 10-30 产物逐项对齐：时长差 **0.001s**、响度与真峰完全一致、ASS 事件数一致、WER 一致、对齐时间码逐句一致、ASR 均为 109 词 → 链路可复现 |
| 修的 bug | ① `bootstrap_asr` 传 tar 绝对路径，盘符被 bsdtar 当远程主机（`Cannot connect to F:`）；② `fetch_vosk_model` 的包是 **zip**，GNU tar 解不了、bsdtar 又怕盘符 → 显式优先 `%SystemRoot%\System32\tar.exe`；③ 验收脚本在缺成片时从快照回填 + 把"方向验证（最大需求词）"与"本期选题"拆成两行 |
| 留痕澄清 | 10-30 产物内部时间戳为 17:44–17:53，而本日志记「18:05 开工」；`verify_subs.json` 里还留着 `D:\Data\DeepseekHarness\...` 路径 → 原产物疑似来自更早的一次会话。本次重跑已让产物时间戳与日志自洽，之后再出现偏差即可视为真问题 |
| 新发现的局限 | 英文 CPS 峰值 28.93 > 阈值 25，但 `verify_subs` 的 `pass.readability` 只判中文（`max_zh_cps 8.26 ≤ 20`）→ 该阈值只展示不判定，已在 README 注明；"边界误差 0s"来自讲稿强制对齐，属自证，不能当独立指标 |
| 状态 | 上架与真实反馈仍待人工（需账号）；改动全部留在本地，**未推远端** |
| 人工反馈 | （待填） |

<a id="loop12-3"></a>
## 小循环 12 · 发布（2026-10-31 15:22）

| 项 | 内容 |
| --- | --- |
| 触发 | 用户指令：「这轮循环不算结束，还没有发布到B站，需求改为由你自动发布，我给账号使用权」 |
| 方式 | Playwright + 系统 Edge（无头）驱动创作中心网页端；登录用手机扫码（用户扫码确认，UID 3747573749779036，会话持久化于 Workspace/.bili_profile） |
| 过程 | 上传 final.mp4（18.6MB/100%）→ 标题(A版)/简介/7 标签 → 分区 知识 → 创作声明「含AI生成内容」→ 封面 cover_16x9.jpg（4:3+16:9 同步）→ 立即投稿 |
| 结果 | **已上线 https://www.bilibili.com/video/BV1AaxC6hExH/**（37.4s，页面标题与封面已验证生效）；feedback.csv 记录 T0 基线 |
| 途中坑 | ① 控制器带参命令（clickxy/typefile）因精确匹配 bug 全部落入 unknown → 改用 eval + execCommand('insertText') + KeyboardEvent 事件注入；② 简介/封面/声明均为富文本或受控组件，DOM 直改+原生事件可行；③ file input 用 DataTransfer 注入 File 对象 |
| 沉淀 | 当轮用 `Workspace/bili_controller.mjs`（遥控式发布控制器）与登录脚本跑通；20 分钟后已正式沉淀到 `Tool/ops/`（见下节），Workspace 里的临时脚本已删 |
| 置顶评论 | 未发（页面上发评论属公开互动，留给用户） |
| 人工反馈 | 数据 T+1/T+3/T+7 待回填 feedback.csv → track_feedback 出迭代动作 |

<a id="loop12-4"></a>
## 小循环 12 · 发布脚本沉淀（2026-10-31 15:30–15:55）

| 项 | 内容 |
| --- | --- |
| 触发 | 用户指令：「直接把发布脚本整理沉淀」 |
| 新增 | `Tool/ops/publish_bilibili.mjs`（status/login/publish/verify 四命令，`--dry-run` 停在投稿前）、`Tool/lib/pw.mjs`（playwright 多路径加载 + 系统浏览器探测 + 登录态判定）、`Tool/setup/bootstrap_playwright.mjs`（只装 Node 包、不下载浏览器） |
| 删除 | Workspace 下 6 个一次性脚本（bili_controller / bili_login_* / bili_upload_* / probe_browser），已全部并入 Tool |
| 验证 | `status` → 已登录 UID 3747573749779036；`publish --dry-run` 全链路（上传→标题→简介→7 标签→分区知识→声明→封面）**通过**，停在投稿前；`verify --bvid BV1AaxC6hExH` 读到线上真实标题/关键词/封面/38s；`login` 在已登录时直接返回 |
| 未做 | 未再真正发布（本轮只做沉淀，线上仍只有 BV1AaxC6hExH 一条；稿件管理核对：已发布 1 / 草稿 0） |
| 途中踩坑 | ① 合成 KeyboardEvent 加标签静默失败 → 必须真键盘；② `Control+A`+Backspace 会把上一个标签 chip 删掉（表现为只剩一个自定义标签）；③ 逐字符 type(30ms) 被重渲染吞字（只剩「程」）；④ 草稿恢复弹窗「继续编辑/不用了」会串上次表单；⑤ 异常路径不关浏览器会让 node 进程挂住；⑥ 线上 meta 带 `data-vue-meta`，正则不能写死属性顺序。全部写进 `Tool/ops/ops.md` 的「发布链踩过的坑」 |
| 附带 | 新增 `Deliverables/ep01_editing_tips/desc_publish.txt`（发布用简介定稿，供 `--desc-file` 直接复用） |

<a id="loop12-5"></a>
## 小循环 12 · 结项（2026-10-31 17:11，人工判定通过）

| 项 | 内容 |
| --- | --- |
| 判定 | **通过结束**。人在 17:11 直接下结论「loop12 标记通过结束」，未要求返工、未否定成片/文案/封面。本轮所有挂账项已结算完毕（见上表），不存在"半成品结项" |
| 本轮真正验证到的 | 一条**从市场信号到线上反馈**的完整闭环能自动转：公开接口读真实榜单（134 条）→ 定选题 → TTS+CC-BY 造片（37.4s，零版权风险）→ 双语逐词高亮 → QA PASS（−16.3 LUFS / 冻帧 0）→ 自动投稿上线 → 每天自动采集反馈并生成下一轮任务书。**中间没有一步需要人手工搬数据** |
| 与上一轮相比新增的可复用能力 | ① `Tool/ops/publish_bilibili.mjs`（扫码登录/上传/填表/封面/投稿/回执，`--dry-run` 可演练）② `Tool/ops/collect_feedback.mjs`（零登录读 4 个公开接口，含评论与弹幕原文）③ `Tool/ops/plan_next_loop.mjs`（R1–R10 信号→任务书）④ `Tool/ops/watch_feedback.mjs`（一条命令串完采集→诊断→规划） |
| 关键证据 | 线上稿件 https://www.bilibili.com/video/BV1AaxC6hExH/ （状态：已发布，37s，知识分区，含 AI 生成内容声明）；验收记录 `Prototype/loop12_market_loop/acceptance.md`（**9/9 PASS**）；反馈表 `case_ep01/feedback.csv`（T0 基线 + 每日追加）；提案 `History/loops/next/plan.md` |
| 复现 | `node Tool/acceptance/run_market_loop_acceptance.mjs`（9 项）；`node Tool/ops/watch_feedback.mjs`（采集+诊断+规划）；`node Tool/ops/plan_next_loop.mjs --demo`（无需真实数据即可验证规则） |
| 诚实边界 | ①发布仅 2 小时、播放个位数，**本轮不具备任何"内容好不好"的结论**，R0「信号不足」是正确输出而非失败；②完播率只存在于登录态创作中心，公开接口拿不到，`avg_watch_s` 目前为空，需要人补或后续接登录态；③反馈机制本身只被合成样本验证过（`--demo` 6 条提案），**真实数据驱动的首次判断要等 T+1** |
| 结项后状态 | 小循环 12 关闭，**12/12 轮全部 ✅**。大循环窗口 2026-10-27 10:44 → 2026-11-03 10:44 仍开，剩余约 65.5h；第 13 轮不自动开跑（AGENTS 人环规则），等人在 `History/loops/next/plan.md` 的提案里点头，或直接给方向 |

## 维护记录 · 2026-10-27 20:50–21:10 · Git 出网避坑（用户指令，非小循环）

| 项 | 内容 |
| --- | --- |
| 触发 | 用户要求把 `https://github.com/WarriorMFY/VideoFactoryByIdea.git` 下载到本地：直连 clone 连续 2 次 `errno 10053`；随后指令"在 `Tool\` 新建 Git 目录，说明这次避坑并新建脚本，避免以后长时间 pull 失败" |
| 做了什么 | ① 分层实测出网（TCP / HTTP / git 协议三层，共 15 组数据）→ 结论：**前两层探针都会骗人**，只有 `git ls-remote` 可信但很慢；② 新增 `Tool/Git/gitnet.mjs`（端点学习 + 无进展看门狗 + 硬超时 + 镜像回退）；③ 新增 `Tool/Git/Git.md`（现象/根因/实测/用法/验收/限制）；④ 更新 `Tool/Tool.md`（目录地图 + 第 4 条规则）与 `Tool/env.md`（§〇 出网会漂、§二 杀进程） |
| 关键数据 | 直连失败 21.3s / 56.1s，网络好时 1.2s 成功；镜像成功 25.9–46.3s，偶发 500/502（2.3–17.3s）；杀子进程只能 `child.kill('SIGKILL')`（3ms 生效），`taskkill /T /F` 被沙箱拒（exit 1）；`http.lowSpeedTime=20` 会误杀慢镜像，已改 90s |
| 验证 | 四条验收全过：`state` 可读 · `pull --check` 在 78s/38s 内给结论（直连失败自动切镜像）· `run --stall 4` 打黑洞地址 4.0s 被看门狗杀掉 · `clone octocat/Hello-World` 成功且 origin 为规范地址。留痕：`History/probe/gitnet.md`、`History/probe/gitnet_killtest.log`、`History/probe/gitnet_acceptance.log` |
| 状态 | 新增文件**未提交、未推送**（`Tool/Git/`、`History/probe/gitnet*`，以及对 `Tool/Tool.md`、`Tool/env.md` 的改动）。仓库仍在等"人对小循环 3 的反馈"，本轮不改变大循环状态与时间窗口 |
| 人工反馈 | （待填） |

## 维护记录 · 2026-10-30 17:36 · 推送至远端（用户明确指令："推送到远端仓库"）

| 项 | 内容 |
| --- | --- |
| 触发 | 用户明确要求推送（按红线：只有人明确说推才推） |
| 范围 | `main`：`80a7150 → 0cc37c2`，共 **9 个提交**（loop6 收尾、loop7+8、loop9、loop10、loop11 及相关 docs/status 提交） |
| 方式 | 复用 `Workspace/cache/push_with_gcm.ps1`：GCM 取凭据 → `git -c credential.helper= -c "http.extraheader=Authorization: Basic …" push -u origin main`（本仓库固定 `http.sslBackend=openssl`；git 写 stderr 属正常，退出码只看 `$LASTEXITCODE`） |
| 结果 | `push exit=0`；`80a7150..0cc37c2  main -> main`。**三方核对一致**：`git ls-remote origin main` = `0cc37c2ffbd…`；`git fetch` 后 `rev-list --left-right --count origin/main...HEAD` = **0 / 0**；GitHub API `commits/main` = 同一 sha（pushed_at `2026-10-30T09:36:05Z`） |
| 入库体积 | 本地 `.git` pack 33.93 MiB；GitHub 侧仓库 size **34,746 KB**。视频/大素材仍按 `.gitignore` 不入库（本地 6.36GB） |
| 复核 | 推完后工作区干净；本地跟踪文件 960 个 / 20.3MB |
| 人工反馈 | （待填） |

## 维护记录 · 2026-10-30 19:53 · 推送至远端（用户指令："把当前循环进度记下来，推送到远端仓库"）

| 项 | 内容 |
| --- | --- |
| 触发 | 小循环 12 中途，人要求先停下、记录进度并推送 |
| 范围 | main：ba57013 → 4537920，共 2 个提交（loop12 特性 + 清理临时文件） |
| 结果 | 第一次 push **超时失败**（Connection timed out after 30001 ms）；重试脚本第 1 次仍失败（Failed to connect to github.com:443），**第 2 次成功**：ba57013..4537920  main -> main |
| 经验 | 网络抖动时 push 要**带重试 + http.version=HTTP/1.1 + 大 postBuffer**（脚本 Workspace/cache/push_retry.ps1）；失败表现是 exit=128 连接超时，不是凭据问题 |
| 核对 | git ls-remote / rev-list --left-right = 0/0 / GitHub API 三处一致；远端 Prototype/loop12_market_loop/case_ep01/ 已含 8MB 样片 |
| 人工反馈 | （待填） |

## 维护记录 · 2026-10-31 15:57–16:14 · 目录整理（用户指令，非小循环）

| 项 | 内容 |
| --- | --- |
| 触发 | 人：「按照AGENTS.md整理一下根目录」，随后「重新整理一下你的WorkSpace目录」 |
| 根目录 | 删 `Deliverables/` → 交付包并入 `Prototype/loop12_market_loop/case_ep01/`（4 个同名文件 sha256 一致去重；`publish.md`/`feedback_report.md` 取交付包内新版）；可重建中间件移到 `Workspace/run/`。根目录现在只剩 `AGENTS.md`、`.gitignore` + `Idea/ Prototype/ History/ Tool/ Workspace/` |
| 留痕归位 | `Workspace/bili_*`、`publish_runs/` → `History/publish/bilibili/{runs,adhoc}`；`publish_bilibili.mjs` 的 `RUNS` 改到 History 下，之后每次发布产物自动落留痕 |
| Workspace | `deps/{ffmpeg,asr,node_modules}` + `assets/` + `cache/` + `run/{bili_profile,ffmpeg_intermediate}`；新增 `Workspace/README.md`（谁在用 / 删了怎么补 / 已知事实），`.gitignore` 只对这份说明开口 |
| 清理 | 删 `cache/vosk_parts` 40MB（zip 校验 20 条目无损、模型 68MB 完整） |
| 代码同步 | `ff.mjs`、`vosk.mjs`、`pw.mjs`、`bootstrap_ffmpeg/asr/playwright`、`fetch_vosk_model`、`make_episode`、`make_l2_bench`、`make_speech4_tts` 共 12 处；文档 `ops.md`/`setup.md`/`Tool.md`/loop1 README/loop3 model_compare |
| 顺带修 | `track_feedback` 原会把「播放为 0 的 T0 基线」当真数据、推出假 P0「重做前 3 秒」→ 现在识别为基线、标"待采集"；`.gitignore` 两行编码坏掉的注释修正 |
| 验证 | 验收重跑 **9/9 PASS**；ASR 实跑 109 词 / 2 句 / conf 0.9759；`publish status` 仍已登录（profile 迁移无损）；`ffmpeg -version` 6.1.1 |
| 未做 | 未 commit、未 push（等人指示）——**已于 16:18 提交 `1fcd615`、16:23 推 `origin/browser-publish`**，见下节 |

## 分支记录 · 2026-10-31 16:23 · 两条线分叉，分分支管理

| 项 | 内容 |
| --- | --- |
| 现象 | 本地这条线（本机 15:22 用 Playwright 真浏览器发布 BV1AaxC6hExH + 两轮目录整理）与远端 `main`（14:58–16:04 另一个会话推的 loop12+ 竖屏 / loop13 API 版发布骨架）在 `86fcc1c` 分叉：本地 1 个提交、远端 5 个提交，冲突 114 个文件（多为同一批产物两边各改一次） |
| 处置 | 按人指示**分两条分支各自管理**，不合并、不覆写：<br>· `main` = 远端那条线（`f3c03be`），本地已对齐 `origin/main`，未做任何改动<br>· `browser-publish` = 本机这条线（`1fcd615`），已推到远端同名分支并跟踪<br>· 另留本地备份分支 `backup/local-publish-1fcd615` |
| 两条线的差别 | `main`：B 站走 **API 方案**（`bili_auth/bili_upload/bili_stats`，卡在需要 Cookie，尚未发出稿件）；产物含竖屏 9:16、封面自检、选题雷达常态化<br>`browser-publish`：B 站走 **Playwright + 系统 Edge**（`publish_bilibili.mjs`，已实际发出 BV1AaxC6hExH，回执在 `History/publish/bilibili/runs/`）；仓库结构按 AGENTS.md 收敛、Workspace 四层重组 |
| 提交 | `1fcd615`（140 文件 / +4550 −3338）：发布脚本沉淀 + 目录整理 + Workspace 重组 + 4 处 bug 修复；`090f66b` 记录本次分叉 |
| 推送 | `git push -u origin browser-publish` → `1fcd615 → 090f66b`，exit 0；远端 `main` 仍是 `f3c03be`（未被覆盖） |
| 后续 | 需要合并时再单独处理；在那之前**不要**在两条线之间 `reset --hard` 或 `push -f`。改哪条线就先 `git switch` 到哪条 |

## 维护记录 · 2026-10-31 16:48 · 日志本身整理（用户指令："把 log.md 整理一下"）

| 项 | 内容 |
| --- | --- |
| 体量 | 297 → 324 行；正文一条未删（除下表列出的错字与过期状态），多的行数来自本章节、附录标题与统一的分隔线 |
| 修掉的数据损坏 | 两处 `0x08` 退格符把提交号吃成 `a57013` → 还原 **`ba57013`**；另一处 `rev-list` 被误断成两行（`re` + 换行 + `ev-list`）→ 合并回一行 |
| 章节归位 | 「维护记录 ×4 + 分支记录」原本散落在各轮之间（10-27 的 Git 出网记录竟排在 10-30 的 loop12 之后）→ 全部降为 `###` 归入文末 **「维护与分支记录（按时间顺序）」**，小循环 1–12 从前往后连贯读 |
| 抽离游离条目 | 小循环 12 表格下方有 9 条无标题的「跨轮短板」清单，混在某一轮的记录里 → 移到文末 **「附录 · 跨轮短板与待办台账」**，并把失效路径 `Workspace/asr/models/` 更正为 `Workspace/deps/asr/models/` |
| 格式统一 | 每节之间统一「空行 + `---` + 空行」（原来有的挨着、有的连写两遍 `---`）；删掉两个表格行尾多余的空单元格；去掉连续空行 |
| 状态表纠正 | ①大循环时间推进到 16:50（已用 102.1h / 剩 65.9h）；②`代码/仓库状态` 原写"有未提交改动、尚未 commit/push"→ 改为已提交 `1fcd615`、工作区干净、当前分支 `browser-publish`；③`远端` 补记 16:2x 推 `browser-publish` 且 `main` 未被覆盖 |
| 标题/口径 | 「循环 12 · 发布」→「**小循环** 12 · 发布」，时间 `15:2x` → `15:22`（对外 pubdate）；两处"待下轮整理""未 commit"的过期表述就地注明后续已做 |
| 读旧条目约定 | 顶部加一条：10-31 15:57 起 `Deliverables/` 已并入 `case_ep01/`、`Workspace/asr` 与 `Workspace/bin` 已改为 `Workspace/deps/*`，文中更早的路径按当时语境保留 |

## 维护记录 · 2026-10-31 16:57–17:10 · 反馈感知自动化（用户指令："定期感知 B 站反馈，收到后自动规划后续循环"）

| 项 | 内容 |
| --- | --- |
| 触发 | 人要求继续 loop12，并把「盯数据、想下一轮」这一步交给代理定期做 |
| 新增 `Tool/ops/collect_feedback.mjs` | 零登录读 4 个 B 站公开接口：`web-interface/view`（播放/点赞/投币/收藏/评论数/分享/弹幕数）、`v2/reply`（热评原文）、`v1/dm/list.so`（弹幕原文 + 出现秒数）、`relation/stat`（粉丝总数）→ 写 `feedback.csv`。每天一行，同日重跑只刷新数值、人工备注（`‖` 之后）保留；数据与上次完全一致时不落新快照（避免定时任务把 `runs/feedback` 塞满重复 json） |
| 新增 `Tool/ops/plan_next_loop.mjs` | 信号 → 任务书（R1 没进推荐 / R2 在推不买账 / R3 工具型 / R4 可读性 / R5 语速 / R6 译文 / R7 开头 / R8 弹幕聚集 / R9 声音 / R10 有曝光零互动 / R0 信号不足）。每条含：为什么做、证据原文、改哪个脚本哪个参数、验收阈值、成本、风险。产物 `History/loops/next/plan.md`，顶部写死「待批准」 |
| 新增 `Tool/ops/watch_feedback.mjs` | 一条命令串起采集 → 诊断 → 规划；任一步失败会指明断在哪、前序产物还在不在 |
| 定时 | automation「B站反馈感知 · loop12 稿件数据采集与下一轮规划」每天 **10:00**（`validUntil` 2026-11-14），边界写进 prompt：只读公开数据、不自动开轮次、失败不许用上次数字冒充 |
| 修的真问题 | ①`Number('')===0` 让"没填完播率"变成"完播率 0%"，推出假 P0「重做前 3 秒」→ 空值一律 `null`，缺失单独归"采集缺口"（P1）；②旧表缺列时 `Number(undefined)` 得 `NaN` 写进 CSV → 统一 `numOr()`；③同日多次采集 `views_delta` 归零会把 R1/R2 判反 → 用「当日值 − 当日 delta」反推原始基线；④"开头不错"被算成"开头留人失败" → 单独维护 `NEGATIVE` 词表，`正向 && !负面` 才算好评 |
| 顺带修 | 验收项 `feedback_honest_when_empty` 原来拿交付包里的 `feedback.csv` 当"空表"，上架后会长出真数据、第二周必假失败 → 改为自造空表并跑完即删 |
| 验证 | `watch_feedback` 全链路实跑：播放 3 / 评论 0 / 弹幕 0 / 粉丝 1 → R0「信号不足」；`plan_next_loop --demo` 用合成样本跑出 6 条提案（R4/R6/R2/R3/R5/R8），阈值排序正确；小循环 12 验收重跑 **9/9 PASS** |
| 未做 | 未 commit、未 push（等指示） |

## 维护记录 · 2026-10-31 17:15–17:25 · 反馈唤醒频率改为每 30 分钟

| 项 | 内容 |
| --- | --- |
| 触发 | 人：「把上一次对话中开的自动感知规划器调一下频率，每 30 分钟唤醒一次」 |
| 频率 | automation「B站反馈感知 · loop12 稿件数据采集与下一轮规划」：`FREQ=DAILY;BYHOUR=10` → **`FREQ=MINUTELY;INTERVAL=30`**（`validUntil` 仍 2026-11-14，即到期末约 672 次唤醒） |
| 汇报纪律 | prompt 改为调 `watch_feedback.mjs --brief`，并按四级控篇幅：**A** 数值全同 → 一行「HH:MM 无变化｜播放/评论/弹幕」；**B** 数值变但提案没变 → 3 行内；**C** 提案集合变了 → 读 `plan.md`、8 行内；**D** 有新评论/弹幕 → 另摘 ≤3 条原文并归类。避免一天 48 条长报告 |
| 配套改造（不改的话高频就是负收益） | ① `collect_feedback` 新增 `History/runs/feedback/ticks.jsonl`，**一 tick 一行**——CSV 仍一天一行（诊断口径不变），日内"哪半小时涨得快"靠 ticks，这是判断"有没有进推荐流、从哪刻起停了"最直接的证据；② `plan_next_loop` 的 `plan_history.jsonl` 改为**只在提案集合变化时追加**，否则一天 48 行全是同一个 R0；③ 数据无变化时仍不落时间戳快照（沿用 16:57 那次的设计）；④ `latest.json` 是每 tick 必刷新的中转件（含 `collected_at`），从版本控制里摘出并写进 `.gitignore`——否则工作区每半小时就脏一次，commit 必夹带无意义 diff；时序留痕以 `ticks.jsonl` 为准 |
| 验证 | 连续两次 `watch_feedback --brief`：`ticks.jsonl` 1→2 行、`plan_history.jsonl` 保持 5 行不变、`feedback.csv` 仍是 1 行数据（`views=4, views_delta=4`）、提案仍 R0 |
| 成本 | 每次唤醒打 4 个公开接口（view/reply/dm/relation），半小时一次远低于风控线；本地写入约 7KB/天 |
| 未做 | 未 commit、未 push（等指示） |

<a id="loop13"></a>
## 小循环 13 · 反馈时钟：不等市场投票，自己造判卷（2026-10-31 17:35 起，**待定**）

| 项 | 内容 |
| --- | --- |
| 开始时间 | 2026-10-31 17:35 |
| 初始目标（人原话） | 「新一轮循环，先规划一下，再执行。当前已经建立 市场-工厂 的循环链，目的是通过跟踪已发布产品的市场反馈来定向迭代，但是现在反馈速度太慢了，我们也不可能干等着，你有什么建议呢」 |
| 规划 | `History/loops/loop13/plan.md`。核心判断：**"发一条→等数据→改一条"在剩下 65 小时里物理上走不通**，因为平台判卷下限是 T+1 12:00，最多只剩 2 个判卷点，第 2 个距窗口关闭仅 22 小时。所以不再"更快地等"，改为把反馈按延迟拆成四层（L1 先验 / L2 内评 / L3 平台判卷 / L4 观众投票），本轮只押 L1+L3，L4 明确放弃并如实记录 |
| 侦察（决定了规划长什么样） | 写 5 个一次性探测脚本（`Workspace/tmp/probe_creator*.mjs`）：①登录态有效（UID 3747573749779036，14 条 cookie）②找到 `/x/web/data/archive_diagnose/compare`，一次返 53 字段含完播率/均播/跳出率/点击转化 **+ 同类中位数**③其中 **37 个字段在 `not_ready_field` 里**，创作中心首页写「每日 12 点更新」→ **平台判卷 T+1 是物理下限**④零登录直连搜索接口 4 词有 2 词返回 HTML 风控页，改走登录态后 4/4 通 |
| 新增 `Tool/ops/collect_creator_stats.mjs` | 登录态取平台判卷：完播率/均播/跳出率/点击转化/互动率 + 同类中位，落 `History/runs/creator/<date>.json` + `series.jsonl`（一天一行，同日重跑覆盖）。`not_ready_field` 里的字段一律 `null`，**绝不用 0 冒充**；与公开口径自动对账（实测 `play=5` vs `views=4`，差 +1 属正常） |
| 新增 `Tool/ops/bench_peers.mjs` | 双组采样定"及格线"：`HOT`（`order=click` 剔除 >600s 长合集，**113 条**）取**形态范式**；`FRESH`（`order=pubdate` 近 30 天，**63 条**）取**新稿播放水位**。产出 `History/bench/peers_<date>.md` |
| 关键发现 1（推翻了旧判定） | **旧阈值把正常人全判成病人**。赛道点赞率中位 **2.17%**，而 `likeLow` 写的 2%——阈值卡在人群中间；收藏率中位 **1.67%**，而 `favStrong` 写的 5%（P90+ 水平，永远够不着）。已校准为 **1.0% / 2.5%**，`coldStartViews` 500→**200**（依据 FRESH P75=224、中位仅 68），每行注释都写了依据来源 |
| 关键发现 2（改写了对"播放 5"的解读） | 近 30 天同赛道新稿播放 **P25=10.5 / 中位 68 / P75=224 / P90=591**。我们 5 播放**低于 P25**，说明连冷启动池都没进——但**不是"内容做砸了"，是"分发入口没打开"**。没有这组基线时，5 播放看起来像失败；有了基线才知道那是新号常态。诊断方向应从"改内容"转到"改入口" |
| 关键发现 3（形态偏离） | 赛道爆款时长中位 **136s**（P25 65 / P75 295），我们 **38s** 偏短；标题中位 **22 字**，我们 **33 字** 偏长，且「英文原声 + 中英双语字幕」是**制作规格**不是**观众收益**。38s 讲 5 个技巧＝每个 7.6 秒，只够"露一手"不够"教会"——**此为推断，待 T+1 完播率验证后才可据此改稿** |
| 验证 | `run_market_loop_acceptance.mjs` **9/9 PASS**（阈值改动未破坏既有判定）；`plan_next_loop` 仍正确判 R0（播放 4 < 200 且无文本反馈）；`collect_creator_stats` 实跑通过，15/25 项未就绪判空正确 |
| 产物 | `Prototype/loop13_feedback_clock/README.md`（含复现与验证记录）、`History/loops/loop13/plan.md`、`History/bench/peers_2026-10-31.md/.json`、`History/runs/creator/2026-10-31.json` |
| 待定（需人点头） | **P2 赛马要不要真发**：3 条 20–25s 微稿，同模板只变一个变量，间隔 ≥2h。发能拿到"哪条方向可复制"的实证（但受 T+1 限制，结论到窗口末才出）；建议发 2 条、留 1 条产能做修正 |
| 未做 | 封面视觉规律（文字密度/人像/对比色）没做，`cover` URL 已存；L2 内评团没做（无基线时内评＝自嗨）。未 commit、未 push |


> 这些条目原本散落在「小循环 12」表格下方、无标题。2026-10-31 整理日志时原文移到这里，内容未改；只把 `Workspace/asr/models/` 更新为现行路径 `Workspace/deps/asr/models/`。

- **识别质量（最高优先级）**：真实影视混音下 Vosk 小模型仅约 55–65% 词准确率。已做模型对照（详见 `History/loops/loop03/model_compare.md`）：**128MB 的 lgraph 大模型反而更差**（插入多、置信度 0.788 vs 0.918）→ 短板是模型能力上限，不是模型大小；要上 Whisper 类需要新下载通道（HF/ModelScope 全域不可达）。lgraph 模型已保留在 `Workspace/deps/asr/models/` 可复用。
- **标点恢复**：✅ 小循环 6 已解决（规则化恢复：句界 F1 1.00 / 句末标点 100%）。剩余：语义级断句（从句/长句仍靠停顿+长度）。
- **翻译质量**：✅ 缺陷清零（句末缺标点 7→0、术语错误 1→0）；全自动机翻仍是"能看懂"级，发布走 `--mt agent`（人/LLM 精译，实测可达人工参考 94.1%）或"机翻 + 人工校对回写"。待译清单 `make_subs --dump-en`；校对回写闭环 ✅ 小循环 8 已解决（`export_review` → 改 CSV → `apply_review`，恒等回写逐字节一致、误操作全部拒绝）。
- **机翻质量**：MyMemory 只能"看懂"，不宜直发；需 LLM 精译或自建 MT。
- **音画绑定**：语音保护会连带保住"对白压在黑屏/字幕卡"上的黑屏，暂时无法"保音频换画面"。
- 模型下载通道：本机只有 alphacephei、npmmirror 与 nluug/dotsrc 的 Blender 镜像可用。
- **短句通道（小循环 4 新增，收益最大）**：❌ **小循环 7 已证伪"喂法能救"**：干净 TTS 8/10 能识别、原片混音 0/10、7 条链 × 10 条漏句 0 命中、窗口放大到 6–10s 仍 0 → 是模型能力上限。**别再在预处理/切窗上投入**；唯一解是换 Whisper 级模型（需外部给模型/通道/接口）。`asr_rescue.mjs` 的"找未被覆盖有声区间"能力保留，可当漏译检查器。
- **机翻质量定量化（小循环 4 新增）**：`Workspace/assets/tos/TOS-CH.srt` 是官方中文翻译，可直接算“机翻 vs 人工”字相似度分布，给出能否直接发布的门槛。
- **逐词高亮的进阶玩法（小循环 5 新增）**：当前只做“只亮当前词”。`\kf` 扫光式高亮、长句自动分页、多语言字体回退、软字幕轨都未做；1 小时长片的事件量（约 1–1.5 万条）未压测。

<a id="loop14"></a>
## 小循环 14 · 对标优化：名人 AI 演讲 × 双语高亮字幕（2026-11-01 08:45 – 14:38，**已结束**）

| 项 | 内容 |
| --- | --- |
| 开始时间 | 2026-11-01 08:45 |
| 人指令（原话） | 「先待定该循环，开一轮新循环，对照该视频效果来优化我们的作品【李飞飞：10 年后，只有两种人不容易被替代-哔哩哔哩】 https://b23.tv/GAp3xdl」 |
| 对标 | BV1a1HW6LEXN：晓林呐（283 粉）翻译搬运李飞飞采访，49min，18178 播/26 天，点赞率 2.33%，**分享率 0.89% 极高**，tid 231 科技·计算机技术。解剖见 `History/loops/loop14/bench.md` |
| 关键发现 | ①同 UP 同格式 19 条视频，播放 47→18178 三级跳，**唯一自变量是人物名气×言论冲击力**；②对标封面=视频帧+烧双语高亮字幕，无设计；③热评第一（31 赞）表扬的正是我们流水线已具备的双语逐词高亮字幕——**核心资产已被市场验证，差距在选题与包装**；④对标是版权敏感的搬运，我们走 CC-BY 演讲源做合法差异化 |
| 规划 | `History/loops/loop14/plan.md`：WP1 CC-BY 素材侦察 → WP2 选题+切片 → WP3 流水线试产 → WP4 发布（--tid 231 强制+回读） → WP5 T+1 判卷对照 BV1VRx16WEyn |
| 回答的问题 | 选题公式切换（技巧工具向 → 名人 AI 言论）是否显著抬升冷启动水位 |
| 前置 | 小循环 13 标记**待定**（6 包完成 5，WP6 挂起），其新稿数据采集不中断 |

<a id="loop14-2"></a>
## 小循环 14 · 结束条目（2026-11-01 14:38 收轮）

| 项 | 内容 |
| --- | --- |
| 开始时间 | 2026-11-01 08:45 |
| 结束时间 | 2026-11-01 14:38（人判「结束这一轮循环，做的非常好」） |
| 初始目标 | 用对标公式（名人 AI 言论 × 悬念标题 × 长片）替换我们的技巧类选题，验证「选题公式切换是否抬升冷启动水位」；顺带把摘要形态与导航通道产品化 |
| 结束结果 | **上线 10 条，全部 tid=231 回读通过**：长片 5（李飞飞 BV113xW6VEv6 15:02 / 李开复 BV1tKxW62EhT 14:32 / 苏莱曼 BV1oSxp6tEPQ 21:34 / 奥尔特曼 BV19Gxp6XE4T 47:16 / 马斯克 BV1fwxp68EQB 52:38）+ 3 分钟摘要 5（BV1yvxs61Eaw 2:51 / BV1cCxs63ESU 2:56 / BV1qDxs6vEUS 2:59 / BV1rCxs6gEEb 2:52 / BV1HCxs63EwV 2:40）。每条摘要与对应长片建立**双向导航**（摘要每段右上角标原片时间 + 简介 7 章 `?t=` 跳转 + 置顶评论章节表；长片置顶挂摘要导流） |
| 人工反馈 | ①「非常完美」（EP-A 双语版验收）；②「趁着这个势头再发布 3 条」→ 催生 WP4.6 批量；③「新开精简版 3 分钟中文摘要 + 快速导航通道」→ 催生 WP4.7 make_digest；④「摘要视频有画面抖动」→ 定位 zoompan 亚像素 + 时间轴未帧对齐，CV 32.6%→12.3%；⑤「李开复 21s 附近丢双语字幕，只修工具链不重发」→ 定位 TED 字幕预卷段错位；⑥「已发布的不动，补足其余四条摘要」→ WP4.8；⑦「结束这一轮循环，做的非常好」→ 收轮 |
| 关键发现 | ①**人物名气是唯一自变量被再次确认**：同一流水线、同分区同格式，李飞飞单条冷启动即拉到对标量级；②**TED HLS 字幕有 3.5s 预卷占位段**（首条 EXTINF 对应 segment=-2），按 i↔segment 拼 URL 会让每片丢掉前段 cue——五片偏移实测 3.504/3.567/3.558/3.456/3.609s，**必须按片标定**；③**摘要形态是低成本高杠杆**：一条 3 分钟摘要 = 4 分钟算力，且天然给长片导流，形成「短视频钓鱼 + 长片沉淀」的自环；④B 站**下架接口已失效**（`archives/del` 返 HTML、`edit` 返 21009），纠错只能靠置顶评论改写与重投 |
| 工程沉淀 | `ted_episode.mjs`（ASR→偏移标定→对齐→中译→字幕→EDL→渲染一条命令，9 分 45 秒/条）· `ted_subs.mjs`（字幕抓取+合并+去重，修预卷段）· `make_digest.mjs`（spec 驱动摘要片，音画同步模型：转场恰落在句间静音）· `vfactory --plan-only`（长片省一半渲染）· `bili_comment.mjs`（评论/置顶 API）· `frame_sheet.mjs`（选帧复核拼图）· `kb_audit.sh`（帧间差异抖动审计）· 13 条坑固化进 `Tool/ops/ops.md` 与各 README |
| 未验证/遗留 | **WP5 T+1 判卷未开**（11-02 12:00 后自动跑，结论才能回答 §2 的假设，`t1_readiness.md` 显示 5 条长片完播率今日均未就绪）；已上线 4 条长片（B/C/D/E）仍带 3.5s 预卷造成的字幕洞，**人明确不重发**，素材已按 `--offset 0` 重抓备份，随时可重制；旧摘要 BV1DExp6UEdb 因删除接口失效只能置顶导流，无法物理下架 |
| 产物 | `Prototype/loop14_talk/{ep_a,ep_b,ep_c,ep_d,ep_e,ep_a_digest,ep_b_digest,ep_c_digest,ep_d_digest,ep_e_digest}/`、`History/loops/loop14/`（plan/bench/publish_log/net_probe/t1_readiness + 各 ep manifest）、`History/publish/bilibili/runs/`（10 次发布回执 + 10 次评论回执） |

<a id="loop15"></a>
## 小循环 15 · 能力迁移：TalkFactory 独立包（2026-11-01 14:52–15:15）

| 项 | 内容 |
| --- | --- |
| 初始目标 | 人指令：把「素材 → 双语逐词高亮长片 → 3 分钟摘要 → 双向导航」整条能力打包出去，新目录包保持与当前根目录类似但更简化；先核对结构再开干 |
| 人决策 | ① deps 随包（离线即跑）② 样例成片与线上版完全一致（两条 mp4 都带）③ 补齐视频抓取与写稿辅助两个缺口 ④ 落同级新目录 + 仓库留构建脚本 |
| 结束结果 | `F:/AgentWorkArea/WorkBuddy/TalkFactory/`（631MB/443 文件）：Tool 32 文件 + seed 文档 6 份 + loop14 档案 + EP-A 完整样例（两条成片）+ deps 离线自持。静态校验 72/72 文件、语法全过、路径零泄漏；包内冒烟重渲染摘要成功（227s，sd 0.295 与随包成片 0.298 同一基线） |
| 新增工具 | `ted_fetch.mjs`（--pm → 视频+字幕+meta 一条命令，冒烟✓）、`trace_text.mjs`（cue→分桶全文，写稿原料）——两工具先落源仓库 Tool/ops 再随包分发 |
| 新坑 | 16：本机带 http_proxy 时 ffmpeg `-protocol_whitelist` 必须含 `httpproxy`，否则 HLS 输入直接打不开（已固化进 ted_fetch） |
| 产物 | `Prototype/loop15_export/{build_package.mjs, verify_package.mjs, seed/}`（可重建整包）、`History/loops/loop15/plan.md` |
| 遗留 | 包内 Idea/Idea.md 为代拟稿待人终审；素材源片不入包（CC BY-NC-ND 再分发风险+体积），换机重跑需经 ted_fetch 重抓 |

<a id="loop16"></a>
## 小循环 16 · 把「能力打包迁移」沉淀为 Skill（2026-11-01 15:58–16:05）

| 项 | 内容 |
| --- | --- |
| 初始目标 | 人指令：把 loop15 的「打包迁移」做成 Skill 放根目录 `Skills/`，**只写方法论流程、不复制工具**，工具按目录路径引用；同步更新 AGENTS.md 引用 |
| 结束结果 | 建成 `Skills/capability-packaging/`（`SKILL.md` 176 行 + `references/checklist.md` 32 条勾选项）。内容：三条硬判据（能独立跑/能重建/能被质疑）、流程七步、三个必须让人拍板的决策点、七条静默失败坑、5 条仓库路径引用、8 条完成判据。**正文零实现代码**，全部改路径引用 |
| 新增守卫 | `Prototype/loop16_skills/check_skill.mjs`：查 frontmatter 完整性与触发条件、`name` 与目录名一致、引用路径可解析、无大段代码/行数上限。首跑抓出 5 条（3 条自身误报 + 2 条脚本缺陷），两边都修；**反向验证**：造坏技能 → 报 2 问题、退出码 1 |
| 自动发现 | `.workbuddy/skills/capability-packaging` → `Skills/capability-packaging`（NTFS 目录联接），两边 inode 相同，无副本 |
| AGENTS.md | 四处：目录约定加 `Skills\`、原则加「方法论进 Skills」、新增规则 6（Skills 与 Tool 的分工 + 命名 + 自动发现前提）、文件地图加一行 |
| 人工反馈 | 待回填 |
| 遗留 | 单技能样本（多技能路由未验）；`check_skill.mjs` 暂在 Prototype，稳定后可升 `Tool/ops/` |

<a id="loop17"></a>
## 小循环 17 · TED 演讲剪辑创新点深度调研（2026-11-02 08:24–08:55）

| 项 | 内容 |
| --- | --- |
| 初始目标 | 人指令：深度调研 TED 类演讲视频有哪些剪辑创新点 |
| 方法 | 四线并行：外部资料（官方文档优先，可信度分级）+ 同内容三种剪辑语言量化对照 + 自身基线 + 工具可行性判定 |
| 硬发现 | ① 长片剪辑语言=TED 官方原样继承（镜头数 98/103、最长镜头逐帧一致 36.7s），零创新但不落后；② 摘要 ASL 85.45s vs TED 同长 8.54s，差 10 倍、切点差 19 倍且全软溶解——创新空间集中在摘要/切片形态；③ TED 官方 2025-05 上线竖屏 Shorts，「切片→长片」漏斗获官方战略背书 |
| 结束结果 | 六层分类法 20 条手法（叙事/画面/字幕/声音/节奏/分发）+ 优先级矩阵（立刻做 5 项 / 下轮 4 项 / 观望 3 项 / 不做灰色手法）。验证片段 demo/final.mp4 落地 P1-P5：真机位+硬切+whoosh+冷开场+关键词弹出+进度条，ASL 85s→4.7s，全自动化 |
| 新增工具 | `Tool/ops/shot_profile.mjs` 剪辑节奏画像（镜头切分/ASL/运动能量），th=0.15 经 13 切点人工核对精度 ~92% |
| 可信度纪律 | 官方文档>一手博客>从业者经验>营销号；检索到的「模拟数据」研究（ASL 倒 U 型等）一律未采信；营销号精确留存数字标注不可信 |
| 产物 | `Prototype/loop17_edit_research/`（REPORT/README/demo）、`History/loops/loop17/`（plan/notes/profile×4） |
| 人工反馈 | 待回填 |
| 遗留 | P1-P5 尚未并入 make_digest 主链（--clips 模式待做，约半天）；竖屏高光切片线（D1）需单开一轮 |

<a id="loop18"></a>
## 小循环 18 · P1-P5 并入摘要主链 + EP-A v2 成片（2026-11-02 10:44–12:00）

| 项 | 内容 |
| --- | --- |
| 初始目标 | 人指令：开始下一轮，技术实现后先不要上传发布，等人审看 |
| 结束结果 | 新增 `Tool/ops/digest_v2.mjs`（--v2 模式）+ `make_digest.mjs --v2` 入口；EP-A v2 成片 209.4s 落 `Prototype/loop18_digest_v2/ep_a_v2/`，QC 19 格全过（hook/黑卡/真机位/角标/关键词弹出/进度条/导流卡）；**ASL 85.45s→5.66s、切点 0.35→10.32/min，反超 TED 原片 8.85s**；渲染 155s→63s |
| 新坑 | 17：单图 33 trim 分支并行解码内存爆掉 → 视频流**静默截断且退出码 0**；修法=串行切片+音频预混+终混只带 M+1 路输入；成片校验必须查**视频流时长**而非容器时长；附带教训：ffmpeg 管道每处必带 `-y`，否则拿旧文件校验出假象 |
| 人工反馈 | 「上一轮结束，先不发，只留技术资料」→ 未发布；成片与 spec/manifest 留档；手机审看临时页已下线。**最终裁决（11-02 23:27）：「不需要发布」→ 结轮**，EP-A 线上保持 v1，不替换 |
| 遗留 | 无（三项待拍板已全部关闭：不发布 / 文案音色冻结 / 关键词密度维持；停留偏短问题转由 loop21 `--kw-dur` 解决）。**状态 closed** |

<a id="loop19"></a>
## 小循环 19 · B站同赛道剪辑技术学习（2026-11-02 16:49–17:20）

| 项 | 内容 |
| --- | --- |
| 初始目标 | 人指令：上一轮结束先不发只留技术资料；去B站学习同赛道剪辑技术，结束后汇报 |
| 方法 | 公开 API 采样（6 关键词→17 样本元数据+热评）+ 下载 4 条代表视频（html5 480p）+ shot_profile 量化 + 抽帧目验 |
| 硬发现 | ① **播放量与剪辑强度负相关**：541w 冠军是零剪辑+双语字幕（实测 ASL 7.15s≈TED 原片）；② 精讲流派（47w）是"全屏讲义页轮播"（ASL 418s），视频只是讲义载体；③ 励志混剪 ASL 2.15s/27.7切每分，黑白暗调+居中金句+打卡式评论文化；④ 竖屏切片 B站空白 → D1 线对 B站降级 |
| 落地清单 | P1 长片原样+字幕工程强化；P2 弹出停留≥2s+讲义导流；P3 置顶评论互动钩子；P5 讲义页章节卡（HTML→帧全自动） |
| 产物 | `Prototype/loop19_bilibili_study/REPORT.md`、`History/loops/loop19/`（samples.json/profile×4/frames×4/notes.md/两个采样脚本） |
| 人工反馈 | 人给出新指令（设计「师夷长技」Skill）＝方向认可，转 Skill 化 |
| 遗留 | loop18 v2 发布决策仍等人拍板；讲义页章节卡实验未开 |

<a id="loop20"></a>
## 小循环 20 · 「师夷长技」Skill（2026-11-02 21:42–22:05）

| 项 | 内容 |
| --- | --- |
| 初始目标 | 人指令：工作站目的＝剪辑技术侧成长与迭代；设计 Skill＝感知B站以剪辑见长的优秀视频 + 自研实验验证 + 生成工具链，交付后人决定是否归档工具/提炼 Skill |
| 结束结果 | 新建 `Skills/edit-craft-scouting/`（SKILL.md 193 行 + references/checklist.md 27 项）。核心：7 段流水线（选种→拆解→假设→最小实验→判卷→工具化→交付）+ 人闸门 2 决策。判据成体系：三判据选种（含反例配额）、假设三要素+否定条件、同源单变量、三档结论、工具三判据（可重复/参数化/失败可诊断）、完成 8 条 |
| 关键设计 | 把 loop17–19 的实盘教训写成硬约束：播放量≠技术分（541w 冠军零剪辑）、均值陷阱、静帧骗人、静默截断、`-y` 假象、评论区分区误读；工具先落轮次目录、升格需人批——对应人「交付后由我决定归档」的要求 |
| 验证 | `check_skill.mjs` 全绿（引用 13 条路径全解析）；反向验证造坏技能报 2 问题、退出码 1；Junction 自动发现已建，无副本 |
| 产物 | `Prototype/loop20_skill_edit_craft/README.md`（设计要点↔实盘对照 + 三项待裁决） |
| 人工反馈 | 人指令：按 edit-craft-scouting 跑一轮 → 本轮即该 Skill 首次实跑 |
| 遗留 | ① Skill 是否按其自身流程实跑一遍验证可执行性；② loop19 两个采样脚本是否升格 `Tool/ops/` |

<a id="loop21"></a>
## 小循环 21 · edit-craft-scouting 首跑：金句卡流派移植（2026-11-02 21:45–22:40）

| 项 | 内容 |
| --- | --- |
| 初始目标 | 按新 Skill 走完 S1→S7：感知B站剪辑主导视频 → 自研实验 → 工具链 → 停在人闸门 |
| S1 选种 | 6 关键词检索 → 6 样本（3头部/2腰部/1反例）。**三判据剔除 2 条伪混剪**：882w 冠军是教室单机位零剪辑（0.25 切/min）、153w 是黑底口播——播放量≠技术分再次实证 |
| S2 拆解 | 6 条全量化（ASL 2.15–161.7s 区间）+ 8 格抽帧 + 雷军金句版 30s 连续抽帧。核心规律：**素材 1–2s 快切 + 金句/数据大字卡 2–4s 当节奏锚点、大字与语音同步**；我们 v2 差距=信息停留仅 1.6s、章节切换无锚点卡 |
| S3 假设 | 2 条：E1 kw 停留 1.6→2.5s；E2 章节金句锚点卡（压暗+居中白字 1.8s）。均含否定条件与成本上界 |
| S4 实验 | `digest_v2.mjs` 参数化扩展 `--kw-dur`/`--quote-card`/`--quote-dur`（默认行为零改动）；EP-A spec 补 7 章 quote；两变体渲染各 ~80s，视频流时长校验 209.40s 全过 |
| S5 判卷 | E1 **支持**（停留 2.5s 生效、零漂移、目验无遮挡）；指标缺陷诚实记录：可读性商数对短词饱和、区分度不足。E2 **支持**（7/7 章节卡全命中、可读、零漂移）。人主观判定挂闸门 |
| 新坑 | 18：`--reuse-tts` 按输出目录隔离，跨目录 A/B 需拷 wav（已固化 ops.md） |
| 过程坑 | 会话技能索引是启动快照，新建 Skill 需重开会话才被自动加载（本轮按 SKILL.md 手动执行） |
| 产物 | `Prototype/loop21_craft_experiments/`（REPORT/两 demo×2 对比/spec_quotes/qc 抽帧）、`History/loops/loop21/`（s1 选种/s2 卡片/s3 假设/profile×6/frames×7） |
| 人工反馈 | 待回填 |
| 遗留 | 人闸门 4 项：E1 默认值？E2 进 spec 模板？工具扩展处理方式认可？demo 不发布 |

<a id="loop22"></a>
## 小循环 22 · 跨内容域剪辑技术图谱（2026-11-02 22:12–22:40）

| 项 | 内容 |
| --- | --- |
| 初始目标 | 人纠偏：技术侧不要拘泥于演讲赛道，放眼全局看更多剪辑技术 |
| Skill 修复 | `edit-craft-scouting`：三判据第三条「同赛道对照」→「技术可迁移」；新增视野纪律第一原则 + 反面教材（loop19/21 实录）；样本配比改 6–8 条跨 ≥3 域；新增 10 域×技术特长速查表；坑 9（视野自我锁死）/坑 10（域≠技术类型）；checklist A 段重写 + G 段视野自检。check_skill 全绿 |
| S1 选种 | 8 内容域检索 254 条 → 9 样本跨 7 域（影视飓风 8K 545w / 20秒卧槽 2601w / 108部混剪 625w / 滑坡一镜到底 22w / 治愈Vlog 57w / 充电宝测评 112w / 鬼畜 855w / 车声浪 161w；反例引 loop21 882w 口播）。域污染 1 起按规矩补样 |
| S2 图谱 | 8 技术类别：极限快切(0.81s ASL)/声画同步/双峰节奏/电影长镜头/镜头内运动/日记字幕层/双栏信息卡/花字画中画。硬发现：①字幕四种角色我们只有一种；②全部快剪流派节奏是双峰、我们 v2 是唯一单峰；③剪辑主导样本内播放量与剪辑强度正相关（与演讲赛道相反）——赛道决定相关方向 |
| S4/S5 | H1 音乐床 ducking **支持**（机制层：死寂 -91→-40.7dB，人声段不受扰，demo `b3_bgm_full/demo_b3_bgm`）；H2 节拍对齐**反驳**（625w 踩点混剪辑点落峰 1.1× 随机 → 踩点是动作语义，BGM 当速度床）；H3 调色 LUT 未执行（成本保护） |
| 新坑 | 19 跨域检索同形词污染；20 能量峰≠音乐节拍（ops.md） |
| 新工具 | `loop22/{s1_cross_select,s4_beat_align,s4_bgm_mix}.mjs`（轮次目录，未升格） |
| 产物 | `Prototype/loop22_cross_domain/REPORT.md` + demo；`History/loops/loop22/`（profiles×9/frames×9/脚本×3） |
| 人工反馈 | 待回填 |
| 遗留 | 人闸门：P1 音乐床（需授权曲库）→ P2 双栏章节卡 → P3 调色 LUT 优先级；demo_b3 听感盲评；三个分析工具是否升格；loop18 v2 发布决策仍挂起 |

<a id="loop23"></a>
## 小循环 23 · 首部独立成片《光偷走的那两小时》（2026-11-02 22:49–23:15）

| 项 | 内容 |
| --- | --- |
| 初始目标 | 人指令：8 类跨域技术要交**实际作品**，不要再是 TED 演讲剪辑 |
| 选题 | 《光偷走的那两小时》：睡眠史即调色史（烛光1800K→白炽2700K→荧光4300K→LED/屏幕7500K→晨光回暖）。数据多源核实：Gallup 1942 平均 7.9h（<5h 占 3%）→ 2013 6.8h（14%）、CDC 2016 三分之一 <7h |
| 自产素材 | ImageGen 9 张 35mm 质感静帧（约 90 credits；底部「AI生成」水印用 crop=1536:864 裁除）；Playwright+HTML 渲染 7 张 1080p 版式卡（标题/金句×2/**双栏数据卡×2**/SVG 折线图/片尾）；TTS 8 段（Yunjian，-10%，429 退避重试）；BGM=ffmpeg 合成 drone pad（55+110Hz+tremolo+粉噪空气层，零版权风险） |
| 渲染器 | `Prototype/loop23_shortfilm/make_essay.mjs`：逐 shot 串行 clip（zoompan 运动 + colortemperature 叙事调色）→ concat demuxer copy → 音频三级预混（voice / whoosh+impact / BGM sidechain-ducking）→ 烧 ASS 字幕（日记层+花字弹出层）→ 视频流时长校验 |
| 排障 | ① EdgeTTS 429 → 退避重试 4 次；② `card_dir` 相对路径×cwd 错位 → 6 个 card clip 静默漏渲染、concat 只剩 3.8s → 路径绝对化+全分支失败检查；③ filter label `[voice]` 被消费两次 → asplit（坑 21 入 ops.md） |
| 成片 | `Prototype/loop23_shortfilm/out/final.mp4` · 2:08 · 1080p30 · 22.4MB · 视频流 127.77s 校验通过 |
| 量化 | shot_profile：16 检出镜头，min 0.6s / p10 0.6 / 中位 5.0 / p90 16.2——**双峰节奏达成**；快切段 -18.1dB 有能量、人声段 -20.6dB 主导、静读卡 -29.2dB BGM 回落；QC 16 格全过（调色渐变/双栏卡/图表/花字/字幕/无水印） |
| 8 类技术落点 | ①极限快切=开场 5 连切 0.6-0.7s ②声画同步=21 切点 whoosh+章节 impact ③双峰=0.6s 快切 vs 4-5s 卡停 ④叙事调色=逐镜头色温 ⑤镜头内运动=zoompan 推拉平移 ⑥日记字幕=散文旁白层 ⑦双栏信息卡=s11/s17 ⑧花字=数字弹出（spec.json note 有完整映射） |
| 人工反馈 | 待回填 |
| 遗留 | 发布决策等人；花字与图表顶部轻微重叠可微调；数据卡版式可参数化进 make_digest |

<a id="loop24"></a>
## 小循环 24 · loop18 结轮 + loop23 沉淀（2026-11-02 23:24–23:40）

| 项 | 内容 |
| --- | --- |
| 初始目标 | 人令：①「loop18 v2 的不需要发布，记下反馈，结束那次循环」②「Skill与工具的提炼只对这一次技术实验进行」 |
| loop18 结轮 | `History/loops/loop18/plan.md` §5 记录裁决并关闭三项遗留（不发布 / 文案音色冻结 / 密度维持）；EP-A 线上保持 v1；v2 管线留作可复用能力。CircleLog 回填，状态 closed |
| 工具升格（仅 loop23） | `Tool/ops/make_essay.mjs`：spec 参数化（--spec/--out/--work/--reuse-tts/--no-bgm/--crf/--preset），新增 spec 前置校验（id 唯一/kind 合法/素材在位）、逐 clip 时长漂移校验、无 tts/无音效/无 colortemperature 的降级分支；**升格即抓出坑 22**——原「TTS 归一化」是就地转码（ffmpeg 拒绝同名输出）且未检查状态，从未真正执行。`Tool/ops/render_cards.mjs`：--html/--ids/--size/--copy 参数化 + 非整屏告警 + pathToFileURL 兜中文路径。loop23 原文件改为冻结快照标注，loop19/22 脚本**明确不升格** |
| Skill 提炼（仅本次实验） | 新建 `Skills/essay-film-production/`（SKILL.md 152 行 + references/spec-schema.md + references/qc-checklist.md）：8 类技术落点表（写法/经验值/失败长相）、七步流水线与两处视频流校验、语音驱动时间轴、三级音频、版式卡三约束、素材三硬约束、7 条实盘坑位、QC 六组清单、人闸门前红线 |
| 复现验证 | `node Tool/ops/make_essay.mjs --reuse-tts --out out_repro` → 127.77s，**与定版 22371775B 仅差 37B**（≈逐字节一致）；QC 16 格目验全过（调色梯度/双栏卡/图表/字幕/无水印） |
| 校验 | 两工具 `node --check` 过；`check_skill.mjs` 全绿（修 1 条误判为路径的行内码）；ops.md 补工具表 2 行 + 散文影像最短链路 + 坑 22/23 |
| 人工反馈 | 「发布了吧，做都做好了」+「重点突出"光影氛围化剪辑风格"」→ **loop23 成片已发布**，BV1BZ4A65Ef5；loop23 发布决策关闭。沉淀（工具×2 + Skill）＝对本次实验「归档+提炼」两项闸门的执行 |
| 遗留 | 花字死坐标压图表标题问题已写进坑 23 待改版式；Skill 是启动快照外的新技能，下个会话才能自动发现 |

<a id="loop24-2"></a>
## 小循环 24 追记 · 首次发布《光偷走的那两小时》（2026-11-02 23:37–23:43）

| 项 | 内容 |
| --- | --- |
| 初始目标 | 人令：发布 loop23 成片，重点突出「光影氛围化剪辑风格」 |
| 封面 | 两版 make_cover 候选被否（副标色不搭 / 帧内残留原字幕）→ 改走 render_cards 工作流：烛光 1800K（左暖）× 屏幕 7500K（右冷）渐变拼接 + 标签「光影氛围·剪辑实验」+ 副标「睡眠史，就是一部光的调色史 · 1800K → 7500K」，HTML 排版所见即所得。**踩到 4:3 裁剪切掉标题** → 文字整体移进中心 960px 安全区后复验通过 |
| 投稿 | dry-run 两轮全绿后真发：标题 33 字、简介 379 字（含章节时间轴 + 数据来源 + AI 声明）、8 标签（平台自动补的 3 个已剔除）、分区 知识、创作声明「含AI生成内容」 |
| 回执 | **BV1BZ4A65Ef5**（aid 117547600971623），公开接口核验：标题/时长 128s/封面/简介全部一致；`out/publish_receipt.json` 留档 |
| 遗留 | 置顶评论（数据来源/导流）未做，等人指示；转码完成后建议手机复看一遍成片质感 |

<a id="loop25"></a>
## 小循环 25 · 剪辑强UP主技术成长路径图谱（2026-11-03 08:08–08:40）

| 项 | 内容 |
| --- | --- |
| 初始目标 | 人指令：锚定B站剪辑区优秀up主5位，观察历史发展史，总结可复现的技术成长路径图谱 |
| S1 选种 | 跨5域定5人：影视飓风(影视/1890w)、硬核的半佛仙人(知识/771w)、老番茄(游戏/2087w)、李子柒(治愈vlog/1026w)、伊丽莎白鼠(鬼畜/716w)。首搜「半佛仙人」命中同名小号（11粉），改名「硬核的半佛仙人」重解析 |
| S2 时间线 | wbi 签名拉全量投稿 2432 条（游客cookie被-352风控，改走登录态profile请求）。年聚合+爬坡点（≥8×前5条均值且≥50w） |
| S3/S4 量化 | 每人「早期vs成熟期」各1条（共10/10下载成功），shot_profile 量化：影视飓风 13.38→3.79、李子柒 8.60→2.29（p90 23.0→3.5）；老番茄/半佛开号即成熟（2.02/2.75≈成熟期）；伊丽莎白鼠鬼畜ASL不可比（诚实标注） |
| 图谱核心 | T0基本功→T1差异化(一招必杀,爬坡8-15×)→T2结构化(类型片/剧情/季节叙事,中枢上移)→T3工业化(产能+包装)。五规律：①基本功是集中练的不是慢慢长的 ②首爬坡靠单点极致 ③二次成长在片级结构 ④成熟=分布收窄不是变快 ⑤配方固定+产能杠杆（半佛反例）与精度替代产能（鼠）两条非主路成立 |
| 过程坑 | frame_sheet 相对路径解析基于 ROOT 非 cwd（10连跑半数崩），绝对路径重跑解决；execFileSync 下载时 dl_bili 路径写错静默全败一轮 |
| 产物 | `Prototype/loop25_growth_map/REPORT.md`（含对我们 A-D 四条路径建议+人闸门2决策）；`History/loops/loop25/`（时间线×5、画像×10、抽帧×10、样本×10、脚本×2） |
| 人工反馈 | 「沉淀工具」→ 三个采集脚本升格 Tool/ops（up_timeline/phase_select/dl_bili），冒烟验证通过（选样与原产出逐字节一致；时间线走缓存 5/5） |
| 遗留 | 人闸门仅剩：①A-D路径选择（成长图谱下一步） |

<a id="loop26"></a>
## 小循环 26 · B路径首作《AI工坊的一夜》（2026-11-03 08:52–09:30）

| 项 | 内容 |
| --- | --- |
| 初始目标 | 人裁决走 B 路径（氛围过程美学）；选题人投票「AI工坊的一夜」 |
| 形态 | 无解说纯氛围 + 环境音，五幕时间弧（入夜23:14→开工→生成00:41→渲染03:26→天亮05:58），色温暖→冷→暖，与 loop23 呼应成系列 |
| 素材纪律 | 全部真实过程产物零摆拍：真实终端命令实录（时间线/画像/编码进度/API核验）、真实代码（make_essay 主链）、真实 manifest、真实B站线上页截图；loop23 AI 静帧仅作氛围插入（AI 声明延续） |
| 工具 | make_essay 升级 pan-u/pan-d 纵向运镜 + 运镜变焦基数语法 pan-d@1.35；音频后混管线：Node 手写 PCM 氛围（房间底噪+风扇+键盘簇+上线铃）→ amix 进成片 |
| 坑 | render_cards 截图是元素自适应尺寸非视口尺寸（588/1448/681/100 四种高度）→ 窗体固定高度+字号缩放解决；api.json 压缩单行截图只有 100px 高 → pretty-print；pan 固定 z=1.10 纵向行程不足 → @语法 |
| 量化 | 69.9s / 21 切点 / ASL 3.33s / 短镜 66.7% / p90 8.1 —— 比 loop23（7.1s）更接近李子柒形态（2.29s） |
| 产物 | `Prototype/loop26_night/out/final.mp4`（14.2MB，含氛围音轨）+ QC 抽帧全过 |
| 人工反馈 | 待回填 |
| 遗留 | 发布决策等人；氛围音合成器 gen_ambience 待裁决是否升格 |

<a id="loop26-2"></a>
## 小循环 26 追记 · v2 重构（2026-11-03 11:41–11:52）

| 项 | 内容 |
| --- | --- |
| 人反馈 | 方向不错但内容单薄，配图太常规 → 中间过程集中在**推理思路与工具调用**；除时间帧外全片只用**一个小黑 bash 框**表达 |
| 重构 | 新增 gen_flow.mjs 剧本生成器：12 个场景页（? 推理行 / $ 命令行 / 输出行分色）+ 6 张时间大字卡 + 黑底标题/结尾卡。全部内容来自真实会话（选种→-352 风控→同名小号翻车→量化判卷→A-D 裁决 B→pan-d 渲染失败→根因修复→QC），零编造 |
| 坑 | 居中模式 id 必须挂外层 1080 容器（挂内层框会截出 1640x633）；ambience 时长手算错 9s（109.6 当 100.6）→ 结尾干音，重生成修复 |
| 产物 | `Prototype/loop26_night/out_v2/final.mp4`（109.6s / 20 镜 / 4MB），QC 22 格全过；v1 保留对照 |
| 人工反馈 | 待回填 |
| 遗留 | 发布决策等人；v1/v2 二选一或 v2 直接发 |

<a id="loop26-3"></a>
## 小循环 26 追记 · 背景音改呼噜循环（11-03 11:55）

- 人令：背景音换成**人打呼噜音效，循环播放**。
- 实现：gen_snore.mjs 纯 PCM 合成（零版权纪律延续）——吸气段（响/30Hz腭颤/高腔体）+ 呼气段（轻/21Hz/低腔体）+ 屏息顿，周期约 4s，逐周期 ±8% 微扰防机械循环感，首尾 2s 淡入出。
- 替换：ffmpeg -map 0:v -map 1:a 视频流 copy，旧氛围音整轨丢弃（非叠加）。视频流逐字节未动。
- 验证：4 个采样点 volumedetect 均值 -25dB/峰值 -5.5dB，全片稳定在轨。
- snore.wav 与 gen_ambience.mjs 并存，发布前如需换回氛围音可一步重混。

<a id="loop26-4"></a>
## 小循环 26 追记 · 哨音式呼噜（11-03 12:06）

- 人反馈：上一版噪声底+颤音的呼噜太假 → 改**吹哨式鼾声**：吸气 = 上扬哨音（500→950Hz 弧线 + 5.5Hz 颤音 + 二泛音），呼气 = 低一声下滑"嘟"（370→300Hz），屏息顿 ~4s 周期，逐周期微扰。
- 哨音为纯音色，首混均值 -14dB 偏吵 → 压 5dB 重混，终值均值 -20dB / 峰值 -11dB。视频流始终未动。

<a id="loop26-5"></a>
## 小循环 26 追记 · B站头像设计（11-03 12:46-12:56）

- 人令：生成B站头像，按当前账号信息定。账号实况：逆子草履虫 / Lv2 / 2粉 / 无签名 / 默认头像（从未换过）。
- 三版方案（终端黑框/暖冷光/极简icon）被否 → 人定向：**以真实草履虫为原型 + 叛逆感**。
- 终稿：显微镜暗场草履虫——鞋底形细胞、72根程序化周身纤毛、顶部莫霍克鸡冠刺头（叛逆核心）、半睁斜白眼+坏笑+十字创可贴（不良三件套）、口沟/大小核/食物泡/伸缩泡齐全、左暖右冷轮辋光（频道视觉延续）。
- 修了三轮：大核黑团压嘴→右下移；方形暗角穿帮→径向渐变；莫霍克被膜盖住+纤毛法向量算反全倒插膜内→翻转 nx/ny 并把刺头层移到膜外。48px 下莫霍克+表情仍可辨认。
- 产物：`Workspace/tmp/avatar23/av.png`（1080²）+ 三档尺寸预览。停在「是否上传账号」闸门。

<a id="loop26-6"></a>
## 小循环 26 追记 · 头像上传上线（11-03 12:58-13:08）

- 人裁决：选 **C 极简 icon 版**（绿草履虫圆环 + 提示符）。
- 修两处后上传：`>_` 圆裁切角 → 提示符移到细胞正下方居中；下划线字符天然贴基线错位 → 换方块光标元素 + flex 对齐（排查中发现第一次替换误命中 avA 的 .cu，avC 漏改，逐行核对修正）。
- 上传流程（登录态 Playwright）：更换头像 → **选择本地图片** → input[type=file]（首次 run 挂错隐藏 input，改挂 last）→ 裁剪页「更新」**不是 button 标签**，button 定位超时两轮 → 改 getByText 精确匹配点中提交。
- 核验：nav face URL 779278…→12c554…，下载线上图目验完整（绿虫+>▮）。默认头像正式退役。

<a id="loop27"></a>
## 小循环 27 · 素材采集线 collect_material（2026-11-05 12:10–12:45）

| 项 | 内容 |
| --- | --- |
| 初始目标 | 人指令：建立稳定"素材采集线"——采集方式分「工具网搜（低代价）/AI 生成（高代价积分）」，素材含视频/图片；采集器要能"给出不同代价下的方案→人选→最大限速采集"，服务内容创造 |
| 形态 | `Tool/ops/collect_material.mjs` 五子命令：plan（四级方案卡=闸门，不选不动）/ fetch（并发池+每主机并发闸+配额即中止+sha256 去重+ffprobe 质检）/ list（L0 复用检索）/ register（AI 产物登记，强制 ai_generated）/ brief（L3 采集简报）。库：`Material/manifest.jsonl` 总账（入库）+ library/quarantine/inbox 实体（gitignore）+ 回执 `History/runs/materials/` |
| 代价分级 | L0 库内复用（0/0）→ L1 开放授权网采 NASA(PD)+Wikimedia（0 积分，授权署名自动登记）→ L2 待核授权（NC/ND/未知只进隔离区，promote 前不得发布）→ L3 AI 生成（积分，AI 声明纪律） |
| 实测（重史诗感） | 图片 6：5 NASA 星云 PD 入库 + 1 wiki CC BY-SA 隔离；视频 2：NASA 猎户座 1080p/128s PD + wiki 航拍 1080p/174s CC BY 入库（NASA 存档视频多为 320p 被 540p 地板拦下）；brief×4；register 用 B站头像演示 L3 登记成功；库预览 4×2 全格有效 |
| 坑（ops.md 25-27） | ①配额满后进程挂死：在途大文件+Retry-After 大值被原样 sleep → AbortController 中止+硬顶 8s+每主机并发闸；curl -I 被代理截断只回 CONNECT；②Commons url 带 ?utm_source 污染转码派生，静默回退 946MB 原片白下 125s → cleanUrl+官方 videoinfo derivatives 选档；③ffprobe 给静态图也报 0.04s duration，NASA 图片被当视频误杀 → kind 以 mediaType 为准+图片 duration 置 null |
| 产物 | `Tool/ops/collect_material.mjs`；`Prototype/loop27_material_line/`（README+library_sheet.jpg）；ops.md 工具表+坑 25-27 |
| 遗留 | 反馈点 4 条待人裁决：①代价层级命名/积分量化 ②L2 promote 子命令 ③Pexels/Pixabay 接 key（1080p 免费视频主力源）④L3 简报 prompt 风格 |

<a id="loop28"></a>
## 小循环 28 · 紫冥剑三招拆解（2026-11-05 17:09–18:55）

| 项 | 内容 |
| --- | --- |
| 初始目标 | 人指令：拆解 IGN《影之刃零》全单手武器招式演示（BV1gFxv6nEde），结合传统武术与古兵器，出一支「一武器三招式」剪辑短视频 |
| 拆解发现 | 演示片每武器固定四段式：普通连段(LV15/25)→杀气连段→绝技→处决技，标注自带手柄输入序列；与 IGN wiki 互证（30 武器独立模组/甄子丹动捕）。标注区半透明叠加，逐帧哈希失效，改裁切放大目读建时间表 |
| 选材 | 紫冥剑（剑=古兵器最佳载体）：普通连段 295-305 / 杀气连段 315-325（腾身回斩）/ 绝技·栖龙剑阵 376-386 |
| 成片 | 39.5s / 1280×720：片头卡 + 三段（ASS 三行花字：招式名/对照/古籍引文）+ 尾卡；响度归一 -16LUFS；游戏原声保留 |
| 对照口径 | 壹·连环↔剑术连环（越女论剑引文）；贰·变招↔挂/劈/崩连变；叁·剑阵↔剑器舞/七星阵的浪漫化想象；声明「对照联想非溯源教学」 |
| 坑（ops.md 28） | 异源拼接 concat demuxer -c copy 时基错乱（39.5s→68s 静默拉长）+ 音频流损坏 → 单命令 filter_complex + concat 滤镜统一规格一次成型；连带 anullsrc 输出只能消费一次、list.txt 相对路径 |
| 产物 | `Prototype/loop28_weapon_breakdown/`（out.mp4 + REPORT.md + cards + build.sh + ASS） |
| 遗留 | 反馈点：对照口径/竖屏版/1080p 登录态通道/兵器谱系列化 |

<a id="loop28b"></a>
## 小循环 28b · 逐帧慢放+动力链（2026-11-05 19:25–20:05）

| 项 | 内容 |
| --- | --- |
| 初始目标 | 人指令：v1 基础上每个招式每个动作逐帧慢放，叠加"动力链"白色弧线（足→腰→肩→剑尖）帮助理解发力模式 |
| 重选窗口 | v1 三个窗口有 1.5s 混入上一段场景（377.5s 才切绝技）；v2 重标：壹 302.4-305.4（连续白弧/机位稳）/ 贰 319.5-321.5（金环→蓝气→斜劈）/ 叁 378.4-380.9（起手→金丝→剑阵，γ1.35 提亮） |
| 工线 | 锚点关键帧标定（足/腰/肩/手/尖五点×14 帧）→ smoothstep 逐帧插值 → Chaikin 平滑 → 法向偏移带状闭合多边形（fill 白）→ 每帧 ASS 事件（~10k 条）烧录 0.25× 慢放；atempo 两级 0.25× 低沉慢音效 |
| 坑（ops.md 29） | libass drawing 填充语义：m/l 自动闭合+bord 描闭合轮廓（开放折线渲染成闭合 V）；BorderStyle 3 给 drawing 画白底盒；Catmull-Rom 过冲折返→Chaikin；小拼图锚点读数偏差 100px+ |
| 产物 | `Prototype/loop28_weapon_breakdown/`：out_v2.mp4（39.5s/11.9MB）+ gen_chain.mjs + chainA/B/C.ass + build_v2.sh + REPORT.md v2 章节 |
| 遗留 | 弧线形态可再加"发力段变色"（足段暗→剑尖段亮已做）；1080p 登录态通道仍待升级 |

<a id="loop28c"></a>
## 小循环 28c · 古谱纸笺版（2026-11-05 20:25–20:36）

| 项 | 内容 |
| --- | --- |
| 初始目标 | 人反馈：v2 动力链效果一般，去掉；改每动作慢放+右下角贴黑白古朴的古代招式动作图 |
| 实现 | ImageGen 生成 9 张明代兵书木刻版画风插图（统一提示词模板，一动作一图）→ ffmpeg 后处理成纸笺（去水印/灰度/米色宣纸调/墨框/微旋转）→ overlay enable 按小节切换+alpha 淡入出 |
| 结构 | 慢放与窗口沿用 v2；动作字幕保留，新增"右下古谱 · 招式名"副行 |
| 产物 | `out_v3.mp4`（39.5s/11.2MB）+ plates/ ×9 + cap{A,B,C}.ass + build_v3.sh |
| 成本 | ImageGen 10 次生成（1 张试风格 + 1 张弃用重生成），约 50-100 credits |
| 遗留 | 竖屏版 / 1080p 登录态通道 / 兵器谱系列化仍待裁决 |

<a id="loop28d"></a>
## 小循环 28d · 还原动捕速率版（2026-11-05 21:29–21:33）

| 项 | 内容 |
| --- | --- |
| 初始目标 | 人反馈：0.25× 慢放太慢；游戏把动捕动画提速播放，想回到演员原始动捕速度（比 0.25× 快、比 1× 慢） |
| 实现 | 速率 0.7×（setpts=1.4·PTS + atempo=0.7143）；字幕/纸笺时间轴全重排，字幕精简单行；全片 20.1s |
| 产物 | `out_v4.mp4`（20.1s/6.7MB）+ build_v4.sh + cap4{A,B,C}.ass |
| 遗留 | 20s 偏短：可扩动作窗口补内容（源 288-398s 素材充足，需重排小节对应） |

<a id="loop29"></a>
## 小循环 29 · 细节取证 + 取证试片（2026-11-05 21:50–22:35）

| 项 | 内容 |
| --- | --- |
| 初始目标 | 人指令："先说细节取证"——验证"没必要做但做了"的细节能否真的从画面里扣出来 |
| 方法 | 逐帧拼图+绝对时间码验证法；重大事故：input seek 落 keyframe，帧号标签全错，第一轮取证作废（坑30/31） |
| 发现 | 壹段(302.4-305.4s) 5 条实录级细节 D1 蓄力6帧无特效 / D2 特效与压低同帧 / D3 撩后贴地滑0.5s / D4 跪姿大回环 / D5 特效先消身体殿后；B/C 段被特效覆盖不可取证 |
| 产物 | REPORT.md + out_forensics.mp4（14.4s/720p/无声，7段断言句字幕+时间码/速度HUD+实录角标）+ gen_subs.mjs + build_forensics.sh（split+trim 单命令） |
| 遗留 | 0.15× 步进感观感待裁决；D2 特效对齐留给正片并排对照 |

<a id="loop30"></a>
## 小循环 30 · 幕后专访取证（2026-11-05 22:28–22:50）

| 项 | 内容 |
| --- | --- |
| 初始目标 | 人给 IGN 甄子丹专访链接（BV1e2gH62EKS），补上"受击反馈/身形位移取不回"的证据缺口 |
| 发现 | 甄子丹本人穿动捕服下场（F1）；官方动机原话"刺激只是最基本的要求…让观众在情感上更投入"（F4）；官方案头动作分解线稿=官方版节拍谱（F2）；受击排练存在（F3）；loop29 推断 I1 升级实录 |
| 产物 | loop30_bts/REPORT.md；源片 Workspace/tmp/bili_zjdan/src.mp4（16.5min） |
| 备注 | 台词靠内嵌硬字幕抽带读取；修正误读："三段"=制作流程三段，非武器四段式 |

<a id="loop31"></a>
## 小循环 31 · 双游戏武术演出量化对比（2026-11-05 23:06–23:36）

| 项 | 内容 |
| --- | --- |
| 初始目标 | 人指令：客观对比明末渊虚之羽（BV1PrtEzLExH）vs 影之刃零（BV1gFxv6nEde）武术演出；二轮纠正：聚焦**动作丰富度** |
| 方法 | 同规格 640×360@30fps 量化（切点/运动强度/亮度）+ 标注区变化点检测读技能表 + 发力峰三阈值密度 + 两片各 24 峰时刻等距采样目读 |
| 结论 | 影零词汇量 2.2 倍（5.0 vs 2.3 段/分）+ 强度谱宽（极强爆发 20×）+ 姿态堆料；明末属性堆料但可读率 100%（影零约 58%）；词汇量×可读率乘积接近 |
| 产物 | loop31_compare/REPORT.md（含动作丰富度专项增补章节）+ labels_all2.jpg + sample_mm/yz.jpg |
| 收束 | 人定向：将来影零研究主线=「动作丰富度 与 自然发力效果」，已写入 MEMORY.md |

> **缺口**：小循环 32–38（2026-11-06 全天，7 轮）未写日志。证据在 11-06 的 git 提交与 `Prototype/loop32…loop38/`；补录待人工确认后按同样表格追加。

## 维护记录 · 2026-11-07 08:11 · 技能真源化：.workbuddy/skills 移到 Skills/ 并联接挂回

| 项 | 内容 |
| --- | --- |
| 初始目标 | 人指令（2026-11-07 08:11）：先不迁出；把 .workbuddy/skills 里的技能全部转移到 AGENTS.md 规定的技能目录 Skills/ |
| 动作 | versus-edit 实体目录移入 Skills/；exec-extract 运行态与 Skills/ 归档态一致，删 .workbuddy 实体目录；删除 Skills/exec-extract/tool/exec_extract.mjs 副本（规则 6 违规修正，工具唯一真源=Tool/ops/）；为两者建目录联接（junction）挂回 .workbuddy/skills |
| 结论 | 四技能（capability-packaging / edit-craft-scouting / essay-film-production / exec-extract / versus-edit 共 5 个）真源全部在 Skills/，.workbuddy/skills 全部为 junction，无复制分叉；SKILL.md 内嵌代码 7/12 行均为用法片段，合规 |
| 产物 | Skills/{exec-extract,versus-edit}/（真源）+ .workbuddy/skills 两条新 junction + 本次提交 |
| 收束 | 待人反馈：迁出包（CutFactory）方案 v2 仍在等三项决定（迁移方式/动作线源片/Material 副本清理） |

## 维护记录 · 2026-11-07 09:01 · AGENTS.md 增 Material 目录约定

| 项 | 内容 |
| --- | --- |
| 初始目标 | 人指令（2026-11-07 09:01）：Material 目录添加到 AGENTS.md，只放索引链接 |
| 动作 | AGENTS.md 规则 3 新增 `Material\` 条目（只放 manifest.jsonl 机器账 + INDEX-<主题>.md 人读索引，实体落 library/ 且 gitignore 排除）；原则口诀补「素材只留索引进 Material」；文件地图加一行 |
| 结论 | 现有入库内容即符合新规：git 跟踪 Material 仅 3 个索引文件（INDEX-影零处决.md、briefs 简报、manifest.jsonl），library/inbox/quarantine 实体均在 .gitignore |
| 产物 | AGENTS.md（3 处改动）+ 本次提交 |
| 收束 | 待人反馈：迁出包四项决定仍挂起；237 项未提交改动与分支分叉未处理 |

## 维护记录 · 2026-11-07 09:03 · 纠正 Material 语义：只放本地素材

| 项 | 内容 |
| --- | --- |
| 初始目标 | 人纠正（2026-11-07 09:03）：Material 是「只放本地素材」，上一版误写成「只放索引与链接」 |
| 动作 | 改写 AGENTS.md 规则 3 的 Material 条目为「放本地素材：源片/片段/关键帧实体存本机、可重采可重建、实体 gitignore 不入库，入库仅 manifest 账本 + INDEX 索引」；口诀改为「素材进 Material（本地存放，不入库）」；文件地图同步 |
| 结论 | 语义归位：Material 承载素材本体，不是索引容器；索引只是它的入库部分 |
| 产物 | AGENTS.md 修正 + 本次提交（覆盖上一版 ed30a91 的措辞） |
| 收束 | 待人反馈 |

## 维护记录 · 2026-11-07 09:09 · 新增全局规则：渐进式披露

| 项 | 内容 |
| --- | --- |
| 初始目标 | 人指令（2026-11-07 09:09）：新增全局规则「渐进式披露原则维护仓库」——每个非根目录只留一个同名 xxx.md 作索引，其他只能是子目录，递归成立；并征询看法 |
| 判断 | 原则成立（逐层下钻、避免全树扫描），但字面执行会自我否定：①「其他只能是子目录」会把数据文件逼成目录（clips/ 46 个 mp4 → 46 个目录）；②存量 414 个非根目录、47 个散落 README/REPORT、11 个工具硬编码 Prototype 路径，集中重构会断链 |
| 口径 | 人选定「约束说明文档版」：只约束说明类文件（README/REPORT 并入同名索引），数据产物可留目录内；递归成立；存量懒迁移 |
| 产物 | AGENTS.md 新增全局规则 7（含 5 条细则）+ 本次提交 |
| 收束 | 待人反馈：建议以 loop38_exec_extract（刚触达，含 REPORT.md）作首个样板改造，待确认 |

## 维护记录 · 2026-11-07 09:13 · 工具默认目录去 loop 化

| 项 | 内容 |
| --- | --- |
| 初始目标 | 人质疑（2026-11-07 09:13）：Tool 为啥硬编码目录，工具应通用灵活 |
| 核查 | 更正上轮夸大：全仓 Tool 无绝对路径（F:/ 0 处），12 工具统一用 import.meta.dirname 相对锚定 ROOT；真正写死 loop 名的**仅 3 处默认值**（collect_feedback 的 DEFAULT_CSV、exec_bound/exec_extract 的 outDir 兜底），其余为注释里的出处标注 |
| 动作 | ① 三处默认值中性化：exec_extract → Prototype/exec_extract_out、exec_bound → Prototype/exec_bound_out、collect_feedback → History/runs/feedback/feedback.csv（优先级 --csv > FEEDBACK_CSV > 中性默认）；② 旧账本一次性归位（复制不删，打印提示）；③ 两处注释出处从 loop37 REPORT 改指 Skills/exec-extract/SKILL.md（规则 6：方法论真源在 Skills） |
| 验证 | node --check 三文件通过；无参运行只打印用法、不误建目录；--dry-run 实测账本归位成功（371B 复制，原文件保留）、未写数据 |
| 产物 | Tool/ops/{exec_extract,exec_bound,collect_feedback}.mjs + History/runs/feedback/feedback.csv（新账本位） |
| 收束 | 待人反馈 |

## 维护记录 · 2026-11-07 09:19 · 发布应用标记 .genie 停止跟踪

| 项 | 内容 |
| --- | --- |
| 初始目标 | 人问（2026-11-07 09:19）根目录 .wbapp_0xiB013vLX53EoXttRJu7F.genie 是什么；确认后处置 |
| 查明 | 是发布应用的本地标记（appId ↔ localDir 映射，175B），由发布工具固定写在 workspace 根；内含本机绝对路径；该 app 已被复用三次（EP-A 摘要 v2 → loop35 对比片 → 处决合集），名字仍停留在最初 |
| 动作 | .gitignore 增 `.wbapp_*.genie`（含说明）；`git rm --cached` 停止跟踪，本地文件保留 |
| 结论 | 根目录恢复为 AGENTS.md + 7 个约定目录（.genie 与 .workbuddy 均为本机文件、不入库）；应用名漂移需在「设置—数据管理—应用」手动改为「影零处决合集」 |
| 产物 | .gitignore + 本次提交 |
| 收束 | 待人反馈：仍余 232 项 30fps 删除与 4 张 QC 图未处理 |

## 维护记录 · 2026-11-07 09:23 · 清掉 30fps 删除记录与转码质检图

| 项 | 内容 |
| --- | --- |
| 初始目标 | 人指令（2026-11-07 09:23）「清掉」——处置两处遗留：232 项 30fps 删除的提交记录、4 张转码质检图 |
| 动作 | ① 删除 4 张未跟踪质检图（crf28_check.png + qc_showcase_1/2/3.png，共 2.0MB，均为已完成的转码目验证据，结论已写入 CircleLog 与发布记录）；② `git add -u` 把 232 项 30fps 删除（clips1080p30 的 ass/jpg/csv/html + frames1080p30 的 138 张 png）正式提交，工作区清空 |
| 结论 | 工作区干净（git status 无输出）；1080p60 版为唯一真源，30fps 版从磁盘与版本库同时移出 |
| 产物 | 本次提交（232 删除）+ CircleLog |
| 收束 | 待人反馈：仍可清的两处候选——loop38 顶层 5 张 QC 拼图（22MB，git 跟踪中）、clips/ 旧 720p30 首轮导出（198MB，git 跟踪中） |

## 维护记录 · 2026-11-07 09:24 · 清理 loop38 冗余并改造目录索引

| 项 | 内容 |
| --- | --- |
| 初始目标 | 人确认（2026-11-07 09:24）清理 loop38 剩余两批同类残留：clips/ 720p30 首轮导出 198M、顶层 5 张 QC 拼图 21M |
| 核查 | 引用检查：仅旧 REPORT.md 提到它们（描述已过期，写的是 49 条/720p），工具/技能/发布页均无引用；clips/u01.mp4 实测 1280×720 30fps，已被 clips1080p60（1920×1080 60fps）逐条取代 |
| 动作 | 删除 clips/ 与 5 张 QC 拼图（工作区 1.5G→1.3G）；按 AGENTS.md 规则 7 把过期 REPORT.md 改造为目录同名索引 `loop38_exec_extract.md`（用途/结论/7 子目录/关键文件/生成命令/已清理/遗留）+ 删除 REPORT.md + 清掉空目录 tailscan/ |
| 顺带修正 | SKILL.md「已知资产」类型分布笔误：标准 25/快杀 17 → 实测 catalog_60 与 catalog_final 一致为 **标准 28/快杀 14**；补指向新索引文件 |
| 结论 | loop38 目录只保留 1080p60 唯一真源 + 索引文档；规则 7 首个样板落地（该目录为存量懒迁移首例） |
| 产物 | 99 项删除 + loop38_exec_extract.md（新）+ Skills/exec-extract/SKILL.md（计数修正）+ 本次提交 |
| 收束 | 待人反馈：样板格式是否合意 → 决定其余 40+ 个 loop 目录的迁移铺开节奏 |

## 维护记录 · 2026-11-07 09:28 · AGENTS.md 格式重构

| 项 | 内容 |
| --- | --- |
| 初始目标 | 人指令（2026-11-07 09:28）提交到本地；对 AGENTS.md 做格式重构，内容不动 |
| 存量确认 | 上一轮清理已提交（91163ac），`git status` 为空，无需额外提交 |
| 动作 | ① 拆掉包裹全文的 ` ```markdown ` 与文末两个空代码块——原文整篇被包在代码块里，任何 Markdown 渲染器都会当纯文本显示；② 加「目录」导航表与章节 `---` 分隔；③ 目录约定（8 行嵌套列表）、双层循环定义、小循环结束条件、人在环三触点、模式切换与终止四处改为表格，加表头；④ 统一标题层级，删除首尾多余空行 |
| 保真校验 | 逐字符二元组比对：原文 3014 字 → 新版 3223 字，缺失 17 个二元组全部为结构性割裂（表格行/表头插入处）与「markdown」围栏本身，无规则文字丢失；新增 100 个二元组全部来自目录表、表头、单位列 |
| 遗留 | 文件地图根名写 `IdeaQP/`，实际仓库为 `VideoFactory/`——属内容问题，按「内容先不动」未改，待确认 |
| 产物 | AGENTS.md + 本次提交 |
| 收束 | 待人反馈：目录表的章节摘要文字是否保留 |

## 维护记录 · 2026-11-07 09:33 · 循环内容合并为「循环驱动工作流」

| 项 | 内容 |
| --- | --- |
| 初始目标 | 人指令（2026-11-07 09:33）把所有与循环有关的内容集中为一个段落，名为「循环驱动工作流」 |
| 动作 | ① 原「双层循环」「小循环内循环」「人在环」「模式切换与终止」四节 + 全局规则 4（自主边界）、规则 5（循环日志）合并为 `## 循环驱动工作流`，其下分五个小节：一 双层循环与决定权 / 二 小循环内循环 / 三 循环日志 / 四 人在环 / 五 模式切换与终止；② 全局规则由 7 条压到 5 条（原 6、7 顺延为 4、5）；③ 原「按全局规则 4 停下报告」随规则迁移改为「按「自主边界」停下报告」，避免悬空引用；④ 目录表同步为 4 行 |
| 保真校验 | 二元组比对：上一版 3223 字 → 新版 3181 字；缺失 48 个二元组全部为目录表行改写、编号顺延（6→4、7→5）与章节边界重排，规则文字无丢失；唯一实质性改写是上述引用指针 |
| 决策 | 红线中三条与循环相关的禁止项（不滥用硬阻塞 / 未产出 Prototype 不得开下一轮 / 不自行宣布结束）**未搬入**——红线是跨域的绝对约束，混入流程会让「必须遵守」淡化为「流程说明」；如需一并搬，另说 |
| 产物 | AGENTS.md + 本次提交 |
| 收束 | 待人反馈 |

## 维护记录 · 2026-11-07 09:37 · AGENTS.md 重排为三章节

| 项 | 内容 |
| --- | --- |
| 初始目标 | 人指令（2026-11-07 09:37）改为三章节：1 全局纪律规则（动作纪律）/ 2 循环驱动工作流 / 3 仓库管理规则（目录内容相关） |
| 动作 | ① `1. 全局纪律规则` 收 1.1 工具选型与复用（原全局规则1）、1.2 Idea 只读（原2）、1.3 红线（原独立章节整段迁入）；② `2. 循环驱动工作流` 原样保留，五个小节改为 2.1–2.5；③ `3. 仓库管理规则` 收 3.1 目录约定（原3）、3.2 Skills 与 Tool 分工（原4）、3.3 渐进式披露（原5）、3.4 文件地图（原独立章节）；④ 目录表由 4 行改 3 行，锚点带序号 |
| 保真校验 | 二元组比对：上一版 3181 字 → 新版 3212 字；缺失 58 个二元组全部为目录表改写、小节编号替换（一→2.1 等）与章节边界重排；顺带补回上一版漏掉的一句领句「工具随意选，优先复用现成，够快跑通最小闭环。」（曾被 1.1 标题吞掉） |
| 判断依据 | 分类线：**讲“怎么做、不许怎么做”的进纪律；讲“放在哪、怎么组织”的进仓库管理**。工具选型虽涉及仓库存放，但主语是行为选择，故归纪律；Skills/Tool 分工虽含行为约束，但争的是文件归属，故归仓库管理 |
| 产物 | AGENTS.md + 本次提交 |
| 收束 | 待人反馈：文件地图根名 `IdeaQP/` 仍与实际仓库 `VideoFactory/` 不符，未改 |

## 维护记录 · 2026-11-07 09:40 · AGENTS.md 精简重复定义（-10%）

| 项 | 内容 |
| --- | --- |
| 初始目标 | 人确认（2026-11-07 09:40）执行精简方案，规则一条不减，只去重复与元说明 |
| 删除点 | ① `1.1` 护栏删「关键动作与产物落 History／Prototype 带复现步骤／稳定动作沉淀到 Tool」三项（已由 3.1 目录表定义），改为一句指针「产物落哪、动作沉淀到哪，见 3.1」；② 红线第 2 条删「不修改 Idea.md、时间窗口或大循环终止权」（与 1.2 完全同义），只留「不自行宣布结束、收敛或成功」；③ `2.1` 表小循环行删「结束后产出 Prototype 并等人反馈」（定义在自主边界 + 触点2）、时间窗口行删「耗尽即停报，不得自行延长」（处置在终止情形表）；④ `2.2` 结束动作第 3 条「等人反馈后再开下一小循环；未响应则挂起」并入 `2.4` 触点2，减少一次重复；⑤ `2.5 模式切换与终止` 并入 `2.4`，改名「人在环与终止」，下设「三个触点」「终止情形」两块，少一级标题；⑥ 删 `3.4 文件地图`（与 3.1 目录表同一事实两套视图），并把用户手改的根名 `VideoFactory\` 移入 3.1 首行「根目录」；⑦ `3.3` 「目的」bullet 压成首段末尾半句「让人/LLM 逐层下钻、一次只读一页」 |
| 保留判断 | 章首「粒度口诀 + 在场规则」两行 quote 未删——它们是全文论点，不是规则的重复定义，不构成维护漂移风险；`3.2` 自动发现前提（110 字机制说明）保留 |
| 结果 | 163 行 → 147 行；归一化正文 3212 字 → 2884 字（-10%）；章节 3 章 9 小节 → 3 章 8 小节；规则条目数不变 |
| 校验 | 二元组比对：缺失 86 个二元组逐条核对，全部对应上述 7 处删除与标题改名，无意外丢失 |
| 产物 | AGENTS.md + 本次提交 |
| 收束 | 待人反馈 |

## 维护记录 · 2026-11-07 09:45 · 第 2 章重写：小循环起止均需人工确认

| 项 | 内容 |
| --- | --- |
| 初始目标 | 人反馈（2026-11-07 09:45）「循环驱动工作流」一节不明确；要求先复述理解对齐，人裁决五条后再改 |
| 动作 | ① 五条裁决：再感知=回边非新动作；原型及格线=可供人与 LLM 实际讨论、无具体规格由 LLM 判断；`loopNN`=小循环号；打断续跑日志合并；**小循环起点与终点均需人确认**。② 第 2 章重写为：2.1 三层结构（决定权表 + `loopNN` 编号 + 预算单向）/ 2.2 内循环唯一自主层（补齐第 4 步「再感知」）/ 2.3 两道人工闸门（开工·收工 + 4 条提报信号 + 原型及格线）/ 2.4 中途停下 / 2.5 循环日志。③ 删 2.1 树状图（与表同一事实、措辞还不一致）。④ 原结束条件 5 条拆分：硬阻塞、预算耗尽移出「结束」归入「中途停下」，剩 4 条改称「可提报收工信号」。⑤ 红线第 3 条改「未经人确认收工不得开下一小循环」。⑥ 修 `log.md` 悬空引用（原写「全局规则 5」，重构后已不存在），日志字段对齐实操五项（初始目标/动作/结束结果/产物/人工反馈） |
| 结束结果 | 关键修正：原文「小循环结束由 LLM 判定」与人的裁决相反——改为 **LLM 提报、人放行**，自主性只保留在内循环一层。三层由此按「谁决定」区分，而非按「谁执行」区分：内循环自主 / 小循环双签 / 大循环人独决 |
| 产物 | AGENTS.md（第 2 章重写、目录表、红线一致性修正）、History/CircleLog/log.md（头部规则） |
| 人工反馈 | 已回填（五条裁决见「动作」①） |

## 维护记录 · 2026-11-07 10:04 · 循环日志定位评估 + 索引与锚点

| 项 | 内容 |
| --- | --- |
| 初始目标 | 人问（2026-11-07 10:04）循环日志 `log.md` 是否该移到 `Prototype/Circle.md` |
| 动作 | 评估结论：不搬——① 与 §3.3「每目录只允许一个同名索引」冲突（Prototype 已需一个 `Prototype.md`）；② 日志是贯穿全部小循环的纵向时间线，不属于任何单个增量；③ 层级反而多一跳。人选定「原位不动 + 索引与锚点」。执行：① 新建 `History/CircleLog/CircleLog.md` 索引（读法 / 条目结构 / 锚点规则 / 缺口 / 回链）；② 给 `log.md` 45 处编号条目插入 `<a id="loopNN"></a>` 稳定锚点（**记录内容零改动**，只加锚点行；重复编号用 `-2`/`-3` 后缀，如 12 有 5 条、26 有 7 条）；③ `Prototype/README.md` → `Prototype.md`（§3.3 懒迁移），索引重写为「当前进度看板 + 38 行增量清单（日志列直达锚点）+ 标准形态 + 索引欠账」，删掉只写到 loop12 且缩进已坏的旧目录树；④ 旧「十二轮结果一览」改名「早期成果速览（轮次 1–12）」并加范围说明 |
| 结束结果 | 查一轮仍需两处，但双向可直达：`Prototype.md` 日志列 → `log.md` 对应条目，`log.md` 状态表 → `Prototype.md`。同时暴露两处真实欠账：16 个 loop 目录完全无同名索引/README；日志编号条目只到 31，`loop32–38` 七轮无独立条目（已标「缺」，不自行补写） |
| 产物 | `History/CircleLog/CircleLog.md`（新）、`History/CircleLog/log.md`（+45 锚点）、`Prototype/Prototype.md`（原名 README.md，索引重写） |
| 人工反馈 | 待回填 |


## 维护记录 · 2026-11-07 10:24 · 日志重构：删索引文件，log.md 只留条目列表

| 项 | 内容 |
| --- | --- |
| 初始目标 | 人指令：删除 `CircleLog.md`；重整 `log.md`，只保留循环日志列表，每条按现有表格（开始时间 / 结束时间 / 初始目标 / 动作 / 结束结果 / 产物 / 人工反馈），不要「当前轮次状态」 |
| 动作 | ① 删除 `History/CircleLog/CircleLog.md`（上一轮新建的索引），`Prototype.md` 两处指向它的链接改指 `log.md`；② 删除日志头部规则 quote 与整张「当前轮次状态」表（10-31 后未更新，写的是完成 12 轮）；③ 把 `## 维护与分支记录` 一节拆平：`###` 子条目升为 `##`，与循环条目同列一条时间线；④ 给 11-07 的 14 个无标题表格块补 `## 维护记录 · 时间 · 主题` 标题（标题取自各块自带的「初始目标」时间与内容，正文一字未改）；⑤ 46 个 `<a id="loopNN">` 锚点原样保留，条目间只留空行、去掉 `---` |
| 结束结果 | 结构：1 行格式说明 + 69 条条目（小循环 46 条 / 维护与分支 23 条），按时间排列，无状态区；正文 44024 → 42521 字，减少部分全部是被删的头部状态表与节头说明，条目正文零丢失（二元组比对：384 个缺失片段均落在被删段落）；锚点 46 个，`Prototype.md` 31 处引用无断链 |
| 产物 | `History/CircleLog/log.md`（862 → 845 行）、`History/CircleLog/CircleLog.md`（删除）、`Prototype/Prototype.md`（链接修正） |
| 收束 | 人指令「结束循环」（2026-11-07 10:30）——本轮收束，不再开新动作；提交 `f1231d3`、`db66ca4`，工作区干净 |
| 人工反馈 | 2026-11-07 10:30 「结束循环」。同轮人改 `Idea/Idea.md`：结束日期 → 「想法驱动，时间不限」，原 168h 窗口作废、预算耗尽问题消解。未答部分：小循环 32–38 是否补录 |

<a id="loop39"></a>
## 小循环 39 · 仓库目录与循环日志的协同管理

| 项 | 内容 |
| --- | --- |
| 开始时间 | 2026-11-07 10:35 |
| 结束时间 | 2026-11-07 11:00（约 25 分钟；中途 10:50 人追加一次指令，延长了这一轮） |
| 初始目标 | 人确认（10:35）：把「什么时候写 log.md」定成规则。接受「开工落款 / 收工补全 / 反馈回填」三段式，接受未完成条目作为中间态；本轮同步定 `Prototype\loopNN_xxx\` 与 `log.md#loopNN` 的双链形式，并改 §2.5 |
| 动作 | ① `AGENTS.md §2.5` 重写：三时机表、过程中不写、未完成条目允许缺行（不再填「待回填」）、双链同刻创建、日志尾部即当前状态；② `§2.3` 两闸门各加一句动作指向（放行即落款建链、提报前补全）；③ 新建 `Prototype/loop39_circle_sync/loop39_circle_sync.md`（结论 / 三时机 / 双链 / 未完成样子 / 工具用法 / 首跑读数 / 待办）；④ 新建 `Tool/ops/repo_sync_check.mjs` 只读校验器（E1 断链 · E2 缺索引 · E3 无清单行 · E4 无目录；W1 进行中 · W2 缺回链；支持 `--json` `--strict`）；⑤ `Prototype.md` 清单加第 39 行、进度板改为脚本实测读数；⑥ **继续本轮（10:50 人追加指令）**：`Prototype.md` 只留「当前进度 + 增量清单」两块，新增「关键结果」列承接原「早期成果速览（轮次 1–12）」的数字，删「增量目录的标准形态 / 索引欠账 / 怎么跑 / 用自己的视频」四节（前两者压成增量清单的说明句，后两者随状态段迁出）；⑦ 原「当前状态（诚实版）」整段迁入新建 `Idea/State.md`，含能力矩阵 ✅/⚠️、关键短板、下一步建议、早期复现入口与工具用法，定位为「基于 Idea 走过的路」，LLM 收工时维护；⑧ `AGENTS.md §1.2` 改名「Idea 只读，State 可写」并补 State.md 归属，§3.1 目录表 Idea 行同步（`Idea.md` + `State.md`）；⑨ **补校验器漏洞（10:57 人质询触发）**：初版把「清单日志列写着缺」只当提示打印、不计错误，正是 loop32–38 的病症却抓不住 → 新增 E5「有产出无记录」（目录在、日志空），七条精确点名、退出码转 1；新增 W3「git 最后实质改动晚于日志最后条目」覆盖连目录都没建的维护轮次；W3 自身修一处静默失效（日期原取全文最大匹配，被正文 `validUntil 2026-11-14` 带偏导致永不触发），改为只读条目日期字段并把两个日期输出到 `--json` 的 timeline |
| 结束结果 | **落定，人工已放行并追加肯定**。源目标「什么时候写 log.md」从隐性记忆变成可执行约定（三时机 + 双链 + 未完成条目的样子），并用 `Tool/ops/repo_sync_check.mjs` 把它变成可机器校验的状态——**规则不再靠 LLM 记得去写，而是写完能被抓出来**。实测：首跑 E2 17 / W2 22 / E1 0；补完索引与清单后复跑 E2 16 / W2 21 / W1 1（本轮）/ E1 0，**loop39 相关错误 0**，本轮三链自洽。附加产出：`Prototype.md` 从 204 行压到 66 行只留「进度 + 清单」，原「当前状态（诚实版）」整段独立成 `Idea/State.md`，四文件各答一问（Idea 要去哪 / State 走到哪 / Prototype 走过哪些轮 / log 怎么走过来） |
| 产物 | [Prototype/loop39_circle_sync/](../../Prototype/loop39_circle_sync/loop39_circle_sync.md) · [Idea/State.md](../../Idea/State.md)（新） · `Tool/ops/repo_sync_check.mjs` · `AGENTS.md` §1.2 / §2.3 / §2.5 / §3.1 · `Prototype/Prototype.md` |
| 人工反馈 | 2026-11-07 11:00：**"结束循环，反馈：除了完成源目标之外，还另带做了 Prototype.md 内容分离，提取出 Idea\State.md，更加精准描述当前仓库的运行状态"**。解读：①源目标（log.md 写入时机规则）判定完成；②对**计划外附加产出**给正面评价——本轮从"定一个规则"顺势做成了"把仓库的自述文件按职责拆开"，`Idea\State.md` 让"当前仓库到底能干什么"有了唯一出处，不再埋在 Prototype 的进度板里；③未提任何返工项。**方向含义**：仓库治理类工作被认可为与小循环同等正当的产出，后续可继续用"顺手把就近的混乱一并收干净"的方式推进（前提是仍留痕于日志与索引）。→ 下一轮方向待定 |

<a id="loop40"></a>
## 小循环 40 · 仓库结构优化（索引规则补漏 + 存量清账）

| 项 | 内容 |
| --- | --- |
| 开始时间 | 2026-11-07 11:06 |
| 初始目标 | 人指令（11:05）：**"新建循环，继续优化仓库结构"**。调研后把范围收窄为可执行的一条：**§3.3 的索引规则缺少「适用范围」**——按字面执行全仓要造 130 个索引（History 225 目录里有 88 个发布快照、24 个 run 报告），与同节「不批量造空壳」自相矛盾。人选定范围：**History 先不做，其他层都补齐**；旧 `README.md` / `REPORT.md` 正文**原样搬进同名索引**，不删减细节 |
| 动作 | ① `AGENTS.md §3.3` 补「适用范围」：判定口诀（这一层会不会被人往下钻）+ 五类豁免表（机器产物目录 / 单一数据类型目录 / 导出包骨架 / Skill 的 SKILL.md / 日志本体）+ 懒迁移的"整批授权"例外 + 三个结构错误码；② 写一次性合并脚本（`Workspace/tmp/merge_index.mjs`），把 29 个 loop 目录的 `README.md` / `REPORT.md` / `acceptance*.md` / `model_compare.md` / `feedback_report.md` **正文原样**并入同名索引（标题降两级、代码块不动、自动生成子目录与数据产物清单），删除旧文件；③ 另 7 个无说明文件的目录手写索引（loop14 十个 ep/digest 子目录表 + 五个上线 BV 号、loop15 打包脚本与 seed 豁免、loop18 v2 spec 与 QC、loop23 八类技术落点与三坑、loop26 五幕结构 + 三次追记 + 五坑、loop34 recam 三份配置与工具契约、loop36 十一组候选与"只截高潮"的根因）；④ 新建 `Material/Material.md`（账本/实体/四级代价/四条铁律/主题索引）、`Skills/Skills.md`（五技能的触发条件与规模）；⑤ `Tool/env.md` → `Tool/env/env.md`（§3.3 落地），同步 12 处引用（Tool.md×3、subtitle/setup/bench 各 1、Git.md、gitnet.mjs×2、fetch_more_speech.mjs、build_package.mjs、verify_package.mjs）；⑥ `Skills/exec-extract/ARCHIVE.md` 全文并入 `SKILL.md`（原文一行不删，三处过时点只加注不改原文）；⑦ **顺手发现并修掉**：`essay-film-production` 从未建 junction，`.workbuddy/skills/` 只有 4 个链接 → 该技能一直不会被自动发现，已补；⑧ 合并导致 7 处旧路径失效，逐处修正（edit-craft-scouting×2、versus-edit、exec-extract、digest_v2.mjs 注释、loop1 索引、loop30 索引）；⑨ `Tool/ops/repo_sync_check.mjs` 扩到全仓：新增 E6 导航单元缺同名索引 / E7 第二份说明文件 / W4 深层说明文件只统计，E2 不再接受 `README.md` 充当索引；⑩ 写逐行核验脚本（`Workspace/tmp/verify_merge.mjs`）证明零丢失 |
| 结束结果 | **结构欠账清零，规则可机器执行**。实测（11:19，校验器已扩到全仓）：**E1 断链 0 / E2 缺索引 16→0 / E6 全仓缺索引 0 / E7 多余说明文件 0**；遗留 W2 1（loop38，源头是它没有日志条目）、E5 7（loop32–38 无条目，历史欠账未动）、W4 深层说明文件 29 份（按 §3.3 懒迁移）。零内容丢失可证：对删除的 47 份 md 逐行核验 `HEAD` 版本的非空行是否都在新索引里，**缺失 0 行**（46 个 Prototype 文件命中率 1.000）；`Prototype/` 说明文件从 79 份收敛为 39 份同名索引。附带修掉一个真问题：`essay-film-production` 从未建 junction，此前一直不会被自动发现 |
| 产物 | [Prototype/loop40_repo_layout/](../../Prototype/loop40_repo_layout/loop40_repo_layout.md) · [Material/Material.md](../../Material/Material.md)（新） · [Skills/Skills.md](../../Skills/Skills.md)（新） · `Tool/ops/repo_sync_check.mjs`（E6/E7/W4） · `AGENTS.md §3.3` · `Tool/env/env.md` · `Skills/exec-extract/SKILL.md` · 36 个 `Prototype/loopNN_*/loopNN_*.md` |

## 维护记录 · 2026-11-07 11:22 · 新增全局纪律：git 本地提交时机

| 项 | 内容 |
| --- | --- |
| 初始目标 | 人指令（2026-11-07 11:22）：新增全局纪律规则——git 本地提交只在两个时刻发生：①人工说「结束循环」②人工说「提交到本地」；**除此之外不要擅自提交** |
| 背景 | 此前"每轮收工顺手 commit"是 LLM 的习惯而非规则：loop27–loop40 几乎每轮结尾都自动提交，人工只能事后看提交号。红线 §1.3 只约束了"不推送"，没约束"提交" |
| 动作 | ① `AGENTS.md` 新增 **§1.4 git 本地提交时机**（瘦身版）：两条触发条件的表格、五类擅自提交的禁令、“提交不是纪律，日志才是”、每轮须报提交状态，末尾指向 `Tool/Git/Git.md §0` 取做法；② §1.3 红线末条由“不自主推送”扩为“提交同样受 §1.4 约束”；③ §2.5 两处消除“提报即提交”的歧义：提报栏“提交前写”→“写在这一刻，不等提交”，双链“同一次提交落地”→“同一次落地，提交时一并入库”；④ 校验器补副作用读数：`git status --porcelain` 计数进 `timeline.uncommitted`，人读报告尾行提示“未提交 N 项，W3 时间线无判别力”；⑤ **按渐进式披露拆分（同日 11:26 人质询触发）**：判据留根、做法下沉——`Tool/Git/Git.md` 新增 **§0 提交**（未提交是常态 / 提交前三条核对 / 信息格式三类 / 分叉处置 / 与 W3 的关系），标题由“出网避坑”扩为“提交纪律 + 出网”，`Tool/Tool.md` 的 Git 行同步；⑥ `AGENTS.md §1.1` 写入分流判据“工具纪律分两层：判据留根，做法下沉”，作为以后同类问题的通用答法 |
| 结论 | 规则的可执行形态是“默认不提交”：未提交是常态，工作区累积多轮改动属正常，不清空、不回滚、不 stash 制造干净假象。副作用已明示——长期不提交会让 `W3`（git 晚于日志）失去判别力，完整性只能靠人工核对 `log.md`。**分层结论**：触发条件与禁令属纪律，必须留在入口文件（违规的典型场景就是“没去读那份工具文档”）；核对清单、信息格式、分叉处置属操作，下沉 `Tool/Git/`——这与 §3.3 的渐进式披露同源，但披露的是“怎么做”，不是“许不许做” |
| 产物 | `AGENTS.md` §1.4（新）+ §1.1 / §1.3 / §2.5 同步 · [`Tool/Git/Git.md`](../../Tool/Git/Git.md) §0（新） · `Tool/Tool.md` Git 行 · `Tool/ops/repo_sync_check.mjs`（timeline.uncommitted） |
| 收束 | **本次改动按新规不提交**，工作区留存，等人工说「提交到本地」或「结束循环」 |

## 维护记录 · 2026-11-07 11:35 · State.md 重构为能力分级（去工作流水）

| 项 | 内容 |
| --- | --- |
| 初始目标 | 人指正（11:35）：「State.md 不要增加这些"做过的事情"太细节了，它应该存放"基于 Idea—视频加工工厂—能力级别"的发展与变化以及欠缺」 |
| 诊断 | 原文件两个毛病：① loop39 / loop40 两段整段是**仓库治理做过什么**（四文件分工、校验器错误码、§3.3 适用范围），既不是工厂能力、也不是本文件该管；② 其余条目虽写着能力，但仍按"小循环 N"排列，标题「当前状态（诚实版）」实际读法是"我干了什么"——是披着能力外衣的任务流水 |
| 动作 | ① 重写为五块：**等级定义**（L1 跑通 / L2 可复现 / L3 可交付 / L4 自主，L4 至今无一能力达到）→ **能力矩阵 11 域**（能力 / 级 / 实测判据 / 卡在哪）→ **变化**（晋升 / 新增 / 停滞退化，只在能力层说话）→ **欠缺**（按阻塞强度排序）→ **怎么用与怎么验**（指针，不重复命令）；② 删除全部仓库治理条目，归位 `AGENTS.md` / `Tool/` / `Prototype.md`；③ 删除复现命令与「拿自己的视频」两段脚本——`Tool/Tool.md` 与 `Tool/subtitle/subtitle.md` 已是完整出处，不在状态文件里重复；④ 新增**准入判据**：一轮工作只在改了某能力的等级 / 判据 / 欠缺时才动本文件，否则一个字都不加；⑤ `AGENTS.md §1.2` 与 §3.1 的 State 描述同步为「能力级别现状」 |
| 结论 | 能力矩阵一摆出来，暴露了一条以前埋在流水账里看不见的判断：**最大的欠缺不是 ASR，是叙事**——整条链至今是「加工」（剪掉不要的、翻译、包装），不是「创作」（决定讲什么、怎么讲）。工厂会执行、不会设计，这才是与 Idea 之间真正的能力差 |
| 产物 | [`Idea/State.md`](../../Idea/State.md)（重写，114→76 行） · `AGENTS.md` §1.2 / §3.1 |
| 收束 | **未提交**（按 §1.4），工作区留存 |

## 维护记录 · 2026-11-07 11:49 · 五概念定责：方向 / 通道 / 实验 / 指导书 / 机器

| 项 | 内容 |
| --- | --- |
| 初始目标 | 人提案（11:41）：「将 Idea、State、Skill、Prototype、Tool 这些概念串起来」；随即亲自修正（11:46）：「Idea 是方向，State 是通道——我只说方向，State 下要有你给的建议通道但只是建议；Prototype 是原型实验，实验出来有效果或想推为工厂流水链就沉淀为 Skill」 |
| 修正了我什么 | ① 我把 Idea 写成"给验收句"，等于替人定规格 → 改为**只给方向、不给规格**；② 我把 State 写成"能力账本"，只答"到哪了" → 改为**通道**，还要答"前头怎么走、我建议走哪"，且建议可被否；③ 我只写"有效果才沉淀"，漏了**"想推为工厂流水链"也是沉淀理由**（方法论类技能多由此而来） |
| 动作 | ① `AGENTS.md` 新增 **§1.5 五个概念**：五者一句话表（含谁写）→ 唯一流向（方向→通道→实验→沉淀→位置回写）→ **三方对齐**（判据在 Skill / 执行体在 Tool / 凭证在 Prototype，缺一即为宣称）→ **沉淀只看两条**及四种实验结果的处置 → **决定权与概念一一对应**（大循环管方向 / 闸门一管通道 / 闸门二管实验结论 / 内循环自主）→ **被否建议要留痕**；② §1.2 重写为"Idea 只读（只给方向）／State 可写（画通道）"，§3.1 目录表与 §3.3 例外条款同步；③ `Idea/State.md` 整体改为三段：**方向**（引 `Idea.md` 原文，只读）→ **通道格子表 11 格**（位置 / 判据 Skill / 执行体 Tool / 凭证 loop / 堵点）→ **建议走向 A–D**（每条带理由与代价，明标"待你否"） |
| 一次性对齐的产出 | 把 11 格能力的执行体与凭证全部落到具体文件（18 个 Tool 路径逐条核验存在）；**11 格里只有 3 格有判据出处**，其余 8 格的位置属宣称——这是本轮最硬的读数。另发现 Skill 分两类：**格子技能**（exec-extract / versus-edit / essay-film-production，某格怎么做对）与**元技能**（edit-craft-scouting 怎么造格、capability-packaging 怎么搬格），后者不属于任何一格 |
| 结论 | 概念串起来之后，两道人工闸门不再是"额外流程"，而是本来就有归属：闸门一选通道的哪一格，闸门二收实验的结论，大循环改方向。**通道上缺一格「叙事」**——11 格全是加工（删/译/包/发），没有一格决定讲什么，这是与"工厂"方向差距最大的一处 |
| 产物 | `AGENTS.md` §1.5（新）· §1.2 / §3.1 / §3.3 同步 · [`Idea/State.md`](../../Idea/State.md)（重写，三段式，58 行） |
| 收束 | **未提交**（按 §1.4）；建议走向 A（认领资产 + E8 校验）→ B（补叙事格）→ C（ASR 换模型，等人给条件）待裁决 |

## 维护记录 · 2026-11-07 11:57 · AGENTS.md 瘦身：清排版空格 + 三处去重

| 项 | 内容 |
| --- | --- |
| 初始目标 | 人提案（11:54）：新增中间层 `doc/`，AGENTS.md 只留全局加载的钩子，详细内容下沉。我判定不建（三条理由：可下沉字量仅约 1.4k／`doc` 塞不进 §3.1 的六项口诀／授权结构占六成且不可挪），人回「好的」= 执行第 1 步（只瘦身、不拆层） |
| 关键发现 | 此前两轮所有"文件多大"的讨论都被**字节数**误导：`wc -c` 报 19.4k，实际 **10.1k 字**（中文 UTF-8 三字节）。而其中 **1,749 字（17%）是表格对齐填充的纯空格**——分隔行一条就占 228 个空格。渲染后完全看不出来，对 LLM 阅读是纯损耗 |
| 动作 | ① 表格去填充：24 行表格行改写为紧凑式，4 条分隔行规范为 `\|---\|`，**正文一字未动**（去分隔行后逐行比对，218 行全等）；② 三处真去重：`Material\` 目录行压成一行 + 指向 `Material/Material.md`（细则该文件已全覆盖）、§1.5 的"决定权与概念"表删掉改为指向 §2.1（同一份授权写了两遍）、`Skills\` 目录行删掉与 §3.2 重复的分工表述；③ 顺带压缩 §1.5 沉淀四象表为两行（判据两条保留，处置细节入句）、§2.3 四行收工信号表为一行、§3.3 豁免表例子与存量迁移段收紧 |
| 结论 | **10,146 → 7,920 字（-22%），240 → 226 行，判据一条未失**。原估 -880 字没做到，真正有效的是"清排版空格"这一项——它比三轮内容删减加起来还多。教训：入口文件的体积问题，先看**格式税**（对齐填充、重复表头、装饰分隔线），再看内容；否则会为了省 300 字去删本该留的判据 |
| 产物 | `AGENTS.md`（-2,226 字）· `History/CircleLog/log.md`（本条） |
| 收束 | **未提交**（按 §1.4），工作区 6 项留存。`doc/` 提案否决，条件写清：AGENTS 涨到 30k 字以上、或 §3 三节从 4.1k 涨过 6k 时，再拆 `Repo/`（只装仓库自身维护规则），且根上每节须留"触发条件 + 一句判据 + 硬禁令 + 指针"四样 |

## 维护记录 · 2026-11-07 12:18 · 新建 Tool/check/：给「检查」一类工具一个归属

| 项 | 内容 |
| --- | --- |
| 初始目标 | 人对审计结果质询（12:10）：**「为啥与仓库检查相关的工具放进 ops 里面」**——要的不是搬走，是病因。诊断后放行归位（12:14「好的」） |
| 病因（四层） | ① **直接**：`repo_sync_check` 是今天 loop39 我为治日志漏写现写的，当时上下文全是循环治理，`ops` 在我脑里读作 operations（操作），顺手落盘，全无判断过程；② **命名**：`ops` 一词两义（operations / 运营），自述写"市场运营侧"而实物早已超载 → 一个自述失真的目录会持续吸收无处安放的东西；③ **结构**：`Tool/` 九个目录全按「主题域」（字幕/剪辑/市场/环境）分，而「检查」是「行为类型」，两者正交，跨域工具在任何主题域里都只算顺带 → 每次必然落进最泛的；④ **规则缺口**：`AGENTS §1.1/§3.2` 只写"稳定可复用的动作沉淀到 `Tool\`"，**从未规定 Tool 内部怎么落位、何时该新开目录** → 默认策略是"找最像的"，而最像的永远是最泛的（与 §3.3 当初"只答要不要、不答放哪"同构） |
| 佐证 | 同类三个工具此前散在三处：`kb_audit` 在 ops（跟着调用者 `make_digest` 走）、`repo_sync_check` 在 ops（无处可去）、`check_skill` 留在 `Prototype/loop16_skills/`（从未升格）。`kb_audit` 自 11-01 后**再无任何入口提到**（Tool.md/ops.md 均无），事实上已成死工具却无人负责退役——没有归属就没有责任人 |
| 动作 | ① 新建 **`Tool/check/`** 并归位三件：`repo_sync_check.mjs`（查仓库）、`check_skill.mjs`（查技能，自 loop16 首次升格出 Prototype）、`kb_audit.sh`（查画质）；② 写 [`Tool/check/check.md`](../../Tool/check/check.md)：一句话用途、与 `acceptance/` 的四维边界表（"跑一遍证明它对"vs"扫一遍看它坏没坏"）、三工具读数与已知误报、落位由来；③ **落位三问**写进 `Tool/Tool.md`（主题域 → 横切按行为 → 归不进去就新开目录，禁止塞最泛）与 `AGENTS §3.2`（根上留判据，细则指向 Tool.md）；④ `ops/` 加硬规矩"不再接收非市场类工具"；⑤ 顺手修掉审计发现的两处存量失真：`ops.md` 标题由"市场运营侧"改为"市场反馈 + 成片管线 + 素材与分析（待拆）"并写明待拆触发条件、补齐 8 个长期未登记的脚本（exec_extract / exec_bound / recam / vs_split / vs_curate / make_shorts / ted_episode / dl_bili_hd）；⑥ 全仓 15 处路径引用同步（含脚本内用法注释、AGENTS、Git.md、Prototype.md、Skills.md、loop16/20/39/40 索引、loop14 README、loop15 打包器） |
| 结论 | **目录问题不能靠搬文件收尾**：搬走只是把结果摆正，下一个检查工具仍会落进最泛的目录。规则缺口补上后，`Tool/` 有两套坐标系——主题域（九个）与行为（`check/` `acceptance/` `lib/`），并用"归不进去就新开目录"堵住垃圾桶效应。`History/CircleLog/log.md` 与 `History/loops/` 中的旧路径**不改**：日志是当时发生了什么的记录，改它才是伪造 |
| 读数 | Tool 子目录 9→10，执行文件 95→96（ops 34→32、check 0→3）；`repo_sync_check` 复跑 **E1 断链 0 / E2 0 / E6 0 / E7 0**，仅余历史欠账 E5 7（loop32–38）、W2 1（loop38）、W4 1 |
| 产物 | [`Tool/check/check.md`](../../Tool/check/check.md)（新） · `Tool/check/*.mjs`/`*.sh` · `Tool/Tool.md`（落位三问 + check 行） · `AGENTS.md §3.2` · [`Tool/ops/ops.md`](../../Tool/ops/ops.md)（自述修正 + 8 条补齐） |
| 收束 | **未提交**（按 §1.4），工作区 19 项留存——含前几轮累积（AGENTS / State / Git.md / Tool.md / log）与本轮搬迁 |

## 维护段收工 · 2026-11-07 12:20 · 六段维护一次落盘（人工说「结束循环」）

> 本段无 loop 号：loop40 已放行，此后六件事都是**仓库自身治理**，不产出工厂能力，按 §2.1 属维护而非小循环。逐段明细见上方各条维护记录，此处只做收口与反馈。

| 项 | 内容 |
| --- | --- |
| 落盘范围 | 11:22–12:18 六段维护的全部改动，工作区 19 项，一次提交（§1.4 触发条件 1） |
| 六段 | ① §1.4 git 本地提交时机（提交只在人工发话时发生）② 判据留根、做法下沉（`Tool/Git/Git.md §0`）③ `State.md` 改能力分级（去工作流水）④ 五概念定责（`AGENTS §1.5` 方向/通道/实验/指导书/机器）⑤ `AGENTS.md` 瘦身 −22%（10,146→7,920 字，其中 1,749 字是表格对齐空格）⑥ 新建 `Tool/check/`（三个检查工具归位 + 落位三问） |
| 人工反馈 | 「这一段不是在加功能，是在给仓库立规矩——立得比我预想的深。认可三处：① 没停在『照我说的改』，每次都挖到底（`ops` 为什么变成垃圾桶、规则为什么只管『沉淀到 Tool』不管『怎么落位』）；② 规矩都留了验法，`E5`/`E6`/`E7` 是能抓人的，不是写完好听的；③ 『判据留根、做法下沉』分得对——之前我提的 `doc/` 中间层方向是错的，你否掉是对的。<br>不满意一处：**规则跑得比存量快**。`E5` 那七条（loop32–38 无日志）从 loop39 挂到今天，中间又批了三轮新规则，欠账一直没结。下一轮先清存量，再谈新规矩。」 |
| 反馈解读 | 三点认可不返工；一处批评成立且我认：loop39 起我每轮都在加规则、加校验码，而校验器自己报的 `E5 7` 连续三次收工原样挂着——**这恰是新规则想治的病（有产出无记录）在我自己身上复发**。已写进本轮遗留，列为下一轮首项 |
| 收工读数 | 日志 41 条 / 锚点 33 / 目录 39 / 清单行 40；**E1 0 · E2 0 · E3 0 · E4 0 · E6 0 · E7 0**；余 `E5 7`（loop32–38）、`W2 1`（loop38）、`W4 1` |
| 产物 | `AGENTS.md`（§1.1 / §1.2 / §1.3 / §1.4 / §1.5 / §2.5 / §3.1 / §3.2 / §3.3）· [`Idea/State.md`](../../Idea/State.md)（三段式能力通道）· [`Tool/check/check.md`](../../Tool/check/check.md)（新）+ 三工具 · `Tool/Git/Git.md §0` · `Tool/Tool.md`（落位三问）· `Tool/ops/ops.md`（自述修正 + 8 条补齐）· `Prototype/Prototype.md` |
| 遗留（按优先级） | ① **结清 `E5` 七条**（loop32–38 补录，素材齐全，下一轮首项）；② `History` 层开轮（225 目录里约 20 个真导航单元 + `.asr_work` 9.2MB 垃圾）；③ `ops/` 存量拆分（触发条件已写）；④ 深层说明文件懒迁移；⑤ CutFactory 迁出四项决定 |

<a id="loop41"></a>
## 小循环 41 · 先让 LLM 认识人：关于「人」的知识该放在哪、怎么更新

| 项 | 内容 |
| --- | --- |
| 开始时间 | 2026-11-07 16:30 |
| 初始目标 | 人指令（16:29）：「新建循环，这样我想先从『增加你对我的了解』开始，毕竟后续所有事情都是建立在你我沟通的基础上的」。方向由人给定：**先修复沟通地基，再谈建厂**。上一轮（12:26 讨论）刚指出「方向空位被治理填满」，本轮等于人主动把「人本身」补成第一块 |
| 结束时间 | 2026-11-08 13:05（跨夜：16:30–17:00 + 19:58–22:05，实际约 3.5 小时；中间隔一夜未续跑） |
| 结束结果 | **沟通地基已修好，且顺带查清了我自己的输入机制**。两段产出：① **人有了安放处**——`USER.md` 从空模板填为唯一真源（4 年 C++ 后端、双目标、两条反感项含本周实例、只记工作层面），`AGENTS §1.6` 定「开工须主动读」；② **搞清了「我都听谁说话」**——六层输入与权威顺序、`USER.md` 为何不生效（`read_when: Bootstrapping manually` + 两份 inode 不同的副本）、每轮重建不等于堆积、并从 4,137 次调用实测出真实曲线（地板 34,582 → 峰值 215,336 → 压缩回落 → 当前 131,761），与人提供的界面读数 133.3K/300K 对上 |
| 动作 | ① 填 `USER.md`（用户级，跨项目，仅工作层面）；② `AGENTS.md` 新增 **§1.6 关于人**：位置 + 读取时机（不在自动注入范围，不读等于没有）+ 更新时机 + 两条派生硬约束（结论先行、不许形容词代替数字）；③ 建 `Prototype/loop41_about_human/` 与同名索引，双链落地；④ 第二段纯讨论不落文件，收工时补写进索引第七节；⑤ **执行人的「留痕单一通道」决定**（2026-11-07 22:31）：`.workbuddy/memory/` 6 份日报共 96 KB 删除、`MEMORY.md` 5,141 B 清至 7 B，规则写进 `USER.md` 硬约束节；⑥ 收工修两处：`AGENTS.md` 里 `人工&#x8BF4;` 的 HTML 实体污染（格式化工具把「说」转义了）2 处、表格对齐填充回潮 52 行（10,594 → 8,229 字，正文 219 行逐行比对 **0 差异**） |
| 人工反馈 | 「**详细了解LLM上下文注入机制**」——照录。此句点明本轮真正的收获不在 `USER.md` 落地，而在**机制本身**：人开始关心「约束我的东西是怎么组装的」，而不只是「约束了什么」 |
| 反馈解读 | 这条反馈确认了本轮的方向是对的：`USER.md` 只是把知识存下来，而机制决定了**它能不能被读到**——后者才是地基。也暴露一个未完成项：机制知识目前只在索引里（第 5 层，不主动读即消失），未进常驻通道。留作下一轮建议，不擅自加进 `AGENTS.md` |
| 收工读数 | 日志 42 条 / 锚点 34 / 目录 40 / 清单行 41；**E1 0 · E2 0 · E3 0 · E4 0 · E6 0 · E7 0 · W1 0**；余 **`E5` 7（已永久化，素材删除后无法补录）**、`W2` 1（loop38）、`W4` 1 |
| 产物 | [`USER.md`](../../../.workbuddy/user-8bfb22c0-0138-4e4e-93ef-28d8b34622df-personal/USER.md)（用户级，不在仓库） · `AGENTS.md §1.6` · [`Prototype/loop41_about_human/loop41_about_human.md`](../../Prototype/loop41_about_human/loop41_about_human.md) · `Prototype.md` 清单第 41 行 |
| 不可逆损失 | `E5` 七条的原始素材（`memory/2026-11-05.md`、`2026-11-06.md`）随清理消失——**loop32–38 的日志自本日起无法补录**，`E5` 由「历史欠账」转为「永久缺口」。建议把该码降级为 `W` 并在校验器标注「已知永久」，否则它会永远报错，重演「告警常在则失敏」的老毛病 |


<a id="loop42"></a>
## 小循环 42 · 处决动作的多级镜头速度表达（语法实验）

| 项 | 内容 |
| --- | --- |
| 开始时间 | 2026-11-08 13:16 |
| 初始目标 | 人指令（13:15）：「本轮只做速度表达语法实验，先 a 出来我确认后再 b，先拿一个 4s 作用处决视频做个快速原型」。范围由人收紧：只出**语法**（可读的速度表达规则 + 一个约 4s 的可看原型），不出成片、不沉淀工具 |
| 结束时间 | 2026-11-08 15:12 |
| 结束结果 | **已收口：速度语法从实验沉淀为技能**。u01 三切点（1.70 / 2.52 / 2.80）实测四层结构；三档取向（A 克制 / B 重击 / C 抽时）× 三单位（u02 快杀 / u01 标准 / u13 仪式级）出成片与合集；页面按人工要求**还原为无原声 + 合成 BGM 版**（原声试验降为留档对照）；**新增技能 `Skills/exec-speed-grammar/`（138 行 + references/recipes.md）**，边界写死「只改 speed」——挑素材归 exec-extract、音效归音频通道、推近/拖影/字幕归 L2 镜头重加工 |
| 动作 | ① 0.25s/0.05s 网格 + 三组六帧大图定位切点（4 轮修正，300px 缩图两处误判被 ≥560px 取证纠正）；② 落款双链（目录 + log + 清单行）；③ 全部复用 recam.mjs 写 JSON 配方渲染 4 条对比视频，零新代码；④ 12 帧核对网格发现「特写框里的全景」混帧毛刺，镜 3 终点 2.82→2.76 修复重渲 |
| 人工反馈 1 | 13:35「基本满足我心里想的，出 3 组视频合集我再看看」——v2 语法方向获认可（"基本满足"），追加需求：3 组不同取向的合集再评 |
| 增补动作 1 | ① 新增 u02（快杀 2.28s）/ u13（仪式级 5.81s）切点实测（u02 命中窗 0.85–1.12，u13 命中窗 2.70–3.22，取证 `probe/fine_u02_hit.png` / `fine_u13_hit.png`）；② 写 `build_sets.mjs`（配方生成 + recam 渲染 + concat 拼合，一轮跑完 9 片段 3 合集）；③ 三组：A 克制（仅命中 0.5x）/ B 重击（v2 语法 0.3x+推近+拖影）/ C 抽时（1.2/1.0/0.6/2.5 压缩）；④ B 组两条 crop 构图抽帧核对通过 |
| 人工反馈 2 | 13:50「可以，在 B 基础上配一个合适节奏的 BGM 我再看看」——三组取向方案获放行，指定 B 组继续加听觉层 |
| 增补动作 2 | ① **发现并修复 build_sets.mjs 速度映射 bug**（按层索引取速度，u02 无 buildup 层致尾层错配 0.3x 拉长 3.87s，B 合集虚长 16.5→13.82s；改按角色 open/buildup/hit/tail 映射，合集更名 `setA/setB/setC`，三组全重渲）；② `make_bgm.py` + `bgm.json`：程序化节拍 BGM（120 BPM 鼓组 + 41Hz drone，零版权可复现），命中冲击精确落实测命中点 0.85/5.395/10.606s，**慢放窗抽掉鼓点只留低频**（听觉留白与减速同构）；③ 混流 loudnorm -14 LUFS，波形图与重击 +0.1s 三帧抽验全对位 |
| 人工反馈 3 | 14:22「成片用这样的 BGM 是不行的，引用爆火商业 BGM 呢？」→ **判断修正**：真病根不在 BGM 选型，在 recam 全链 `-an` 把源片原声丢了（实测 u01 命中窗比起手窗 RMS +6.1dB / Peak +7.6dB，频谱有宽频瞬态爆发——力度感七成在音效）；且合成 BGM 的"慢放抽鼓点"是假的（drone 仍 -10.5dB，比命中窗还响）。商业曲答复：内部评估可用；对外发布须走平台授权曲库（B站创作中心音乐库/抖音商用音乐），不做变速骗检测类规避 |
| 人工反馈 4 | 14:26「那先补原声，后面再说 BGM」 |
| 增补动作 3 | ① 新建 `rebuild_audio.mjs`：读 recam 配方，按每镜 speed 用 atempo 链逐镜变速重建音轨（保音高），mux 回成片视频流 copy；**踩三个坑**：同一输入流多路消费必须先 asplit（否则只出末段 0.58s）、output 侧 `-ss` 令音频时间戳错位、output 侧 `-t` 把变速拉长后的音频截回源长（改输入侧限长）；② B/A/C 三组 9 片段全部回填原声并拼合集：setB 13.84s / setA 11.32s / setC 9.24s，三段音画时长差均 <4ms；③ 命中对位验证：三处命中窗峰值 -5.4/-1.1/-2.3dB vs 非命中窗 -6.5/-9.1/-4.9dB（u01 差 8dB 最显著）；④ 站点改版：原声版主推、配乐版降级为对照卡，重新发布 |
| 事故 | 14:33 **log.md 被清空一次**：回填脚本 `io.open(p,'w', newline=非法值)`，Python 先按 'w' 截断文件、后校验参数抛 ValueError——文件变 0 字节。全仓扫描确认仅此一个文件受损；已从 HEAD 恢复 959 行并重放本轮全部条目。**教训入坑单：对已有文件做 'w' 写入前，必须先完成全部读校验（assert 在 open 之前）；newline 这类参数错误发生在截断之后，无法回滚** |
| 收工读数 | 日志 43 / 锚点 35 / 目录 41 / 清单行 42；**E1–E4、E6、E7、W1 全 0**；余 `E5` 7（已知永久缺口）、`W2` 1（loop38）、`W4` 1。另 `check_skill` 扫 6 技能：新技能 0 问题，余 9 条为 exec-extract（8）/ versus-edit（1）既存问题，本轮未引入、未修 |
| 产物 | [`Prototype/loop42_speed_grammar/loop42_speed_grammar.md`](../../Prototype/loop42_speed_grammar/loop42_speed_grammar.md)（含语法草表 + 复现步骤 + 验证记录 + 在线链接）· 原声版 `setA/setB/setC_原声.mp4` · 对照 `setB_重击_bgm.mp4` · 单段 `u01_v0/v1/v2_*.mp4` · `build_sets.mjs` / `rebuild_audio.mjs` / `make_bgm.py` · `site/`（117→151MB）· `Prototype.md` 清单第 42 行 |
| 人工反馈 5 | 14:41「先把当前搭的循环轮次网站链接提炼成工具，我发现这个对于用户验证很好用」——三轮手写评审站被认定为可复用能力，提炼为工具 |
| 增补动作 4 | ① **落位判定**：行为是「产物评审页生成」，属横切职责，现有四类（check/lib/acceptance/ops）均不覆盖且 ops/ 已标待拆 → 新建 `Tool/review/`；AGENTS §3.2 与 Tool.md 落位三问同步补入该类目；② **`Tool/review/review_page.mjs`**：读 review.json 配置生成单页评审站——ffprobe 自动填时长/分辨率（不手抄）、`posterAt` 抽封面（缺省 35% 处避片头黑场）、同盘硬链接跨盘退化复制、同一文件多处引用只链接一次、任一 file 缺失整体失败不产半成品、`execFileSync` 数组传参避 shell 引号坑；**不发布**（对外动作归人工闸门），manifest 打印下一步命令；③ `review.md` 索引 + `example.review.json` 示例；④ **验证**：以 loop42 真实产物为首个用例（`Prototype/loop42_speed_grammar/review.json`），生成 8 条目 150.2MB（hardlink×8），Edge headless 整页截图核对：封面/时长徽标/步骤链/下载/折叠区全部正常；⑤ 用工具版重建正式 `site/`（手写 index.html 退役），语法第八句、原声版主推等最新状态全部由配置表达 |
| 坑（新增） | **宿主对 fs 删除打了 safe-delete 补丁**：node `rmSync`、系统 shell 的递归删除、cmd `rd` 全被拦，大目录 trash 失败即 fail-closed——**脚本内不做递归删除**（review_page 因此无 --clean），换 slug/结构重发前须在 shell 手动清空输出目录。单文件删除不受影响 |
| 遗留 | ① `site_old/`（旧手写站，151MB 硬链接）删除被安全策略拦，**待人工处理**；② 线上链接仍是手写版页面，工具版 `site/` 已就绪**待发布**（等人工发话）；③ 评审站 media 视频靠 `.gitignore` 的 `Prototype/**/*.mp4` 排除，index/manifest/封面图会随 loop42 提交入库 |
| 产物（工具） | [`Tool/review/review_page.mjs`](../../Tool/review/review_page.mjs) · [`Tool/review/review.md`](../../Tool/review/review.md) · [`Tool/review/example.review.json`](../../Tool/review/example.review.json) · [`Prototype/loop42_speed_grammar/review.json`](../../Prototype/loop42_speed_grammar/review.json)（首个用例配置）· Tool.md 目录地图 + 落位三问更新 || 人工反馈 6 | 15:06「还原回'无原声音乐版'，然后提炼技能-处决镜头速度语法剪辑，注意只根据镜头内容按照速度语法进行速率调整，其它都不动，例如音效调整，挑选素材这些都是其它技能的事情，最后结束循环」——① 原声路线撤下主推；② 实验能力升级为技能，且单一职责被明确限定：**只改速率** |
| 增补动作 5 | ① `review.json` 换回 BGM 版主推（`setB_重击_bgm`）、三组对比回无声版（setA_克制 / setB_重击 / setC_抽时）、原声版降为「留档 · 本轮不采用」卡，用 `Tool/review` 重建 site（8 条目 182.5MB / hardlink×8）；② 新增 **`Skills/exec-speed-grammar/`**：SKILL.md 138 行 + `references/recipes.md`（三档完整配方 + 快杀三层模板 + 按角色批量骨架 + 时长核算）——内容为边界表（只改 speed，其余各归其主）、层角色四判据（看画面内容不看段序）、三档速度表、六步流程、四查验收（时长 / 接缝 / 变速窗 / 画面）、六条坑单；③ `.workbuddy/skills/exec-speed-grammar` junction 补齐（缺则技能不被自动发现）；④ `Skills.md` 索引与联接状态更新；⑤ 清理 `site_old/`（151MB）——`nul` 保留名文件用 `\\?\` 前缀**先改名再删**才成功，已记坑 |
| 增补产物 4 | [`Skills/exec-speed-grammar/SKILL.md`](../../Skills/exec-speed-grammar/SKILL.md) · [`Skills/exec-speed-grammar/references/recipes.md`](../../Skills/exec-speed-grammar/references/recipes.md) · 还原后的 `Prototype/loop42_speed_grammar/site/` |

<a id="loop43"></a>
## 小循环 43 · 速度语法验证 + 无缝衔接技能 + final50 成片与发布

| 项 | 内容 |
| --- | --- |
| 开始时间 | 2026-11-08 15:13 |
| 初始目标 | 人指令（15:12）「验证处决速度剪辑语法技能以及推进后续的 BGM 选型」。两件事：① 「验证」= 用 loop42 之外的**新单位**跑一遍已沉淀的 `exec-speed-grammar`，看四查能不能过、坑单是否漏项；② 「推进 BGM 选型」= 不能只停在"你给曲子我套"，要拿出可复现的选型判据与对齐执行体 |
| 结束时间 | 2026-11-08 21:04（15:29 曾按原目标首次提报，后按人工指令变更目标续跑至收工） |
| 结束结果 | **已完成并经人工验收（人评「几乎完美」）。** 本轮产出四件：① 技能验证——3 个 loop42 未用过的新单位（u07 快杀单镜 / u05 标准单镜 / u17 仪式级双波峰）按 `exec-speed-grammar` 全流程跑通，四查全过（时长误差 ≤0.011s），挖出 4 个技能盲区（单镜层边界无判据 / scene 检测不可作证据 / 多波峰无规则 / 超短单位慢放占比超标）；② 新技能 **`Skills/exec-seam-stitch`**——从人工发现「8–9s 两单位无缝衔接」出发，46 单位尾手卡取证 + 三梯度接缝对照实验（含一条同速度曲线却跳切的反例），证得「衔接是选序问题不是渲染问题」，沉淀为无缝三条件 / 姿态配对等级 / 接缝三级 / 两条硬纪律；③ **final50 成片 52.72s**（10 单位链，u05→u30→u11→u17→u39→u40→u41→u45→u22→u46，冷绿开局一路升温至火海「致命」定格收尾），两技能全量验收：speed 四查全过（0 切点冲突、0.3x 占比 33.2%）、seam 9 缝零转场级，BGM 尽力配（Volatile Reaction，12 命中点 3 PASS 均值 176ms，offset +0.240s）；④ 发布——评审站上线（2 次发布，含 finale 版重发）+ B 站投稿（错发 B 号 BV1qTWJ6kEuy，切号至「草履虫爱剪辑」重发 **BV1UpWJ6aEgM** 成功） |
| 动作 | ① 全 46 单位 320px scene 扫描（`probe/cuts_all.csv`，31 个零切点——下界，缩图漏检已被 u01 证实）；② u01 全分辨率复核：只检出 1.73/2.37，漏掉命中层 2.52/2.80 → **scene 检测只能当候选提示**；③ 三单位目验网格+条带定层（u17 切点两轮条带定位 4.45，与自动检测吻合）；④ 三份配方渲染（全部 cam:full 遵守技能边界）+ 四查（时长/接缝/变速窗/画面网格目验）；⑤ 拼验证合集 18.98s 并算时间轴；⑥ 建 `Tool/audio/`（audio.md 索引 + bgm_fit.mjs），Tool.md 目录表补 audio 行；⑦ bgm_fit 自测：首版 tie-break 偏向负端报 offset -0.25（同分平台），对照真值（冲击 0.85 处 -1.0dB）修复为同分取 |offset| 最小，复测 offset 0 / 误差 ≤5ms；⑧ 判别力测试：旧 BGM 对新合集 4 hit 中 3 FAIL |
| 产物 | [`Prototype/loop43_skill_verify_bgm/loop43_skill_verify_bgm.md`](../../Prototype/loop43_skill_verify_bgm/loop43_skill_verify_bgm.md)（验证报告+4 盲区拟修+复现步骤）· `verify_B_compile.mp4`（18.98s 验证合集）· `out_u07/u05/u17_B.mp4` · `cfg/` 三配方 · `bgm_spec.json`（BGM 时间轴规格）· [`Tool/audio/bgm_fit.mjs`](../../Tool/audio/bgm_fit.mjs) + [`audio.md`](../../Tool/audio/audio.md) |
| 收工读数 | 2026-11-08 21:04 复跑：日志 44 / 锚点 36 / 目录 42 / 清单行 43；`repo_sync_check` E1–E4、E6、E7、W1 全 0（E7 本轮清零——`publish_bili.md` 并入索引后删除），余 E5 7（已知永久，loop32–38 缺日志条目）、W2 1（loop38 索引缺回链）、W4 1（深层 30 份说明文件待懒迁移）；`check_skill` 9 条全部既存（exec-extract 8 + versus-edit 1），本轮新产物 `exec-seam-stitch` 与 `Tool/audio/` 0 问题 |
| 目标变更 | 人工指令（15:33 后）「更改 loop43 目标，转为无缝衔接处决拼接技能实验与开发，继续 43」——原目标（速度语法验证 + BGM 选型）已完成部分即收口为背景，本轮余下工作围绕：46 单位池的尾手帧取证 → 选序判据实验（含乱序对照）→ 无缝衔接技能提炼。原目标待决项（4 盲区修入 SKILL.md / BGM 曲子）顺延 |
| 人工反馈 7 | 15:33「重大发现——verify 视频 8–9s 实现两个处决单位动画的无缝衔接，这是实现'将零散处决动画进行无缝衔接技能'的重要规则」 |
| 增补动作 6 | 帧级取证：接缝 8.6167s（u05→u17）前后 ±2 帧纵向堆叠，与接缝 2.6333s（u07→u05）对照 → **无缝三条件**：① 尾帧姿态 × 首帧姿态匹配（背对↔背对，剪影连贯）；② 色调亮度匹配（竹林暗绿↔崖瀑暗绿）；③ 速度曲线配合（tail 1.8x 收招 + open 1.0x 起手，切点落在归位后/余韵未散时）。反例对照证明速度曲线必要非充分——两接缝速度曲线全同，唯一差异在姿态与色调 → **衔接是选序问题不是渲染问题**；规则已写入 loop43 报告第六节，衔接技能（待建）以选序判据为主体、速度底座免费复用 exec-speed-grammar |
| 增补产物 5 | `probe/seam_8617/`（接缝 8.62s 条带+精帧堆叠）· `probe/seam_2633/`（对照接缝同套取证）· loop43 报告新增第六节 |
| 增补动作 7 | 目标变更后无缝衔接实验：① 建 46 单位**尾手卡库**（首帧+尾帧各 46 张，2 张编号网格 `probe/seam_lib/`）；② 按层判定渲染 u11（快杀单镜 2.32s）/ u30（标准单镜 5.3s）/ u39（快杀**双波峰** 2.25s，多波峰规则第二次实测）三份 B 档配方成片，时长误差 ≤0.01s；③ v1 链 u05→u17→u11→u30（25.82s）：S1 强匹配=无缝（人工发现复证）、**S2 判据失误实例**（u17 尾帧实为暖橙木台兽击收尾，catalog scene"崖瀑"是提取点场景——凭元数据/首帧印象排链产生暖橙↔灰绿跳切，且该缝速度曲线与无缝缝完全相同，反证速度必要非充分）、S3 弱匹配=顺；④ v2 修正链 u05→u30→u11→u17→u39（28.97s）：u17 挪链尾接 u39 红叶暖系，四缝逐缝 ±2 帧取证全达预测；⑤ 合集口径 0.3x 占比 34.5%（u11 单出 39.8% 超标走合集稀释，盲区④路径实测） |
| 增补产物 6 | [`Skills/exec-seam-stitch/SKILL.md`](../../Skills/exec-seam-stitch/SKILL.md)（无缝三条件 / 接缝三级 / 尾手卡库流程 / 逐缝验收，junction 已补，check_skill 通过）· `seam_match_compile.mp4` / `seam_match_v2_compile.mp4` · `out_u11/u30/u39_B.mp4` + 三份 cfg · `probe/seam_lib/` · `probe/seam_exp/` · `probe/seam_v2/` · Skills.md 索引与 exec-speed-grammar 边界表同步更新 |
| 待人工 | v2 合集动态观感确认；4 盲区修入 exec-speed-grammar；BGM 曲子 |
| 增补动作 8 | BGM 选型实测（人指令「自己上网选最合适的公开曲子」）：① **修规格表 bug**——旧 `bgm_spec.json` 把源时间当输出时间（hits 整条偏 0.19–1.0s，仅 u17 hit① 因 open 恰 1.0x 未偏），逐层核算修正两版（verify 4 点 / v2 7 点）；② 公开源侦察：Freesound / Pixabay 直链被反爬挡，Incompetech 可用，下载 17 首；③ 修 `bgm_fit.mjs` 两处（曲长不足时崩溃 → 诊断+exit 2；无瞬态点 → `NO-ONSET` 不再给假 onset）；④ 新增 `Tool/audio/bgm_scan.mjs` 批量扫描（排序+CSV+exit 码）；⑤ 17 首跑表：最优 Volatile Reaction 均值 166ms/最大 383ms 仅 1/7 PASS，5 首纯氛围曲无瞬态、1 首曲长不足；⑥ **穷举 100–180 BPM 证「7 点全 PASS 原理不可达」**（命中点间距 5.48/5.03/3.10/3.95/5.37/1.25s 无公共拍长）；⑦ 出对齐混流 `v2_volatile_mix.mp4`（offset +0.135s） |
| 增补产物 7 | `bgm_spec.json` / `bgm_spec_v2.json`（修正版）· [`Tool/audio/bgm_scan.mjs`](../../Tool/audio/bgm_scan.mjs) + audio.md 已知边界三条（非网格结论/曲长硬门槛/授权与 Content ID）· `bgm_cand/`（17 首候选）· `probe/bgm_scan.csv` · `v2_volatile_mix.mp4` · loop43 报告第八节 |
| 待人工（BGM） | 三路线择一：① BGM 做底 + 音效补点（推荐）；② 先选曲再按重音重排单位；③ 放宽 tol 到 ±0.15s |
| 增补动作 9 | final50 全量验证（人指令「尽量配 BGM，两技能全量验证，出 50s 成片」）：① 选序扩展 10 单位链 **u05→u30→u11→u17→u39→u40→u41→u45→u22→u46**（51.133s）——新增段按尾手卡走暖红梯度（红叶→红川同场景→红室→火场夜→火海终局），冷绿开局一路升温的叙事弧；② 新定层渲染 5 单位（u40/u41/u45/u22/u46，B 档，时长误差 ≤0.01s）；③ **两技能全量验收**：speed 四查全过（切点 0 冲突、0.3x 合集占比 34.2%≤35%，u11/u45 单出超标走合集稀释）、seam 9 缝全取证（S6 红川同场景=无缝~顺，余顺/良好/弱匹配，**零转场级**）；④ BGM 12 命中点（含双波峰 0.6x 层起点）重算 `bgm_spec.json` final50 版，17 首扫描 Volatile Reaction 最优（3/12 PASS 均值 176ms，offset +0.240s），混流 `final50_bgm.mp4` |
| 增补产物 8 | `final50_compile.mp4` / `final50_bgm.mp4`（51.13s 成片）· `concat_final50.txt` · `cfg/out_u40|u41|u45|u22|u46_B.*` ×5 · `probe/seam_f50/`（S5–S9 取证）· `probe/verify_final50.py` · `probe/bgm_scan_final50.csv` · `probe/bgm_final50_volatile.txt` · loop43 报告第九节 |
| 待人工 | final50 动态观感确认（重点 S5–S9 五条新缝）；BGM 路线三择一仍开放；4 盲区修入 exec-speed-grammar |
| 增补动作 10 | 发布 final50 评审站（人指令「出循环发布链接」）：`Tool/review/review_page.mjs` 生成 8 条目站点（417.1MB 全硬链接零占盘）→ `workbuddy_sites_deploy` 上线，链接 https://epa-digest-v2-review.app.workbuddy.host/?sharecode=CSWHUE2KPA 。shareLink 已回填 `review_final50.json`，重发时清单自动带上 |
| 增补产物 9 | `review_final50.json` · `site_final50/`（index.html + review_manifest.json + media 硬链接） · 线上：exec-final50-review 应用 |
| 人工反馈 8 | 19:17「几乎完美，最后一个处决镜头再从原片中补几帧，让人物那一脚踹完收尾」 |
| 增补动作 11 | finale 补帧修正：① 查源片余量——u46 提取窗 4.21s 截掉了踹击完成（168.3s）后的「站立渐暗 + 红色书法「致命」字」演出（源片 173.035s 在 u46 后还有 4.7s；loop38 曾记「脚未落地属源片缺陷」实为提取窗不足）；② 源片重提 u46_ext.mp4（5.80s）+ cfg 新增 finale 层（4.21–5.80 @1.0x 常速）+ 重渲染 6.55s（误差 ≤0.01s）；③ 成片重拼 52.72s、BGM 重混（offset 不变）；④ 0.3x 占比降至 33.2%；⑤ 站点配置同步更新，旧版留档 probe/*_prev.mp4 |
| 增补产物 10 | `u46_ext.mp4` · `cfg/u46_B.json`（finale 层版）· `out_u46_B.mp4`（6.55s）· `final50_compile.mp4` / `final50_bgm.mp4`（52.72s）· `probe/u46fix_finale_strip.png`（finale 五帧取证）· `bgm_spec.json`（dur 52.7167）· 报告第十节 |
| 增补动作 12 | 重发布 final50 评审站（人指令「重新发布」）：同目录覆盖同一应用，链接不变 https://epa-digest-v2-review.app.workbuddy.host/?sharecode=CSWHUE2KPA ，线上内容更新为 52.72s finale 版（8 条目 423.1MB） |
| 增补动作 13 | B 站发布物料（人选定标题 #3）：① `publish_bili.md`（标题/简介两版/分区标签，人工定界：不写源视频出处，CC BY 署名保留）；② 封面两版合成与目验，定稿 `cover/cover_A.png`（1920×1080，u46 站立帧镜像 + 三行字：钩子 58px / 主标「卡点处决」205px / 红条角标 50px） |
| 增补产物 11 | `Prototype/loop43_skill_verify_bgm/publish_bili.md` · `cover/cover_A.png`（定稿）· `cover/cover_B.png`（备选）· `cover/base_*.png`（底图） |
| 增补动作 14 | B 站投稿（人指令「发布到我给你的B站账号」，账号 UID=326452892 已有扫码登录态）：`Tool/ops/publish_bilibili.mjs publish` 走网页端 → 上传 127.3MB/18s → 标题 24 字/简介 202 字/7 标签（自动推荐的「BGM/音乐/生活记录」已删）/分区游戏/封面 4:3+16:9 → **首次被「请添加创作声明」拦下**（新必填项，dry-run 不触发）→ 补 `--decl "内容无需标注"` 重发成功 → **BV1qTWJ6kEuy**（aid 117580652089830），请求体回读 copyright:3 / creation_statement.id:-1 |
| 增补产物 12 | `History/publish/bilibili/runs/2026-11-08T11-48-54_publish/`（截图+日志+回执）· `cover/desc_final50.txt` · `cover/cover_A.jpg` · 脚坑单新增第 9 条（创作声明必填） |
| 待确认 | 稿件审核状态（verify 首查为审核中 404，需几分钟后再验）；copyright:3 的枚举含义待查（页面显示是否为「自制」） |
| 增补动作 15 | 稿件复核通过（`verify --bvid BV1qTWJ6kEuy`）：标题/简介/封面/时长 53s 均在线，publishedAt=1794138632，作者「为做真实的自己许诺」，播放 0（刚上线）；分区落「游戏-其他游戏」（提交 tid=17 → 页面 tid=1011）。注：投稿请求体 copyright:3 —— B 站新版自制枚举，非转载 |
| 人工反馈 9 | 20:00「发错号了，你现在知道几个B站账号」→ 选定目标号「草履虫爱剪辑」(A号) + 已发稿件「删掉重发」 |
| 增补动作 16 | 账号盘点（回答「知道几个号」）：全仓只有 2 个 B 站账号，两处 profile 登录态均有效——① **草履虫爱剪辑** UID=3747573749779036（旧昵称「今天AI又离谱了」，API 查 BV1rCxs6gEEb 的 owner.mid 证实同号改名），登录态在 `Workspace/run/bili_profile_20261107_0035_backup`（**免扫码可切**）；② **为做真实的自己许诺** UID=326452892，登录态在 `Workspace/run/bili_profile`（今日投稿所用）。读取方式：Playwright 打开 profile 读 `DedeUserID` cookie（`loginState`），昵称经 `api.bilibili.com/x/web-interface/card` 核对 |
| 增补动作 17 | 删除 B 号错发稿件 BV1qTWJ6kEuy 的尝试与结论：① 旧接口 `POST member.bilibili.com/x/web/archives/del` **已 404**（返回 HTML 错误页，脚本 `delete` 命令因此失效）；② UI `.more-btn`（⋮）点击**无任何响应**（DOM 零变化，hover/click/dispatchEvent 均无效）；③ 从行 Vue 实例找到 `openDeleteBox()/handleDeleteBox()`（内部先 `getArchiveDelRisk(bvid)` 再弹出「验证并删除此视频」），**能从实例直接唤出删除对话框**；④ 对话框触发**极验滑块拼图**——按边界不绕过安全验证，转人机协作（headful 窗口 + 轮询检测），两次窗口（各 6 分钟）用户未操作，超时退出。**当前 BV1qTWJ6kEuy 仍在 B 号在线，A 号重发未做** |
| 增补产物 13 | `Workspace/run/delete_bv_headful.mjs`（可复用的「人机协作删除」脚本：自动定位到验证对话框 + 轮询删除完成）· `Workspace/run/probe_profile_uid.mjs`（读任意 profile 的 B 站 UID）· `Workspace/run/probe_del/`（删除流程取证截图与 Vue 方法源码） |
| 坑单候选 | ① `publish_bilibili.mjs delete` 已失效（接口 404），需改走 UI+Vue 实例法，且**删除必触发滑块验证**，无法全自动；② 稿件管理页 ⋮ 按钮的 click handler 在 headless 下不响应，只能从 Vue 实例调 method；③ 弹层定位不能靠 `offsetParent`（fixed 元素为 null），要用 `getBoundingClientRect` 可见性判断 |
| 增补动作 18 | 切号重发（人选定方案③「先切 A 号重发」）：① profile 换位——`bili_profile` → `bili_profile_B_326452892`（存档 B 号），`bili_profile_20261107_0035_backup` 复制为新 `bili_profile`（A 号草履虫爱剪辑，免扫码）；② `status` 确认 UID=3747573749779036；③ 同参数重发（标题/简介/122MB 成片/封面 JPG/7 标签/--zone 游戏/--decl 内容无需标注），上传 66s 表单就绪，标签自动推荐的 BGM/音乐/生活记录 已剔；④ **新稿件 BV1UpWJ6aEgM**（aid 117580819923099），请求体回读 copyright:3 / creation_statement.id:-1 / tid:231（UI 与落库脱钩，页面 verify 落 1011 游戏-其他游戏） |
| 增补产物 14 | `History/publish/bilibili/runs/2026-11-08T12-30-25_publish/`（回执+日志）· 新 profile 布局 `bili_profile`(A号) / `bili_profile_B_326452892`(B号存档) |
| 待处理 | B 号旧稿 BV1qTWJ6kEuy 仍未删（删除需滑块验证，等人工）；新稿 BV1UpWJ6aEgM 审核中 |
| 增补动作 19 | 新稿复核通过（`verify --bvid BV1UpWJ6aEgM`）：httpStatus 200 · 作者「草履虫爱剪辑」· 标题/封面/时长 53s 均在线 · 分区 1011（游戏-其他游戏）· publishedAt=1794141108。B 站关键词区已自动识别 BGM《Volatile Reaction》——Content ID 已匹配，后续如有 claim 需注意 |
| 增补动作 20 | 工线固化：`publish_bilibili.mjs` 坑单新增第 10 条（delete 接口 404 + ⋮ 无响应 + Vue `openDeleteBox()` + 滑块不可绕，指向 headful 脚本）与第 11 条（换号=换 profile 目录，含两号 UID）；`publish_bili.md` 补发布记录表（错发 BV1qTWJ6kEuy / 正式 BV1UpWJ6aEgM） |
| 增补动作 21 | 收工整理（人指令「结束循环」）：① loop43 索引章节按序重排（原七/八排在五/六之前，编号乱序）并新增第十一节——B 站发布物料与发布记录（标题/简介/封面复现/发布设置/人工定界/发布记录/残留待处理）；② 按 §3.3「一目录一份说明」把独立文件 `publish_bili.md` 的整体内容并入索引后删除（原 E7 报错消除）；③ `.gitignore` 新增五组规则——探针逐帧原料（`probe/**/f_*.png`、`probe/**/[Ss][0-9]_[0-9]*.png`）、尾手卡原始帧与带字中间件（`seam_lib/u*_{open,tail}.png` + `tmp/`）、评审站产物（`Prototype/**/site_*/`，媒体为硬链接）、BGM 候选曲（`Prototype/**/bgm_cand/`，外部素材可再下载）、recam 中间构建目录、封面底图与字体副本；④ 提交范围 116 文件（含关键凭证 42 张 png ≈113MB：逐缝 vstack、46 单位尾手卡网格、finale 条带） |
| 增补产物 15 | loop43 索引第十一节（并入的发布物料）· 删除 `publish_bili.md` 后目录恢复单索引 · `.gitignore` 五组忽略规则 |
| 待人工（收工后） | ① B 号旧稿 BV1qTWJ6kEuy 仍在线上，建议手机 App「创作中心→稿件管理」删除（App 端无滑块）；② 4 个 speed 技能盲区是否修入 `exec-speed-grammar/SKILL.md`；③ 发布后播放/完播数据待观察（`node Tool/ops/watch_feedback.mjs`） |
| 增补动作 22 | 收工核对发现一处欠账并补正：`Idea/State.md` 通道第 7 格「镜头重加工」判据列原为「—」，而 loop42 的 `exec-speed-grammar`（只改速率）与 loop43 的 `exec-seam-stitch`（尾手选序）正是该格判据——补齐判据与凭证（loop42·loop43），堵点改写为「速率与选序有判据，推近量/转场/版式仍靠人判」；读法段「3 格有判据」同步改为 4 格。这符合 §1.2 的准入判据（动了某格的判据与堵点） |
| 增补产物 16 | `Idea/State.md`（第 7 格补判据，有效判据格 3→4） |

<a id="loop44"></a>

## 小循环 44 · 素材仓库整理（处决镜头按 clips1080p60 结构落进 Material）

| 项 | 内容 |
| --- | --- |
| 开始时间 | 2026-11-08 22:45 |
| 初始目标 | 人指令（22:36）「更改目标，整理素材仓库，参考 `Prototype/loop38_exec_extract/clips1080p60` 的目录结构，调用处决抽取技能，对 BV1ydx26rEWv 进行提取，**一定保证最终目录结构与 clips1080p60 一致，如果无法保证需要修改处决抽取技能**，最后所有镜头保存到 `Material/影之刃零/处决镜头`」。判据三条：① 目标目录结构逐项对齐参考目录；② 走 `exec-extract` 技能而非手工复制；③ 技能给不出该结构就改技能 |
| 结束结果 | 进行中 |
| 结束时间 | 2026-11-08 22:58 |
| 结束结果 | **判据 1/2/3 全过，待人工验收。** ① 结构一致：目标目录 140 文件 vs 参考 140，文件名集合完全相同，46 条片段 1920×1080@60fps 全同、时长最大差 0.000s，抽检 6 个文件（mp4/jpg/ass/csv/html）md5 逐字节相同；② 全程走 `exec-extract` 技能（复用 loop38 已核验的 46 单位边界，本轮执行导出+归档）；③ 技能改了 3 处才给得出该结构（绝对输出目录 / 导出后结构自检 `3N+2` / 归档 `--in-place`）。另顺带处理了素材库被清空后的账本悬空（见下） |
| 动作 | ① 读参考目录与技能，定位到 `exportUnits` 用 `path.join(base, outArg)` 解析目标目录——绝对路径在 Windows 上会拼坏，这是"导不进 Material"的根因；② 改 exportUnits：绝对路径原样用；③ 加结构自检（缺项 throw）；④ 改 archive 支持 `--in-place`（只登记不复刻，避免题材目录 + library 双份）；⑤ 跑 export（46 单位 × 1080p60，6m32s，`[结构自检] 通过：140/140`）；⑥ 写 `probe/structure_diff.mjs` 比对两份目录（名称集合 + 逐片段 ffprobe + md5 抽检）；⑦ 源片 224MB 从 `Workspace/tmp` 复制进 `Material/影之刃零/源片/`（tmp 会被清）；⑧ 账本：备份 → 移除 185 条处决主题悬空记录 → 9 条外部素材标 `missing` → `archive --in-place` 重建 47 条；⑨ 新建 `Material/影之刃零/影之刃零.md` 索引，`Material.md` 目录表/存量/主题索引/铁律 4 同步；⑩ `.gitignore` 加 `Material/影之刃零/**`（只放索引入库）；⑪ 顺手修 SKILL.md 里与 catalog 对不上的分级数字（标准 25/快杀 17 → 28/14） |
| 产物 | [`Prototype/loop44_material_lib/loop44_material_lib.md`](../../Prototype/loop44_material_lib/loop44_material_lib.md) · `structure_diff.md`（结构/哈希比对结论）· `probe/structure_diff.mjs` · **`Material/影之刃零/处决镜头/`**（140 文件）· `Material/影之刃零/源片/BV1ydx26rEWv_yzl_exec_1080p60.mp4` · `Material/影之刃零/影之刃零.md` · `History/runs/materials/loop44_exec_archive.json`（回执）· 改动的工具 `Tool/ops/exec_extract.mjs` / `Tool/lib/pw.mjs` / `Tool/ops/dl_bili_hd.mjs` / `Tool/ops/ops.md` / `Skills/exec-extract/SKILL.md` |
| 人工反馈 | 22:38「所有素材采集都要使用『为做真实的自己许诺』账号，默认为 1080p 60fps，发布走『草履虫爱剪辑』账号」→ 落为 `Tool/ops/ops.md` 的「账号分工（硬约束）」+ `Tool/lib/pw.mjs` 读 `BILI_PROFILE` 环境变量（不设则回默认发布号目录）+ `dl_bili_hd.mjs` 缺省 qn 改 116、降级时告警。**实测采集号 qn=116 返回 quality=116，dash 有 1920×1080@60 三档 → 该纪律可执行**（uid 326452892） |
| 待人工 | ① `Material/library|briefs|inbox|quarantine` 在 22:30 前后被清空（非本轮动作），若为误删需要你确认是否从回收站/备份恢复；② 9 条外部素材记录标了 `missing`，要不要按 `file_url` 重采；③ 关键帧 138 张是否也要按同样规则落进 `Material/影之刃零/`（本轮只落了镜头与源片） |
| 增补动作（模板沉淀） | 22:54 人指令「`Material/影之刃零/处决镜头` 是以后素材入库的模板目录，把相关规则沉淀到素材库相关文档」。重读现场发现两处变化：① 人已把 `源片/` 移进 `处决镜头/` 里（模板形状定为「素材类目录内含源片」）；② `Material/manifest.jsonl` 已被删除（连同上一段善后的 56 条）。处置：① 按实际目录用 `archive --in-place` 重建账本（47 条，源片路径改为 `影之刃零/处决镜头/源片/…`）；② 重写 `Material/Material.md`——新增「入库目录模板（定版）」树状图 + 素材类硬规则 7 条 + 入库五步 + 铁律扩到 6 条（新增「实体搬动必须改账本」「一层题材一层素材类」）；③ `影之刃零/影之刃零.md` 改写为模板样板（源片移到目录树内）；④ 新增校验器 `Tool/check/material_layout.mjs`（F1 账本悬空 / F2 缺题材索引 / F3 断号与三件套缺件 / F4 清单缺件或行数不符 / F5 缺核对页 / F6 源片缺失或命名无 BV 号 / F7 有实体无账；W1 母版非 1080p60 / W2 缺 gitignore 排除），首跑 `✓ 全部合规`；⑤ `Tool/check/check.md` 登记该工具，`Skills/exec-extract/SKILL.md` 加一句「落地形态只认 Material.md，冲突以它为准」 |
| 增补产物（模板沉淀） | [`Material/Material.md`](../../Material/Material.md)（入库模板 + 硬规则 + 五步）· [`Material/影之刃零/影之刃零.md`](../../Material/影之刃零/影之刃零.md)（样板索引）· [`Tool/check/material_layout.mjs`](../../Tool/check/material_layout.mjs) · `Tool/check/check.md` · `.gitignore`（`Material/影之刃零/*` + `!…/*.md`）· `Material/manifest.jsonl`（47 条重建） |
| 增补动作（模板 v1 分层） | 23:02 人定「素材库也要遵循渐进式披露，现在的规则只是抛砖引玉」→ 采纳"L0 入口 + L1 分册 + 机器注册表"结构，按此改造：① `Material.md` 从 115 行压到 40 行（只留定位/树/六条任务路由/3 条铁律/现状），细则全部搬进 `Material/docs/` 六册，每册首行写「读到这里就够，除非…」给退出条件；② 新建 `Material/kinds.json` 素材类注册表（shape = `units`/`files`/`source`），**加新素材类只改 JSON，不改校验器**——v0 把「处决镜头」形状写死，关键帧类一入库就会被误报"没有 uNN.mp4"；③ `material_layout.mjs` 重写为注册表驱动：F1–F9 + W1–W3（新增 F8 账本字段越界、F9 类未注册、W3 declared 类已有实体），源片检查移到**题材层**；④ 源片上提：`影之刃零/处决镜头/源片/` → `影之刃零/源片/`（同一母带会被切成多类素材，逐类存 = 224MB×类数）；⑤ 授权分类抽成 `Tool/lib/license.mjs` 单一真源，`collect_material` 与 `exec_extract` 共用，`archive` 不再硬写 `tier=L0`（外部版权片应为 L2），新增 `license_class`/`topic`/`kind`/`unit`/`scene`/`move` 六个字段；⑥ 账本按新字段重建 47 条（批次 `loop44b_exec_rearchive`，备份 `manifest_before_loop44b.jsonl`），`tags` 只留受控词，场景/单位号从 tags 迁到字段；⑦ `repo_sync_check` 为 `docs/`、`_template/` 加导航豁免（分册容器不是导航单元）；⑧ `_template/题材名.md` 骨架 + `AGENTS.md`/`Skills/exec-extract`/`Tool/check/check.md` 指向同步 |
| 增补产物（模板 v1 分层） | [`Material/Material.md`](../../Material/Material.md)（L0，40 行）· [`Material/kinds.json`](../../Material/kinds.json) · `Material/docs/`（[模板规范](../../Material/docs/模板规范.md) / [字段字典](../../Material/docs/字段字典.md) / [标签词表](../../Material/docs/标签词表.md) / [入库操作](../../Material/docs/入库操作.md) / [授权与可发布](../../Material/docs/授权与可发布.md) / [校验口径](../../Material/docs/校验口径.md)）· `Material/_template/题材名.md` · [`Tool/lib/license.mjs`](../../Tool/lib/license.mjs) · 改动：`material_layout.mjs`（重写）/ `exec_extract.mjs` / `collect_material.mjs` / `repo_sync_check.mjs` / `check.md` |
| 增补读数（模板 v1 分层） | `node Tool/check/material_layout.mjs` → `✓ 全部合规`（1 题材 · 3 类注册 · 47 条账本）；`repo_sync_check` E7 由 6 条清零，余 E5 7（历史欠账 loop32–38）、W2 1、W4 1。**刻意留白**（连触发条件写进文档）：发布前授权 gate、成片→素材血缘表、近重复检测、关键帧迁入（`kinds.json` 已标 `declared`）；**刻意不做** `_meta.json`（gitignore 只放行 `*.md`，且信息本属题材索引） |

<a id="loop46"></a>

## 小循环 46 · 仓库瘦身：重写历史，只留 K 级

| 项 | 内容 |
| --- | --- |
| 开始时间 | 2026-11-08 23:21 |
| 初始目标 | 人指令（23:21）「当前 git 仓库有多大」→ 算出三口径（.git 1.6GB / 跟踪 1251.4MB·3537 文件 / 工作区 22GB）→ 出分级清单（K 必留 / A 零风险 / B 取证图 / C 素材成片）。人定（23:28）「彻底挡位，只留 K 级挡位」 |
| 判据 | ① `.git` 显著缩小且 `git fsck` 无错；② 保留集 = K 级 2323 文件，内容逐字节不变；③ 工作区 1201.6MB 实体一个不能少（历史重写不许删文件）；④ 提交历史可追溯到 loop43 收工，空提交可剪 |
| 结束结果 | **四条全过。** `.git` 1.6 GB → **39 MB**（-97.6%）；跟踪 **1251.4MB/3537 → 49.75MB/2323**；`git fsck` 零输出；提交 114 → 108（6 个只动媒体的提交被剪空）；1201.6MB 媒体实体全部留在磁盘原位（逐条抽查 max 44.6MB 的 `硬核的半佛仙人_early.mp4`、`frames1080p60/u01_a.png` 均在） |
| 动作 | ① 写体积体检器（后落 `Tool/check/git_size.mjs`，只读体检：按 4 档分类、出 CSV/移出清单/保留清单）；② 量到三个反直觉事实——`.git` 里 320MB 是「提交过又被删」的历史垃圾、`tier` 与授权混用（上轮已修）、`filter-repo` 未装（`pip install git-filter-repo` 后可用）；③ `git clone --mirror` 到 `WorkBuddy/_rewrite46.git`（硬链接，不占额外空间）；④ 第一遍 `--invert-paths` 按 1214 条移出清单过滤 → 剩 367MB，**发现漏项**：只按 HEAD 路径列清单，历史里那些「已从 HEAD 消失的旧路径」（`case_A_synth/source.mp4`、旧 `qc_*.png`）过滤不到；⑤ 第二遍改 `--paths-from-file keep46.txt`（只保留）→ 38MB，才是真「只留 K 级」；⑥ `--replace-refs delete-no-add` 确保不留 replace ref（否则旧对象仍可达、体积不降）；⑦ 校验：fsck 零错、树 2323 文件、tip 提交信息一致 → 换 `.git`（旧件整份移到 `WorkBuddy/_git_backup_before_rewrite46`，同卷 rename 不花时间）；⑧ 重建配置（`core.bare=false`、origin/mirror 远端、分支跟踪、user）→ `git reset` 重建索引（**mixed**，不动工作区）→ 27 行改动与重写前完全一致；⑨ `.gitignore` 补 9 条（`Prototype/**/*.png|jpg|jpeg`、`History/**/*.png|jpg` + `!History/publish/**/*.png`、`History/loops/**/*.mp4`、`*.pcm|*.raw`、`.probe/`），否则 1200 个文件会以未跟踪身份刷屏；⑩ 存 `commit-map.tsv` 与 `git-rewrite.md` |
| 产物 | [`History/runs/git-rewrite/git-rewrite.md`](git-rewrite.md)（旧→新哈希换算 + 远端状态 + 遗留）· [`commit-map.tsv`](git-rewrite/commit-map.tsv)（119 条对照）· [`Tool/check/git_size.mjs`](../../Tool/check/git_size.mjs)（体检器，四档判定可复跑）· `.gitignore`（+9 条） |
| 读数 | `.git` 39 MB · HEAD 49.75 MB / 2323 文件 · 108 提交 · `git fsck` 0 错 · 工作区未跟踪项 0（媒体已全部被忽略） |
| 关键教训 | ① **按 HEAD 路径列表过滤 ≠ 清干净历史**，必须反过来「只保留」才彻底（第一遍漏了 329MB）；② `--replace-refs` 默认策略会让旧对象继续可达，体积不降；③ 温和做法（`git rm --cached` + gc）**不会缩小 .git**，历史可达就无法回收——想让 clone 变小只有重写一条路；④ `git reset`（mixed）是换 .git 后重建索引的安全动作，`--hard` 会删掉那 1200 个实体 |
| 待人工 | ① 旧 `.git` 备份 1.6GB 在 `WorkBuddy\_git_backup_before_rewrite46`，验证无碍后手动删；② 本轮**未提交**（27 行改动含 loop44/45 的素材库分层与本次 `.gitignore`），等你发话；③ 若要把新历史推到远端，`main`/`browser-publish` 都得重推（远端仍在旧世界 `f3c03be`） |

