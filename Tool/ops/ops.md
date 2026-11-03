# ops/ — 市场运营侧（侦查 / 交付包 / 反馈追踪）

> 工厂不只管"做出来"，还要能回答"做给谁、怎么交付、有没有效果"。这个目录放的是市场侧的稳定动作。
> 原则同 `Tool/` 全局：**只读公开数据、不编数据**。
> 唯一例外是 `publish_bilibili.mjs`：它要在**账号主本人扫码授权**后代替人手点发布（见该脚本头部的边界说明），
> 不代填密码、不碰短信验证码、不刷互动。

## 文件

| 脚本 | 作用 |
| --- | --- |
| `recon_bilibili.mjs` | **市场侦查**：B 站公开接口（`ranking/v2`、`popular`、`search/type`）→ 样本池 + 分区/时长分布 + 关键词市场 + 候选选题打分（题材匹配 × 热度 × 互动 × 交付成本），输出 `market_report.md` + `market_raw.json` |
| `make_episode.mjs` | **造交付样片素材**：Edge TTS 合成英语口播 + CC-BY 画面循环铺满 → `source.mp4` + `ground_truth.json`（逐句时间码），用于验证"工厂→交付包"而不碰版权 |
| `make_cover.mjs` | **封面生成**：从成片抽帧 + 主标题/副标题/角标（CJK 走 `font=SimHei`，避免方块） |
| `track_feedback.mjs` | **反馈追踪**：读 `feedback.csv` 快照 → 完播率/点赞率/收藏率/评论率/千播涨粉 + 环比 + **规则化迭代动作**（P0/P1/P2）。空数据时明确输出"待采集"；`--selftest` 用合成数据验证规则（输出标 DRY-RUN） |
| `collect_feedback.mjs` | **反馈采集**（小循环 12 收尾新增）：零登录读 B 站公开接口 —— `web-interface/view`（播放/点赞/投币/收藏/评论数/分享/弹幕数）、`v2/reply`（热评原文）、`v1/dm/list.so`（弹幕原文 + 出现秒数）、`relation/stat`（粉丝总数）→ 写 `feedback.csv`（一天一行，同日重跑只刷新、人工备注保留；数据无变化不落快照）+ `History/runs/feedback/ticks.jsonl`（**一次一行**，高频唤醒时的日内时序，判断推荐流从哪刻起没再推）+ `latest.json`（最新快照，规划器的输入） |
| `plan_next_loop.mjs` | **下一轮规划**：把「播放增量 / 点赞率 / 收藏率 / 评论弹幕命中类别 / 弹幕时间聚集」翻成**可执行任务书**（R1–R10 共 10 条规则）→ `History/loops/next/plan.md`：目标 / 改哪个脚本哪个参数 / 验收阈值 / 成本 / 风险。`--demo` 用内置合成样本验证规则 |
| `watch_feedback.mjs` | **一键编排**：采集 → 诊断 → 规划，任一步失败会指明断在哪、前序产物是否还在。定时任务只需要挂这一条 |
| `collect_creator_stats.mjs` | **平台判卷**（小循环 13 新增）：登录态打 `/x/web/data/archive_diagnose/compare` → 完播率 / 平均播放时长 / 跳出率 / 点击转化 / 互动率，**并附同类中位数 `*_med` 与分位 `*_p50`** → `History/runs/creator/<date>.json` + `series.jsonl`。这是公开接口永远拿不到的那部分（`collect_feedback` 的"采集缺口 P1"）。`not_ready_field` 里的字段一律 `null`，绝不用 0 冒充；平台是 **T+1 每日 12:00** 更新 |
| `bench_peers.mjs` | **赛道基线**（小循环 13 新增）：双组采样 —— `HOT`（`order=click`，剔除长合集）取**形态范式**，`FRESH`（`order=pubdate` 近 30 天）取**新稿播放水位** → `History/bench/peers_<date>.md`：时长/标题/收藏率中位数 + 「我们的稿偏离了哪几条」。走登录态浏览器防风控（零登录直连 4 词有 2 词返回 HTML） |
| `ted_fetch.mjs` | **素材入袋一条命令**（小循环 15 新增）：`--pm <id>` → ffmpeg 拉 f11 视频 + f12 音频 `-c copy` 混流 → `talk_720p.mp4`，再调 `ted_subs` 抓官方双语字幕，落 `talk.meta.json`（清单 URL / 时长 / fps / 字节 / 授权线索）。`--probe` 只探测清单，`--t N` 冒烟限长。视频抓取从 loop14 的手工步骤固化为脚本 |
| `trace_text.mjs` | **写稿原料导出**（小循环 15 新增）：几百条碎 cue 导成「带时间戳的分桶全文」（`--bucket 45`），可选 `--bilingual` 中英并排、`--from/--to` 截段。写摘要稿时替代 loop14 每次临写的 node -e |
| `shot_profile.mjs` | **剪辑节奏画像**（小循环 17 新增）：镜头切分（ffmpeg scene + showinfo）→ 镜头数 / ASL / 长度分布 / 切点密度 / 运动能量，`--json` 落档。口径注意：th=0.15 对多机位演讲片经人工核对精度 ~92%；静帧动效片（Ken Burns）切点天然少，是真实差异不是漏检。用法：`node Tool/ops/shot_profile.mjs --video x.mp4 --th 0.15 --json out.json` |
| `ted_subs.mjs` | **TED 字幕/清单抓取**（小循环 14 新增）：给 `project_masters` id 就能拉全片 HLS 字幕段并合并 → `full_<lang>.vtt` + `cues_<lang>.json`。内置两个必踩的坑：段边界重复 cue 去重、**恒定预卷偏移**（`--offset`，不是按 EXTINF 累加）。视频用 ffmpeg 拉 `index-f11-v1.m3u8` + `index-f12-a1.m3u8`（直链 `py.tedcdn.com` 403） |
| `publish_bilibili.mjs` | **投稿发布**（小循环 12 新增）：Playwright + 系统 Edge 驱动创作中心网页端 —— 扫码登录（登录态持久化在 `Workspace/run/bili_profile`）→ 上传成片 → 标题/简介/7 标签 → 分区 → 创作声明 → 封面（4:3 与 16:9 同步）→ 投稿 → 回执（BV 号 + 逐项回读）。`status` 查登录态、`login` 出二维码、`publish --dry-run` 停在投稿前、`verify --bvid` 校验线上页 |
| `make_digest.mjs` | **3 分钟摘要报告流水线**（小循环 14 新增）：spec JSON 驱动 —— 30 段中文解说 Edge TTS × 原片精选帧 Ken Burns × 章节角标 + 右上「原片 mm:ss」导航角标 × 片头/尾导流卡 → 成片 + 简介（含 `?t=` 章节跳转表）。音画同步模型：音频 `[T] seg [GAP]…[E]` ↔ 视频 `Vk=seg+2·GAP`，xfade 转场恰好填满句间静音，零漂移。改 spec 重跑约 2 分钟。**`--v2`**（小循环 18 新增）：摘要片 v2 剪辑语言（实现拆在 `digest_v2.mjs`，TTS 共用）—— 真机位时间窗替代静帧 Ken Burns、硬切替代 xfade、冷开场 hook（spec.hook）、关键词橙色弹出（spec.segments[i].kw）、底部进度条、切点 whoosh/impact 音效。EP-A 实测 ASL 85.45s→5.66s、切点 0.35→10.32/min |
| `digest_v2.mjs` | **摘要片 v2 管线**（小循环 18 新增，由 make_digest `--v2` 调用）：逐单元串行切片（-ss/-t）→ 音频单独预混 wav → 终混 concat+subtitles 只带 M+1 路输入。产物与 v1 同构（final.mp4/digest.ass/zh.srt/manifest.json/desc_publish.txt）。**禁止单图多 trim 分支并行解码**（坑 17） |
| `bili_comment.mjs` | **评论 + 置顶**（小循环 14 新增）：走 API（`x/v2/reply/add` + `x/v2/reply/top`），Playwright `ctx.request` 共享登录 cookie，免网页表单自动化。`add --bvid BV --text-file f [--pin]` / `pin --bvid BV --rpid N`。用于稿件间互挂导航链接 |
| `make_essay.mjs` | **散文影像成片主链**（小循环 24 升格，源自 loop23）：spec JSON 驱动 —— 图片/版式卡 + 分段旁白 → 逐 shot 串行渲染（zoompan 镜头内运动 + colortemperature 叙事调色）→ concat demuxer → 三级音频（人声 asplit / 切点 whoosh+章节 impact / 合成 BGM sidechain ducking）→ ASS 双层字幕（日记层 + 花字弹出）→ 两处**视频流**时长校验。参数：`--spec/--out/--work/--reuse-tts/--no-bgm/--crf/--preset`；默认跑 loop23《光偷走的那两小时》。自带 spec 前置校验（id 唯一 / kind 合法 / 素材在位 / 逐 clip 时长漂移 ≤0.2s）与降级分支（无音效素材、无 tts、无 colortemperature） |
| `render_cards.mjs` | **版式卡批量截图**（小循环 24 升格）：Playwright 打开一页 HTML，把指定 id 的整屏块逐个截成 1920×1080 PNG。`--html/--out/--ids/--size/--wait/--copy/--from`；非整屏元素会告警（成片必失真）。用于标题卡/金句卡/双栏数据卡/SVG 图表卡/片尾卡 —— 排版交给浏览器，别在 ffmpeg 里画 drawtext |
| `bili_up_timeline.mjs` | **UP主全量投稿时间线**（小循环 25 升格，源自 loop25）：名单 → search bili_user 解析 mid → wbi 签名分页拉全量投稿（默认上限 2000 条/人）→ 年度聚合 + 播放爬坡点。`--out`（必填）`--names` `--max-pages` `--spike-ratio` `--spike-min-play`。**必须走登录态 profile**（游客 -352）；`timeline_<mid>.json` 存在即跳过，重采先删文件；同名小号风险（搜「半佛仙人」命中 11 粉小号）脚本会告警 |
| `bili_phase_select.mjs` | **早期 vs 成熟期选样**（小循环 25 升格）：读 `timeline_*.json`，早期 = 开号头 15 条播放最高、成熟期 = 近 4 年播放前 3，时长窗口 60–900s 过滤直播/切片。`--dir`（必填）`--early-n/--late-years/--min-len/--max-len/--cands`。产出 selection.json 供批量下载 |
| `dl_bili.mjs` | **B站样本下载**（小循环 25 升格，源自 loop19）：公开 html5 低清通道（480p durl，带 Referer），零登录。dash-only 视频不支持此通道会报「无 durl」，换样本即可。`node Tool/ops/dl_bili.mjs BV out.mp4` |

## 最短链路

```powershell
# 1) 侦查：今天市场上什么火、我们能不能快速做
node Tool\ops\recon_bilibili.mjs --out History\loops\loop12 --top 60
# 2) 造样片素材（合成口播 + 循环画面）
node Tool\ops\make_episode.mjs --script Prototype\loop12_market_loop\case_ep01\script_en.txt --out Prototype\loop12_market_loop\case_ep01
# 3) 工厂链路（识别→对齐讲稿→精译→字幕→烧入）见 Prototype\loop12_market_loop\reproduce.ps1
# 4) 封面
node Tool\ops\make_cover.mjs --video <成片.mp4> --out cover.jpg --title "..." --sub "..." --tag "..."
# 5) 发布（首次要扫码；--dry-run 先走一遍不提交）
node Tool\ops\publish_bilibili.mjs login
node Tool\ops\publish_bilibili.mjs publish --video Prototype\loop12_market_loop\case_ep01\render_16x9\final.mp4 `
  --cover Prototype\loop12_market_loop\case_ep01\cover_16x9.jpg --desc-file Prototype\loop12_market_loop\case_ep01\desc_publish.txt `
  --title "5 个剪辑提速技巧｜英文原声 + 中英双语字幕，照着做能省一半时间" `
  --tags "剪辑教程,视频剪辑,中英双语,剪辑技巧,后期,创作者工具,效率" --zone 知识 --decl "含AI生成内容" --dry-run
# 去掉 --dry-run 即真发；发完 verify 校验线上页
node Tool\ops\publish_bilibili.mjs verify --bvid BV1AaxC6hExH
# 6) 反馈：采集 → 诊断 → 排下一轮（一条命令）
node Tool\ops\watch_feedback.mjs
# 想补录完播率（公开接口没有，只能去创作中心看「平均播放时长」）
node Tool\ops\collect_feedback.mjs --avg-watch 12.4
# 只验证规则能跑，不碰真实数据
node Tool\ops\plan_next_loop.mjs --demo
node Tool\ops\track_feedback.mjs --selftest
```

### 散文影像（图 + 旁白 → 2 分钟短片）

```powershell
# 1) 版式卡：先排 HTML，再整屏截图（每块必须 1920x1080）
node Tool\ops\render_cards.mjs --html <目录>\cards.html --out <目录>\cards --ids title,quote1,info1,chart,end
# 2) 出片（spec 见 Skills/essay-film-production/references/spec-schema.md）
node Tool\ops\make_essay.mjs --spec <目录>\spec.json
# 3) 只改旁白不想重跑 TTS：--reuse-tts（跨目录复用要先拷 .work/*.wav，坑 18）
node Tool\ops\make_essay.mjs --spec <目录>\spec.json --reuse-tts
# 4) 节奏验收：min ≤0.7s 且 p90 ≥4s 才算双峰
node Tool\ops\shot_profile.mjs --video <目录>\out\final.mp4 --th 0.15 --json <目录>\profile.json
```

### UP主成长图谱（投稿史 → 成长路径）

```powershell
# 1) 拉时间线（游客必被 -352，走登录态；已拉过的 mid 走缓存）
node Tool\ops\bili_up_timeline.mjs --out History\loops\<loop> --names "影视飓风,老番茄"
# 2) 选早期/成熟期代表（各 3 候选，下载失败按序补位）
node Tool\ops\bili_phase_select.mjs --dir History\loops\<loop>
# 3) 批量下载（候选循环补位）→ shot_profile 量化 → frame_sheet 抽帧目验
# 4) 量化口径见 loop25 REPORT：看 ASL + p90（成熟=分布收窄）+ 短镜占比，单样本标"初步"
```

## 坑

- **B 站搜索接口偶发返回 HTML**（风控页），要按 JSON 解析失败处理并继续，不要让整轮侦查挂掉；
- **合片时必须显式 `-map`**：画面源自带音轨（配乐），ffmpeg 默认流选择会挑它，成片里就不是刚合成的口播（实测 ASR 0 词）；
- **反馈表空着也要能跑**：追踪器的价值一半在"提醒你还没采集"，不要为了出报告编数据；
- 候选打分是**采样规则**，不是市场结论：它只回答"今天这个时间点，哪些方向值得先试"。

### 反馈采集链（`collect_feedback` / `plan_next_loop`）踩过的坑

1. **空单元格不是 0**。`Number('')` 是 `0`，于是"平均播放时长没填"被算成完播率 0%，
   规则一本正经地推出一条 P0「重做前 3 秒」——**假任务比没任务更糟**。
   现在 `num()` 对空串返回 `null`，比率算不出来就显示 `—`，缺失单独归到"采集缺口"（P1）而不是内容问题。
2. **旧表没有新列时字段是 `undefined`**，`Number(undefined)` → `NaN`，一路把 `new_followers` 写成 `"NaN"`。
   读 CSV 一律走 `numOr()`，`undefined` / `''` / 非数字统一归 `null`。
3. **增量基线要能跨"同日多次采集"**。定时唤醒一天跑多次（现为每 4 小时），若拿"当天旧行"当基线，第二次跑 `views_delta` 就变 0，
   R1（没进推荐）和 R2（在推但没人买账）会判反。做法：当天行已带 delta 时反推原始基线 = 当日值 − 当日 delta。
4. **"开头不错"不是"开头留人失败"**。分类正则里混着中性话题词（开头/字幕/语速），拿它判负会把好评吃成差评。
   单独维护 `NEGATIVE` 明确负面词表：`正向词 && !NEGATIVE` 才算好评，其余才进问题分类。
5. **弹幕是带时间点的反馈**：`dm/list.so` 的 `p` 属性第 1 个字段是秒数。走 5 秒一桶找最大桶，
   占比 ≥30% 且总数 ≥5 才判"某段被集中吐槽"——弹幕少时全是噪声。
6. **拿不到的指标就写"拿不到"**：完播率/平均播放时长只在登录态创作中心里，公开接口没有。
   采集器留空并提示 `--avg-watch <秒>` 补录，绝不估一个。
7. **高频唤醒 ≠ 高频落盘**。30 分钟一跑时：`feedback.csv` 若也跟着 30 分钟一行，环比全变噪声；
   可它一天一行又丢掉"哪半小时涨得快"。做法是拆成两个文件——CSV 保持**一天一行**（诊断口径不变），
   另开 `ticks.jsonl` **一次一行**（日内时序）；`plan_history.jsonl` 则只在**提案集合变化**时追加，
   否则一天 48 行全是同一个 R0 重复。判据：留痕的价值在"结论变了"，不在"跑过一次"。
8. **唤醒频率由"信息到达速率"定，不由"想早点看到"定**。实测两条 30 分钟间隔的 tick 数值完全一致
   （播放 4、互动全 0），说明 B 站 stat 有小时级缓存；而播放/点赞/评论都是**单调累计量**，
   采稀一点不会丢数据，只会晚一点看到结论。故定 **4 小时一次**（6 次/天，跨过夜间也够）：
   既覆盖"发布后 72h 起量拐点"的判断需求，又把 48 次/天的空跑降到 6 次。
   若连续 3 天日增播放 < 10 且零互动，降为每日 1 次；若单日播放翻倍或 ≥3 条评论，恢复 4 小时一次。
9. **搜索接口零登录会被风控，随机返回 HTML 页**。实测 4 个关键词里 2 个被打回（`<!DOCTYPE` 开头）。
   走 `Workspace/run/bili_profile` 的登录态 + 绝对地址 `api.bilibili.com` 后 4/4 通。
   注意用 `www.bilibili.com/x/...` 相对路径会 404（该路由只在 `api.` 上）。
10. **阈值不能凭空定**。`likeLow` 原本拍脑袋写 2%，而赛道点赞率中位就是 2.17% ——
   阈值卡在人群中间，等于把一半以上的合格稿判成"进来了但不买账"；`favStrong` 写 5%，
   而实际中位 1.67%，5% 是 P90+，永远够不着，工具型内容永不被识别。
   2026-10-31 用 113 条 HOT 样本校准为 1.0% / 2.5%（依据 `History/bench/peers_2026-10-31.md`）。
   **定阈值前先量人群分布**，别凭印象。
11. **平台判卷是 T+1，反复刷新没有意义**。`archive_diagnose/compare` 返回 53 个字段，
   发布 2 小时时有 37 个在 `not_ready_field` 里（完播率、均播、跳出率、点击转化全在里面），
   创作中心首页也写「每日 12 点更新」。要等就按天等，别做成半小时轮询——
   那不是"更快拿到答案"，是"更频繁地确认还没有答案"。

### 发布链（`publish_bilibili.mjs`）踩过的坑

全是实测出来的，改代码前先看，别重新踩：

1. **标签只能用真键盘**：`locator.click` → `keyboard.type` → `keyboard.press('Enter')`。
   合成 `KeyboardEvent`（keydown/keypress/keyup 三连）在草稿恢复、组件未就绪时会**静默失败**；
   `execCommand('insertText')` 只能把字填进去，Enter 那步照样骗不过去。
2. **绝对不能 `Control+A` + `Backspace` 清输入框**：焦点在标签容器时 Control+A 选中的是**上一个标签 chip**，
   Backspace 会把它删掉——表现为"永远只剩最后一个自定义标签"（踩了整整一轮）。
   要清残留就只在 `input.value` 非空时按 `End` + 逐字 Backspace。
3. **逐字符 `keyboard.type(delay:30)` 会被重渲染吞字**（只剩最后一个字，如「程」）；用 `delay:60` 或 `insertText`。
4. **B 站会按标题自动补 3 个推荐标签**（如 工具/草稿/技巧），必须删掉不属于自己的，否则关键词全跑偏。
5. **上次没发完会留草稿**，进投稿页先弹「继续编辑 / 不用了」；本工具一律点「不用了」从空表单开始，
   否则会串上次的标题/标签，甚至多 P。弹窗**不是立刻出现**，要轮询等（固定 sleep 3s 会漏）。
6. **封面弹窗的"完成"是 `div.button.submit` 不是 `button`**；4:3 裁完还会弹 16:9 同步确认（可能 1-3 步）。
7. **"立即投稿"第一次点击可能被残留遮罩吃掉** → 用 bbox 中心发真实鼠标点击，再校验结果文案（`恭喜/查看进度`）。
8. **浏览器句柄必须 try/finally 关**：任何异常路径漏关，node 进程会挂着不退出（`--dry-run` 时踩过）。
9. **`verify` 解析线上页时别把 meta 属性顺序写死**：线上是 `<meta data-vue-meta="true" name="..." content="...">`。
10. **登录态查 cookie**：`SESSDATA` + `DedeUserID` 同时在才算登录；profile 存在 `Workspace/run/bili_profile`，删掉即换号。

---

## 字幕坑（TED 链路，2026-11-01 补）

11. **TED 字幕清单首条是"预卷占位段"，段号不能拿下标猜**。`subtitles/{lang}.m3u8` 的第 1 条是
    `#EXTINF:3.5040` + `vtt?segment=-2&duration=30`，真正的 30s 段从 `segment=0` 才开始。
    旧版 `ted_subs.mjs` 用「第 i 条 ↔ segment=i」，于是把 3.5s 套给了 `segment=0`，服务器按短窗口
    只返回起点 <4s 的 cue —— 每片开头约 20-80s 的对白整段没有字幕（且下游 align 因为真值缺句，
    ASR 词无处归属被丢弃，表现为"成片这段完全没字幕"）。
    **修法**：直接解析清单里 EXTINF 后面那行的 URI（已带真实 segment 号），不要自己拼。
    **影响面**（用 ASR 词流交叉验证"空白里有词"）：EP-B 23.1s/58词、EP-C 24.7s/70词、
    EP-D 42.7s/100词、EP-E 77.3s/172词；EP-A 手工抓的，无损失。
12. **素材阶段 `ted_subs` 必须 `--offset 0`**，偏移由 `estimate_offset` 在流水线里标定并统一施加
    （`ted_episode` 步骤 2-3）。素材阶段就带偏移 → gt 被加两次 → 整体错位。
13. **中文字幕不要按字数硬切**：`make_subs` 的 `maxZh` 切分会在末尾留下纯标点块（单独一行「，」），
    且中文块数少于英文 cue 数时后半条中文为空。已修：纯标点碎片并回前块 + 按英文块数重切中文
    （`resplitZh`，切不干净则退回"块中心归属"）。审计口径：空中文 0 / 纯标点 0。
14. **`make_cover --bg --inset` 的嵌入帧会整块静默丢失**：lavfi `color` 主输入 + `-ss` 前置 seek 的视频流，
    在 `-frames:v 1` 下两路 pts 配不上，overlay 首帧直接过 —— 输出是纯色底 + 文字，**零报错**
    （`-loglevel error` 全静默，只看尺寸变小才会发现）。
    **修法**：先把目标帧抽成单帧 jpg（pts 恒 0）再作独立输入叠加（已固化进 `make_cover.mjs`，
    临时文件 `<out>.ins_tmp.jpg`）。
15. **摘要选帧别靠猜**：`frame_sheet.mjs --every 40` 先看全片画面构成（避开黑帧/转场/观众席），
    再 `--times "15,52,25"` 按 spec 顺序复核精选帧（每格带序号+时间戳），一张图看完 30 格。

16. **ffmpeg 拉 TED HLS 必须把 `httpproxy` 加进 `-protocol_whitelist`**：本机带 `http_proxy` 时 ffmpeg
    走代理协议，白名单只有 `file,http,https,tcp,tls,crypto` 的话直接
    `Protocol 'httpproxy' not on whitelist`，输入都打不开。已固化进 `ted_fetch.mjs`。

17. **单图多 trim 分支并行解码会静默截断视频流**：`[0:v]trim=A…[x];[0:v]trim=B…[y];…concat=n=33`
    单图 33 分支架构下，33 个分支共享解码器各自缓冲解码帧，叠加 x264 + 大 amix 会把
    h264 解码器内存打爆（日志深处 `thread_get_buffer() failed`），丢帧被吞、**退出码 0**，
    视频流只剩 177s/209s，容器时长被音频撑住完全看不出。
    **修法**（已固化进 `digest_v2.mjs`）：逐单元串行切片文件 → 音频单独预混 wav →
    终混只带 M+1 路输入；**成片校验必须看视频流时长**（`ffprobe -select_streams v:0
    -show_entries stream=duration`），不能只看容器时长。
    **连带教训**：管道里每个 ffmpeg 调用必须带 `-y`——丢了 `-y` 时 ffmpeg 对已存在输出
    交互询问后退出（状态码仍走错误分支但脚本若只看部分日志会误判），校验会跑在旧文件上，
    造成「修了也没用」的假象。

18. **`--reuse-tts` 按输出目录隔离**：TTS wav 存在各自 OUT 的 `.work/` 下，换输出目录时
    `--reuse-tts` 找不到文件会**静默退化为全量重跑 TTS**（网络抖动时直接失败）。
    跨目录复用（如同一 spec 渲两个变体做 A/B）先把旧目录 `.work/*.wav` 拷进新目录再跑。

19. **跨域检索被"同形词"污染**：搜「美食 vlog 治愈」前排会被动漫美食剪辑占据（同形不同质）。
    下载前先看一条搜索快照（标题+UP+分区），抽帧前先目验 1 帧，发现域错位立即整域补样。

20. **能量峰 ≠ 音乐节拍**：用 astats/asetnsamples 能量突增做"近似 onset"可以量化"切点-音频对齐度"，
    但它测的是能量包络不是乐理节拍（鼓点在混音里可能被压平）。判「踩点」类结论时必须注明检测方式，
    结论只能写到「未检测到对齐」，不能写「不存在对齐」——本轮实测 625w 踩点混剪辑点落峰仅 1.1× 随机，
    诚实结论是：踩点的"点"更可能是动作/画面语义，BGM 只负责匹配剪速。
    工具：History/loops/loop22/s4_beat_align.mjs（可复用）。

21. **filter_complex 的 label 只能消费一次**：`[voice]` 同时喂 sidechaincompress（触发）与 amix（混音）
    会报 `Invalid stream specifier: voice` / `matches no streams`，且报错指向图尾部难以定位。
    修法：`[voice]asplit=2[voiceSc][voiceMix]` 再分别引用。
    **连带教训**：spawnSync 的 cwd 继承 node 进程——传给 ffmpeg 的**一切文件路径必须绝对化**，
    否则换目录运行就静默失败（本轮 card 分支因此漏渲染 6 个 clip，concat 只拼出 3.8s）。
    每个渲染分支都要检查返回状态，img 分支有检查、card 分支没有→静默。

22. **就地转码被 ffmpeg 拒绝，而脚本没检查就当成成功了**：`ffmpeg -i a.wav -ac 2 -ar 48000 a.wav` 会直接
    报 `Output … same as Input #0 - exiting`（退出码非 0，但**文件没坏、时长照常**）。
    loop23 原脚本这一步没查返回状态，于是「TTS 归一化」从未真正执行，靠末尾 loudnorm 兜住听感才没暴露；
    升格成 `make_essay.mjs` 时一加状态检查立刻炸出来。
    **修法**：raw → 归一化两段式（`<id>.raw.wav` → `<id>.wav`），每步检查状态。
    **general 教训**：任何「输入输出同名」的转码都不成立；管道里每个 ffmpeg 调用都必须看 `status`。

23. **版式卡不能进调色层**：`colortemperature` 会把设计稿的米色 / 橙色推成脏黄，卡与照片的视觉断层一眼可见。
    卡走 `scale + setsar` 直通，只有照片吃 `k`。同理，花字的 `\pos(960,200)` 是**死坐标**——
    图表卡顶部自带标题时两者会轻微重叠（loop23 成片遗留问题），改版式时给图表卡单独一个 y 或挪到右下。

24. **工具脚本里的相对路径按「脚本自己的 __dirname」解析，不按 cwd**（loop25 实踩）：
    `frame_sheet.mjs` 的 `--out frames_x.jpg` 相对它内部的 ROOT 落到别处，10 连跑半数崩在写文件；
    同理 `execFileSync('node', ['dl_bili.mjs', …])` 写相对脚本路径会**静默全败**（ENOENT 被当下载失败吞掉），
    一轮 10 个任务全军覆没且日志看起来"只是都失败了"。
    **修法**：编排脚本里所有路径要么绝对化（`path.resolve(ROOT, …)`），要么先 `process.chdir`；
    子进程失败要把 stderr 打出来看第一行，别只数成功数。
