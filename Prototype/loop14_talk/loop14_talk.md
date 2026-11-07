# loop14_talk/ — 对标优化：名人 AI 演讲 × 双语高亮字幕

> 用对标公式（名人 AI 言论 × 悬念标题 × 长片）替换技巧类选题，验证「选题公式切换是否抬升冷启动水位」；顺带把摘要形态与导航通道产品化。
> 关键结果：上线 10 条全部 tid=231 回读通过；李飞飞单条冷启动即拉到对标量级。
> 回链：[AGENTS.md §3.3](../../AGENTS.md) · [循环日志 #loop14](../../History/CircleLog/log.md#loop14) · [Prototype 索引](../Prototype.md)

## 目录内容

| 子目录 | 职责 | 成片 |
|---|---|---|
| `ep_a/` | 李飞飞采访长片 + 双语逐词高亮字幕 | BV113xW6VEv6（15:02） |
| `ep_b/` | 李开复长片 | BV1tKxW62EhT（14:32） |
| `ep_c/` | 苏莱曼长片 | BV1oSxp6tEPQ（21:34） |
| `ep_d/` | 奥尔特曼长片 | BV19Gxp6XE4T（47:16） |
| `ep_e/` | 马斯克长片 | BV1fwxp68EQB（52:38） |
| `ep_a_digest/` | EP-A 3 分钟中文摘要（`make_digest` 产物） | BV1yvxs61Eaw（2:51） |
| `ep_b_digest/` | EP-B 摘要 | BV1cCxs63ESU（2:56） |
| `ep_c_digest/` | EP-C 摘要 | BV1qDxs6vEUS（2:59） |
| `ep_d_digest/` | EP-D 摘要 | BV1rCxs6gEEb（2:52） |
| `ep_e_digest/` | EP-E 摘要 | BV1HCxs63EwV（2:40） |

每个 `ep_*` 内含成片 mp4、字幕 ass、spec/manifest 与 QC 抽帧；摘要目录另含 `spec.json`（音画同步模型：转场恰落在句间静音）。

## 这轮得到的结论

- **人物名气是唯一自变量**：同 UP、同格式、同分区的 19 条视频，播放 47 → 18178 三级跳，唯一变量是人物名气 × 言论冲击力。
- **核心资产已被市场验证**：对标热评第一（31 赞）表扬的正是我们流水线已具备的双语逐词高亮字幕——差距在选题与包装，不在技术。
- **TED HLS 字幕有 3.5s 预卷占位段**（首条 EXTINF 对应 segment=-2），按 i↔segment 拼 URL 会让每片丢掉前段 cue，五片偏移实测 3.504 / 3.567 / 3.558 / 3.456 / 3.609s，**必须按片标定**。已上线 4 条长片仍带此字幕洞，人明确不重发。
- **摘要形态是低成本高杠杆**：一条 3 分钟摘要 ≈ 4 分钟算力，且天然给长片导流，形成「短视频钓鱼 + 长片沉淀」自环。

## 复现与档案

- 单条流水线：`node Tool/ops/ted_episode.mjs`（ASR → 偏移标定 → 对齐 → 中译 → 字幕 → EDL → 渲染，约 9 分 45 秒/条）
- 摘要：`node Tool/ops/make_digest.mjs <spec>`
- 档案与判卷材料在 `History/loops/loop14/`（plan / bench / publish_log / net_probe / t1_readiness + 各 ep manifest）
