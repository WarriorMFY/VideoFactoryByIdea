# 市场调研 · 社区 webapp 工作流（2026-11-24，只读零积分）

> 结论一句话：视频生视频在 RunningHub 上真正能跑的是**社区 webapp 工作流**（8720 条、13 族），标准模型 API 走不通；webapp 没有价目接口，费用只能实跑记账。

## 一、怎么拉（可复现的接口口径）

站内搜索是 **POST**，不是市场列表：

```text
POST /api/search/workflow
headers: Content-Type=application/json, Authorization=<KEY>,
         User-Agent=<桌面 UA>, Origin/Referer=https://www.runninghub.cn
body: {"current":1, "size":100, "tags":["1871131343570333697"]}
→ data.total=8720, data.records[]：id/name/desc/labels/tags/owner/statisticsInfo/covers/publishTime
```

- `tags` 是唯一生效的筛选字段：「视频生视频」标签 id `1871131343570333697`（记录里 `tags[].name=视频生视频, labels=Video-to-Video`）。
- **关键词无效**：`keyword / searchContent / searchKey / title / query / name / searchText` 八个字段名全试，total 恒为 93319（全库），不筛。
- `size` 支持 100；8720 条 87 页拉完。`total` 返回字符串，需转 int。
- 详情：`POST /api/portal/workflow/detail {"workflowId": id}` → `webappId`（有值才能按 app 调）、`usedModels`（背后模型）、`nodeCount`、`tags`。
- **没有 webappId 的工作流只能网页复制自跑**，不能脚本调。

## 二、13 族分布（按名称+描述正则归类，8720 条）

| 族 | 条数 | 合计使用 | 族内最热（使用量） |
| --- | --- | --- | --- |
| 其他/通用（H3 导演台、动作+运镜混合） | 2190 | 515328 | YZ金鱼-MiniMax H3 终极篇（34583） |
| 换脸/替换人物 | 1356 | 380369 | Wan2.2 Animate 人物替换（23112） |
| 动作迁移/模仿 | 1218 | 377609 | Animate动作迁移V9（106156） |
| 编辑/改内容 | 823 | 160612 | VIP-Wan视频编辑高级版 V5.2（31014） |
| 多图/参考融合 | 775 | 221553 | Seedance2.0 全能参考（61300） |
| 超分/清晰化 | 667 | 136596 | MiniMax-H3 二采 4K 直出（4911） |
| 对口型/配音 | 607 | 200961 | Wan2.1-infinitetalk（45087） |
| 首尾帧过渡 | 297 | 45800 | MiniMax H3 全能参考生视频（3836） |
| 去字幕/水印 | 255 | 84320 | LTX2.3 去水印去字幕（21934） |
| 风格化/转绘 | 222 | 95665 | wan2.1 视频编辑重绘 V4（28818） |
| 插帧/补帧 | 169 | 59630 | SeedVR2（27736） |
| 视频续写/延长 | 75 | 16130 | SVIpro 视频延长（2021） |
| 修复/去噪 | 66 | 19184 | 竖版动态水印消除 V6（2843） |

## 三、有 webappId 的代表通道（top40 中 26/40）

| 用途 | 代表（使用量） | webappId | 特长 | 背后模型 |
| --- | --- | --- | --- | --- |
| 动作迁移 | Animate动作迁移V9（106156） | `1975951975441412098` | 参考姿态/网舞套到主体，自动尺寸 | Wan2.2-Fun-InP + Pusa LoRA |
| 动作迁移·长 | Wan animate 49s/1500帧（7716） | `2001911147597033473` | 长视频动作迁移 | Wan2.2-Animate + Uni3C |
| 动作+运镜 | SCAIL+SDPose+Uni3C（18102） | `2001263065679134721` | 动作与镜头运动一起迁 | Wan21-SCAIL + Uni3C |
| 换脸/换头 | 最强换脸+换头 Animate（11440） | `1969708911165140993` | 保留动作换头 | Animate 14B + Pusa |
| 多角色替换 | Wan Animate+OneToAll（11015） | `1999097095606988802` | 多角色同框替换 | Animate + OneToAll |
| 换背景 | 视频替换背景 V2（8988） | `1959877429286350849` | 抠主体换背景 | VAE + umt5 |
| 换人（H3） | 海螺H3 人物替换 V2（5858） | `2092692214110572545` | H3 系编辑，自带 upscaler | MiniMax H3 fl2va |
| 指令编辑 | 全能视频X-编辑-官方稳定版（11997） | `2061766338393231361` | 官方稳定版，指令改内容 | 官方节点 |
| 全能参考 | Seedance2.0 全能参考-创建ID（61300） | `2037365179167543298` | 参考图+视频重生成，可建角色 ID | Seedance 2.0 |
| 导演台 | MiniMax H3 导演台全能（29977） | `2088047189137383426` | H3 全家桶（含音频 VAE） | MiniMax H3 |
| 对口型 | Wan2.1-infiniteTalk（45087） | `1960302724606849025` | 任意视频改口型，时长不限 | InfiniteTalk + Wan2.1 |
| 对口型·快 | latentsync1.5（6749） | `1909595055735406593` | 唇齿同步快 | LatentSync 1.5 |
| 超分+补帧 | SeedVR2（27736） | `1990029249488801793` | 放大 + RIFE 补帧一体 | SeedVR2 3B + rife47 |
| 风格化 | wan 吉卜力风格转绘（7561） | `1919234546913710082` | VACE 视频转绘 | VACE-1.3B |

## 四、无 webappId（只能复制工作流自跑）

top40 里 14 条，典型：VIP-Wan 视频编辑高级版 31014、wan2.1 视频编辑重绘 28818、Wan2.2 Animate 人物替换 23112、LTX2.3 去水印去字幕 21934、MINIMAX-H3 工作流合集 16939、SVI 续写系列。

启示：**使用量高 ≠ 能调**。挑选时先看 detail 的 webappId 是否为空。

## 五、费用为什么只能实跑

试过 10 条候选价格路径，全 404：`/api/portal/webapp/{detail,info,getDetail,price,get}`、`/api/portal/template/{detail,info}`、`/api/portal/workflow/webapp`、`/api/openapi/webapp/detail`（后者 412 TOKEN_INVALID）。detail 里无 price/cost/fee/coin 字段。

- 页面上的「运行消耗」不进 API。
- 唯一可靠办法：跑一条，读余额接口的差。
- 估算锚：`i2v-probe` 通道 5s/0.6MP 实扣 21.4 积分；Animate 类多节点重工作流按 2–3 倍估。

## 六、挑选纪律

1. 先看 webappId（有才能脚本化）→ 再看使用量 → 最后看背后模型。
2. 一族只挑一条做代表，先跑最便宜的（超分/去水印档）量真实实扣，再决定重工作流。
3. 一条一账，与 `runninghub/` 的记账纪律一致。
