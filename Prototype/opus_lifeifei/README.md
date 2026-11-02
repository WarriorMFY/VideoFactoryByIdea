# opus_lifeifei — 李飞飞演讲「摘要动态」图文

小循环 3 产物：从已发布作品中选播放最高的李飞飞演讲（长片 32 播），生成一条图文动态导流。

## 成品

- **动态**：https://t.bilibili.com/1265664404724121605（2026-11-01 17:04 发布，回读已可见）
- 内容：总结性文字（5 条要点 + 观点钩子）+ 4 张竖版卡片（1080×1440）
  + 两个视频链接（发布后自动转为带标题的卡片）
  - 原片：BV113xW6VEv6（15:02，中英双语逐词字幕）
  - 摘要：BV1yvxs61Eaw（2:51，右上角标原片时间）

## 选片依据

跟踪报告（`History/publish/bilibili/track/report.md`）按播放排序：李飞飞长片 32 播为全站最高，
且长片+摘要双片齐全——动态导流收益最大。文案素材直接取自 `Prototype/sample_ep_a/digest/digest.json`
（不新写观点，保证与摘要片口径一致）。

## 复现步骤

```bash
# 1) 生成 4 张卡片（spec: History/loops/opus_lifeifei/cards.json，帧位经 frame_sheet 复核）
node Tool/ops/make_opus_cards.mjs --spec History/loops/opus_lifeifei/cards.json --out Prototype/opus_lifeifei/cards

# 2) 发图文动态（先传图 upload_bfs，再建动态 create/dyn，自动回读空间动态列表校验）
node Tool/ops/post_dynamic.mjs post \
  --text-file Prototype/opus_lifeifei/dyn.txt \
  --image Prototype/opus_lifeifei/cards/card_01.jpg \
  --image Prototype/opus_lifeifei/cards/card_02.jpg \
  --image Prototype/opus_lifeifei/cards/card_03.jpg \
  --image Prototype/opus_lifeifei/cards/card_04.jpg
# 校验已有动态：
node Tool/ops/post_dynamic.mjs verify --dyn-id 1265664404724121605
```

## 本轮新增工具

| 工具 | 作用 |
| --- | --- |
| `Tool/ops/make_opus_cards.mjs` | 竖版图文卡片渲染（frame + 深色面板 + kicker/标题/要点/页脚，自动折行与标题缩字号） |
| `Tool/ops/post_dynamic.mjs` | B 站图文动态发布（`post` / `verify`），接口与坑见源码头注释 |

## 踩坑记录

- SimHei 无 emoji 字形，页脚的 👇 渲染成豆腐块——卡片文案禁用 emoji（正文动态不受影响，浏览器渲染）。
- 动态图片上传端点是 `x/dynamic/feed/draw/upload_bfs`（`file_up` 字段），不是 `upload/image`（404）。
- 正文里的 B 站视频链接会被平台自动转成带标题的卡片，无需 `attach_card`。
