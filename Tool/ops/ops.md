# ops/ — 市场运营侧（侦查 / 交付包 / 反馈追踪）

> 工厂不只管"做出来"，还要能回答"做给谁、怎么交付、有没有效果"。这个目录放的是市场侧的稳定动作。
> 原则同 `Tool/` 全局：**只读公开数据、不代登录、不编数据**。

## 文件

| 脚本 | 作用 |
| --- | --- |
| `recon_bilibili.mjs` | **市场侦查**：B 站公开接口（`ranking/v2`、`popular`、`search/type`）→ 样本池 + 分区/时长分布 + 关键词市场 + 候选选题打分（题材匹配 × 热度 × 互动 × 交付成本），输出 `market_report.md` + `market_raw.json` |
| `make_episode.mjs` | **造交付样片素材**：Edge TTS 合成英语口播 + CC-BY 画面循环铺满 → `source.mp4` + `ground_truth.json`（逐句时间码），用于验证"工厂→交付包"而不碰版权 |
| `make_cover.mjs` | **封面生成**：从成片抽帧 + 主标题/副标题/角标（CJK 走 `font=SimHei`，避免方块） |
| `track_feedback.mjs` | **反馈追踪**：读 `feedback.csv` 快照 → 完播率/点赞率/收藏率/评论率/千播涨粉 + 环比 + **规则化迭代动作**（P0/P1/P2）。空数据时明确输出"待采集"；`--selftest` 用合成数据验证规则（输出标 DRY-RUN） |

## 最短链路

```powershell
# 1) 侦查：今天市场上什么火、我们能不能快速做
node Tool\ops\recon_bilibili.mjs --out History\loops\loop12 --top 60
# 2) 造样片素材（合成口播 + 循环画面）
node Tool\ops\make_episode.mjs --script Deliverables\ep01_editing_tips\script_en.txt --out Deliverables\ep01_editing_tips
# 3) 工厂链路（识别→对齐讲稿→精译→字幕→烧入）见 Prototype\loop12_market_loop\reproduce.ps1
# 4) 封面
node Tool\ops\make_cover.mjs --video <成片.mp4> --out cover.jpg --title "..." --sub "..." --tag "..."
# 5) 反馈
node Tool\ops\track_feedback.mjs --csv Deliverables\ep01_editing_tips\feedback.csv
```

## 坑

- **B 站搜索接口偶发返回 HTML**（风控页），要按 JSON 解析失败处理并继续，不要让整轮侦查挂掉；
- **合片时必须显式 `-map`**：画面源自带音轨（配乐），ffmpeg 默认流选择会挑它，成片里就不是刚合成的口播（实测 ASR 0 词）；
- **反馈表空着也要能跑**：追踪器的价值一半在"提醒你还没采集"，不要为了出报告编数据；
- 候选打分是**采样规则**，不是市场结论：它只回答"今天这个时间点，哪些方向值得先试"。
