# EP-D 素材档案 · 山姆·奥尔特曼 TED2025 现场对谈

> 2026-11-01 10:57–11:30。小循环 14 WP4.6 第二条（批量三条之 2/3）。

## 选题理由

1. **OpenAI CEO**：当下 AI 话题第一人，TED2025 官方播放 2.86M。
2. 访谈体但信息密度高：AGI 定义、智能体信任、软件工程被重写、安全团队离职、权力边界。
3. 47:29 长片档（对标公式同款时长带）。

## 来源

| 物 | 来源 | 落袋 |
| --- | --- | --- |
| 元数据 | `ted.com/talks/sam_altman_openai_s_sam_altman_talks_chatgpt_ai_agents_and_superintelligence_live_at_ted2025`（pm 10110，2849.7s） | `Workspace/tmp/ted_batch/altman/` |
| 视频 720p | `hls.ted.com/project_masters/10110`（f11+f12） | `talk_720p.mp4`（530MB） |
| 字幕 | en 1008 cue / zh-cn 887 cue | `cues_en.json` / `cues_zh-cn.json` |

## 全链记录

| 步骤 | 结果 |
| --- | --- |
| ASR | 8598 词 / conf 0.9459 |
| 偏移标定 | **+3.456s**（653 句命中，401 句 3.5s 桶 + 61 句 3.0s 桶，分布更散——访谈语速不匀） |
| 对齐 | 1008 句 |
| 中译直灌 | 轮1 920 命中 72 缺失 → merge 并回 73 碎片（992→919 句）→ 轮2 **919 句 0 缺失** |
| 剪辑 | 17 处，2849.7s → 2835.4s（47:15） |
| 全链 | 31 分 32 秒（与 EP-E 渲染并行抢 CPU，正常 20 分钟内） |
| 画面验证 | 600s / 900s 帧：双语同步、逐词高亮正常 |

## 发布

- 标题：**《奥尔特曼：AI 超越人类只是时间问题》**（TED 官方简介 "AI will almost certainly outpace human intelligence" 背书）
- 封面：成片 900s 帧（Altman 近景 + "一下午干完两年工作"双语字幕）
- 分区：tid 231 + htype 1011
