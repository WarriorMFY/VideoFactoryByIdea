# sample_ep_a — 完整样例：李飞飞 TED2024《With spatial intelligence, AI will understand the real world》

> 这是用本包链路做出的第一条完整样例（源仓库小循环 14 · EP-A，2026-11-01）。
> 两个成品 + 全部中间产物，用于对照学习与链路冒烟。

## 成品

| 片 | 文件 | 时长 | 内容 |
| --- | --- | --- | --- |
| 长片（双语逐词高亮） | `longform/final.mp4` | 15:02 | TED 原声 + 官方 en/zh-cn 字幕对齐烧录，英文逐词卡拉OK高亮，中文行随句显示，自动删减 |
| 摘要（中文解说） | `digest/final.mp4` | 2:51 | 30 段原创解说（Edge TTS 云扬）× 原片精选帧 Ken Burns，7 章角标 + 右上「原片 mm:ss」 |
| 封面 | `digest/cover.jpg` | — | 暗紫底 + 原片近景嵌入帧 + 黄字主标题 +「摘要报告」角标 |
| 抽检条 | `digest/check_strip.jpg` | — | 每 6 秒一帧的成片抽检拼图（视觉验收基准） |

线上版：长片 `BV113xW6VEv6`、摘要 `BV1yvxs61Eaw`（与随包成片同源，可对照）。

## 文件地图

```text
sample_ep_a/
├── README.md                 本文件
├── longform/                 长片（成品 + 决策产物）
│   ├── final.mp4
│   ├── cover.jpg / report.md / edits.json / signals.json   vfactory 的剪辑决策与质检
│   └── runlog.jsonl                                        渲染过程留痕
├── digest/                   摘要（成品 + 全部物料）
│   ├── final.mp4 / cover.jpg
│   ├── digest.json           ★ 摘要 spec（30 段解说 × src 帧位 + 片头尾卡）——写新稿就抄这个格式
│   ├── manifest.json         ★ 章节 → 原片时间映射（导航表数据源）
│   ├── digest.ass / zh.srt   字幕物料
│   ├── desc_publish.txt      发布简介（含 7 章 ?t= 跳转表）
│   ├── pin_comment.txt       置顶评论（逐章跳转表）
│   ├── ep_a_comment.txt      长片侧导流评论文案
│   └── check_strip.jpg       成片抽检条
└── talk.meta.json            素材档案（pm 9260 / 清单 URL / fps / 授权记录）
```

## 复现（拿一条新演讲照抄这套动作）

```bash
# 1) 素材入袋（本样例 pm=9260）
node Tool/ops/ted_fetch.mjs --pm 9260 --out Workspace/tmp/ted_feifei
# 2) 长片（~10 分钟）
node Tool/ops/ted_episode.mjs --dir Workspace/tmp/ted_feifei --out Prototype/ep_feifei
# 3) 写稿原料 + 选帧
node Tool/ops/trace_text.mjs --dir Workspace/tmp/ted_feifei --bucket 45
node Tool/ops/frame_sheet.mjs --video Workspace/tmp/ted_feifei/talk_720p.mp4 --out survey.jpg --every 40
# 4) 摘要（digest.json 抄本目录格式改写）
node Tool/ops/make_digest.mjs --spec Prototype/ep_feifei/digest.json --out Prototype/ep_feifei_digest
# 5) 审计
bash Tool/ops/kb_audit.sh Prototype/ep_feifei_digest/final.mp4   # sd < 0.30 为合格（样例基线 0.19）
```

## 本样例的导航通道（做给观众的部分）

- 摘要每段右上角标「原片 mm:ss」；简介 7 章 `?t=` 跳转链接；置顶评论逐章跳转表（`pin_comment.txt`）。
- 长片侧置顶评论挂摘要链接（`ep_a_comment.txt`）。
- 数据源是 `digest/manifest.json` 的 `chapters[]`（digest_t / src_t），写个循环就能生成跳转表。

## 已知边界

- 摘要画面是静帧 + 动效、无原声（版权红线：摘要体不搬运原声，原声卖点由长片承担）。
- 帧位写死在 spec，换素材必须重挑（`frame_sheet` 两步法）。
- TED 许可为 CC BY-NC-ND：本样例发布经人授权，跟随发布时同样需要人确认（见 `Idea/Idea.md` 红线）。
