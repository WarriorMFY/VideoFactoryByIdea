# EP-E 素材档案 · 埃隆·马斯克 TED2022 现场对谈

> 2026-11-01 11:05–11:45。小循环 14 WP4.6 第三条（批量三条之 3/3）。

## 选题理由

1. **名气天花板**：Elon Musk，中文互联网认知度最高的科技人物。
2. 话题密度大：收购 Twitter 数小时后登台（当时全网焦点）+ Optimus 首次深度谈 + AI 监管。
3. 53:05 最长片档，测长片全链（上传/渲染/时长档）。

## 来源

| 物 | 来源 | 落袋 |
| --- | --- | --- |
| 元数据 | `ted.com/talks/elon_musk_elon_musk_talks_twitter_tesla_and_how_his_brain_works_live_at_ted2022`（pm 7789，3185.4s） | `Workspace/tmp/ted_batch/musk/` |
| 视频 720p | `hls.ted.com/project_masters/7789`（f11+f12） | `talk_720p.mp4`（841MB） |
| 字幕 | en 983 cue / zh-cn 989 cue | `cues_en.json` / `cues_zh-cn.json` |

## 全链记录

| 步骤 | 结果 |
| --- | --- |
| ASR | 8377 词 / conf 0.9203（五片最低：现场环境音 + 多人对话） |
| 偏移标定 | **+3.609s**（497 句命中；五片实测 3.504/3.567/3.558/3.456/3.609，跨度 153ms） |
| 中译直灌 | 轮1 948 命中 4 缺失 → merge 并回 4 碎片 → 轮2 **948 句 0 缺失** |
| 剪辑 | 28 处，3185.4s → 3157.2s（52:37） |
| 全链 | 34 分 37 秒（与 EP-D 渲染并行抢 CPU） |
| 画面验证 | 400s / 1200s / 2400s / 2600s / 2900s 帧全部正常同步 |

## 发布

- 标题：**《马斯克：人形机器人会比汽车更大，多数人还没意识到》**（原话 "People have no idea, this is going to be bigger than the car"）
- 封面：成片 2600s 帧（马斯克近景 + 双语字幕）
- 分区：tid 231 + htype 1011
