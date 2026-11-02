# 小循环：摘要动态（2026-11-01 16:48 发起，17:10 收尾）

人指令：从已发布作品中选一个生成"摘要动态"（图文+总结性文字），动态内附原片与摘要视频链接。

## 决策与执行

| 步骤 | 结果 |
| --- | --- |
| 选片 | 李飞飞（跟踪报告播放第 1：长片 32 播；双片齐全，导流收益最大） |
| 卡片 | make_opus_cards（新工具）4 张 1080×1440，帧位 frame_sheet 16 格复核；首版页脚 emoji 豆腐块 → 去 emoji 重出 |
| 文案 | 5 要点总结，素材取自 sample_ep_a/digest.json（口径与摘要片一致），488 字 |
| 发布 | post_dynamic（新工具）：upload_bfs 传 4 图 → create/dyn（scene=2）→ dyn_id=1265664404724121605 → 回读列表已可见 |
| 目检 | 详情页截图：正文完整、两个链接自动转视频卡片、4 图 2×2 网格 ✓ |

## 接口事实（新沉淀）

- 上传：POST `x/dynamic/feed/draw/upload_bfs`（multipart `file_up`，`category=daily`，`biz=new_dyn`，csrf）
- 发布：POST `x/dynamic/feed/create/dyn?platform=web&csrf=`，JSON `{dyn_req:{content,scene:2,pics,upload_id}}`
- `upload/image` 端点不存在（404）；正文 B 站链接自动转视频卡片
