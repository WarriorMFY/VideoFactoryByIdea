# opus_epe — 马斯克「摘要动态」图文

小循环 4（批量补动态）产物之一。**动态**：https://t.bilibili.com/1265675468585041929（2026-11-01 发布，回读已可见）

- 4 张竖版卡片（1080×1440）+ 总结性文字（394 字）+ 原片/摘要双链接（平台自动转视频卡片）
- 原片：BV1fwxp68EQB ｜ 摘要：BV1HCxs63EwV
- 卡片底图来自 TED HLS 定点抓帧（`Tool/ops/ted_frame.mjs`，pm 7789，本地无源片也能出画面）
- spec：`History/loops/opus_batch/cards_epepe.json` ｜ 文案：`dyn.txt`

复现：`node Tool/ops/make_opus_cards.mjs --spec History/loops/opus_batch/cards_epepe.json --out Prototype/opus_epe/cards`
→ `node Tool/ops/post_dynamic.mjs post --text-file Prototype/opus_epe/dyn.txt --image ...`
