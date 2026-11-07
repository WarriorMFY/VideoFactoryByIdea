# loop23_shortfilm/ — 首部独立成片《光偷走的那两小时》

> 用自产素材 + 自建渲染器做一部**非演讲剪辑**的散文影像：睡眠史即调色史（烛光 1800K → 白炽 2700K → 荧光 4300K → LED 7500K → 晨光回暖）。
> 关键结果：2:08 / 1080p30 / 22.4MB，视频流 127.77s 校验通过；16 镜双峰节奏达成；已发布 BV1BZ4A65Ef5。
> 回链：[AGENTS.md §3.3](../../AGENTS.md) · [循环日志 #loop23](../../History/CircleLog/log.md#loop23) · [Prototype 索引](../Prototype.md)

## 目录内容

| 条目 | 内容 |
|---|---|
| `out/` | 定版成片 `final.mp4`、`manifest.json`、`publish_receipt.json`（BV1BZ4A65Ef5 / aid 117547600971623） |
| `out_repro/` | 复现产物（`--reuse-tts` 重跑，127.77s；与定版仅差 37B ≈ 逐字节一致） |
| `spec.json` | 全片 spec：逐 shot 的素材、运镜、色温、字卡与「8 类技术落点」映射 |
| `make_essay.mjs` | 渲染器冻结快照（已升格为 [Tool/ops/make_essay.mjs](../../Tool/ops/make_essay.mjs)，此处保留当时版本） |
| `render_cards.mjs` | 版式卡渲染冻结快照（已升格为 `Tool/ops/render_cards.mjs`） |
| `cards/` `cards.html` `cards_src/` | 7 张 1080p 版式卡的渲染产物与 HTML 源（标题/金句×2/双栏数据卡×2/SVG 折线/片尾） |
| `qc_sheet.jpg` | QC 16 格拼图（调色渐变 / 双栏卡 / 图表 / 花字 / 字幕 / 无水印） |
| `desc_publish.txt` | 发布文案（33 字标题、379 字简介含章节与数据来源、AI 声明） |

## 素材与纪律

- **静帧**：ImageGen 9 张 35mm 质感（约 90 credits），底部「AI 生成」水印用 `crop=1536:864` 裁除；
- **旁白**：EdgeTTS Yunjian，-10% 语速，429 退避重试；
- **BGM**：ffmpeg 合成 drone pad（55+110Hz + tremolo + 粉噪空气层），零版权风险；
- **数据**：Gallup 1942 平均 7.9h（<5h 占 3%）→ 2013 6.8h（14%）；CDC 2016 三分之一 <7h。多源核实后写进 spec。

## 8 类技术落点

①极限快切 = 开场 5 连切 0.6–0.7s；②声画同步 = 21 切点 whoosh + 章节 impact；③双峰节奏 = 0.6s 快切 vs 4–5s 卡停；④叙事调色 = 逐镜头色温；⑤镜头内运动 = zoompan 推拉平移；⑥日记字幕 = 散文旁白层；⑦双栏信息卡 = s11/s17；⑧花字 = 数字弹出。

## 这轮踩到的坑

1. EdgeTTS 429 → 退避重试 4 次；
2. `card_dir` 相对路径 × cwd 错位 → 6 个 card clip 静默漏渲染、concat 只剩 3.8s → 路径绝对化 + 全分支失败检查；
3. filter label `[voice]` 被消费两次 → asplit（坑 21 入 `Tool/ops/ops.md`）。

## 复现

```bash
node Tool/ops/make_essay.mjs --spec Prototype/loop23_shortfilm/spec.json --reuse-tts --out out_repro
```

方法论沉淀：[Skills/essay-film-production/SKILL.md](../../Skills/essay-film-production/SKILL.md)。
