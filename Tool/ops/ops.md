# ops/ — 市场运营侧（侦查 / 交付包 / 反馈追踪）

> 工厂不只管"做出来"，还要能回答"做给谁、怎么交付、有没有效果"。这个目录放的是市场侧的稳定动作。
> 原则同 `Tool/` 全局：**只读公开数据、不代登录、不编数据**。

## 文件

| 脚本 | 作用 |
| --- | --- |
| `recon_bilibili.mjs` | **市场侦查**：B 站公开接口（`ranking/v2`、`popular`、`search/type`）→ 样本池 + 分区/时长分布 + 关键词市场 + 候选选题打分（题材匹配 × 热度 × 互动 × 交付成本），输出 `market_report.md` + `market_raw.json` |
| `make_episode.mjs` | **造交付样片素材**：Edge TTS 合成英语口播 + CC-BY 画面循环铺满 → `source.mp4` + `ground_truth.json`（逐句时间码），用于验证"工厂→交付包"而不碰版权 |
| `make_cover.mjs` | **封面生成**：从成片抽帧 + 主标题/副标题/角标（CJK 走 `font=SimHei`，避免方块）；字号按**画面宽度**自适应，超宽先缩字号再折两行 |
| `make_vertical.mjs` | **竖屏版**（9:16）：模糊铺底 + 居中正片 + 重排字幕 + 可选顶部标题，一次 ffmpeg 滤镜图完成 |
| `pick_cover_frame.mjs` | **封面自动选帧**：按"下半区够暗 + 有细节 + 不过曝"给候选帧打分，避免取到片头标题卡/白屏 |
| `check_cover.mjs` | **封面自检**：尺寸比例 / 文字带暗底 / 高亮占比 / 局部蒙版分隔 / 320px 缩略图可读 / 安全边距（**不做 OCR**，错别字仍需人眼） |
| `radar.mjs` | **选题雷达常态化**：每跑一次存一期快照（`History/ops/radar/`），与上一期差分出新进榜/掉榜/播放增速/关键词变化，出趋势报告 |
| `track_feedback.mjs` | **反馈追踪**：读 `feedback.csv` 快照 → 完播率/点赞率/收藏率/评论率/千播涨粉 + 环比 + **规则化迭代动作**（P0/P1/P2）。空数据时明确输出"待采集"；`--selftest` 用合成数据验证规则（输出标 DRY-RUN） |

## 最短链路

```powershell
# 1) 侦查：今天市场上什么火、我们能不能快速做
node Tool\ops\recon_bilibili.mjs --out History\loops\loop12 --top 60
# 2) 造样片素材（合成口播 + 循环画面）
node Tool\ops\make_episode.mjs --script Workspace\deliverables\ep01_editing_tips\script_en.txt --out Workspace\deliverables\ep01_editing_tips
# 3) 工厂链路（识别→对齐讲稿→精译→字幕→烧入）见 Prototype\loop12_market_loop\reproduce.ps1
# 4) 封面（自动选帧 → 生成 → 自检）
node Tool\ops\pick_cover_frame.mjs --video <clean16x9.mp4> --count 12        # 输出 AT=xx.xx
node Tool\ops\make_cover.mjs --video <clean16x9.mp4> --out cover_16x9.jpg --at AT --title "..." --sub "..." --tag "..."
node Tool\ops\check_cover.mjs --cover cover_16x9.jpg --expect 16:9 --json cover.check.json --md cover.check.md

# 5) 竖屏版（9:16）：先出无字幕干净片，再合成竖屏并重排字幕
node Tool\subtitle\make_ass.mjs <cues.json> --out karaoke_9x16.ass --width 1080 --height 1920 --zh-size 68 --en-size 54 --wrap-zh 12 --wrap-en 34 --en-margin 265
node Tool\ops\make_vertical.mjs --video <clean16x9.mp4> --ass karaoke_9x16.ass --out render_9x16 --title "标题"

# 6) 选题雷达（每天跑一次积累趋势；本沙箱不能定时，靠人触发）
node Tool\ops\radar.mjs                              # 采集一期 + 与上一期差分
node Tool\ops\radar.mjs --seed <旧 market_raw.json>   # 首次建立基线

# 7) 反馈
node Tool\ops\track_feedback.mjs --csv Prototype\loop12_market_loop\case_ep01\feedback.csv
```

## 坑

- **B 站搜索接口偶发返回 HTML**（风控页），要按 JSON 解析失败处理并继续，不要让整轮侦查挂掉；
- **合片时必须显式 `-map`**：画面源自带音轨（配乐），ffmpeg 默认流选择会挑它，成片里就不是刚合成的口播（实测 ASR 0 词）；
- **反馈表空着也要能跑**：追踪器的价值一半在"提醒你还没采集"，不要为了出报告编数据；
- 候选打分是**采样规则**，不是市场结论：它只回答"今天这个时间点，哪些方向值得先试"。
- **封面必须从"无字幕干净成片"取帧**：直接拿最终成片抽帧，会把已烧的双语字幕一起拍进去，与封面标题叠成两层文字。
  实测更惨：第 2 秒正好是 BBB 片头标题卡（白底蓝大字），封面"标题 + 片头大字 + 字幕"三层糊成一团、完全不可用。
  现在的流程是 `render_16x9_clean` / `render_9x16_clean` → `pick_cover_frame` → `make_cover` → `check_cover`。
- **封面字号不能只按 H 算**：竖屏 1080×1920 时 `H*0.085` = 163px，9 个汉字约 1467px > 1080，文字被裁到只剩中间几个字。
  `make_cover.mjs` 已改为"按宽度估宽 → 超宽先缩字号、再折两行"；`check_cover.mjs` 的 `safe_margin` 会兜住这类溢出。
- **雷达的关键词采集会被风控**：B 站搜索接口可能整批返回 HTML（实测一期 5 个关键词全失败）。
  趋势以榜单差分为准，报告里必须显式标注缺失项，**不能当成"热度归零"**。
