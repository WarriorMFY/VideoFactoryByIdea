# ep_hastings — Reed Hastings × Sal Khan「Why AI is an even bigger deal than you think」

小循环 7 产物（2026-11-01）。**首个无官方中译、全篇 agent 精译的片子。**

- 长片 **BV1Qbxb6KE2S**《Netflix 创始人：10 亿美元砸进教育没搞定，AI 三年给出答案》16:22（成片 981.8s，ASR 3013 词 conf 0.945，偏移 3.593s，精译直灌 325/325 命中，删减 3 处）
- 摘要 **BV1DYxb6eEFs**《10 亿美元没搞定教育，AI 三年给答案｜TED 摘要 3 分钟》2:22（33 段 / 7 章，sd=0.14 合格）
- 动态 dyn_id=1265746481571168257（4 卡 + 双链接）
- 双向导航：摘要置顶 = 7 章节跳转表；长片置顶 = 摘要导流

## 本轮实验（对应赛道调研建议）

1. **情绪标题**：主标题用"10 亿美元砸进教育没搞定，AI 三年给出答案"（钩子+悬念），摘要标题同风格
2. **教育/英语标签**：投稿标签加入 `教育` `英语听力`（赛道最大流量池的搜索词）
3. **合集**：工具 `Tool/ops/season.mjs` 已就绪，但创建被拒（code 20082）——合集功能需**电磁力（创作力）等级 Lv2**，新账号暂无配额，待升级后重试

## 复现

```bash
node Tool/ops/ted_fetch.mjs --pm 11864 --out Workspace/tmp/ted_hastings   # 官方中译 404，只有 en
node Tool/ops/ted_subs.mjs --pm 11864 --lang en --out Workspace/tmp/ted_hastings --offset 0
# 精译通道：trans_src.txt（cue 导出）→ 人工/agent 逐条翻译 trans_zh.txt → 合并生成 cues_zh-cn.json
node Tool/ops/ted_episode.mjs --dir Workspace/tmp/ted_hastings --out Prototype/ep_hastings
node Tool/ops/make_digest.mjs --spec Prototype/ep_hastings_digest/digest.json --out Prototype/ep_hastings_digest
node Tool/ops/post_dynamic.mjs post --text-file Prototype/opus_hastings/dyn.txt --image ...card_0N.jpg
```

## 关键教训

- **素材下载**：ffmpeg 顺序拉 TED HLS 对高码率片（16min/372MB）实测 86 分钟未完；`Tool/ops/hls_get.mjs`（并发 16 抓分段 + concat 复用）同等工作 **48 秒**。长片素材抓取以后一律走它。
- **精译注入**：ted_fetch 缺官方 zh 时只需在 `--dir` 下放自译的 `cues_zh-cn.json`（时间戳复用 en cue），流水线其余环节零改动。
