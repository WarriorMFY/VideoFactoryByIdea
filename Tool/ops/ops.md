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
| `publish_bilibili.mjs` | **投稿发布**（小循环 12 新增）：Playwright + 系统 Edge 驱动创作中心网页端 —— 扫码登录（登录态持久化在 `Workspace/run/bili_profile`）→ 上传成片 → 标题/简介/7 标签 → 分区 → 创作声明 → 封面（4:3 与 16:9 同步）→ 投稿 → 回执（BV 号 + 逐项回读）。`status` 查登录态、`login` 出二维码、`publish --dry-run` 停在投稿前、`verify --bvid` 校验线上页 |

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
3. **增量基线要能跨"同日多次采集"**。定时唤醒一天跑很多次（现为每 30 分钟），若拿"当天旧行"当基线，第二次跑 `views_delta` 就变 0，
   R1（没进推荐）和 R2（在推但没人买账）会判反。做法：当天行已带 delta 时反推原始基线 = 当日值 − 当日 delta。
4. **"开头不错"不是"开头留人失败"**。分类正则里混着中性话题词（开头/字幕/语速），拿它判负会把好评吃成差评。
   单独维护 `NEGATIVE` 明确负面词表：`正向词 && !NEGATIVE` 才算好评，其余才进问题分类。
5. **弹幕是带时间点的反馈**：`dm/list.so` 的 `p` 属性第 1 个字段是秒数。走 5 秒一桶找最大桶，
   占比 ≥30% 且总数 ≥5 才判"某段被集中吐槽"——弹幕少时全是噪声。
6. **拿不到的指标就写"拿不到"**：完播率/平均播放时长只在登录态创作中心里，公开接口没有。
   采集器留空并提示 `--avg-watch <秒>` 补录，绝不估一个。
7. **高频唤醒 ≠ 高频落盘**。每 30 分钟一跑时：`feedback.csv` 若也跟着 30 分钟一行，环比全变噪声；
   可它一天一行又丢掉"哪半小时涨得快"。做法是拆成两个文件——CSV 保持**一天一行**（诊断口径不变），
   另开 `ticks.jsonl` **一次一行**（日内时序）；`plan_history.jsonl` 则只在**提案集合变化**时追加，
   否则一天 48 行全是同一个 R0 重复。判据：留痕的价值在"结论变了"，不在"跑过一次"。

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
