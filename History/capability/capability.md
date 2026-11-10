# 能力来源档案 — 这条链是怎么长出来的

> 交代"为什么这么做"，避免接手的人重踩一遍。逐轮来源见下（原仓库 VideoFactory 的 `History/CircleLog/log.md`）。

| 轮 | 结论（人可复核的事实） | 留在本包里的东西 |
|---|---|---|
| loop38 | 全量抽取影之刃零 46 个处决单位（1080p60），定下"单位"这个概念与结构自检 3N+2 | `Skills/exec-extract`、`Tool/ops/exec_extract.mjs` |
| loop42 | 速度语法三档（A 克制 / B 重击 / C 抽时）+ 四层解剖；核心不变量：hit 层速率必须严格最低 | `Skills/exec-speed-grammar`、`Tool/ops/recam.mjs` |
| loop43 | 接缝分级（无缝/顺/弱匹配/转场级）；**衔接是选序不是渲染**——三梯度实验证明加过渡特效救不了跨色系硬接 | `Skills/exec-seam-stitch`、`Tool/ops/exec_seamlib.mjs` |
| loop43 | BGM 选型从"听着带感"变成可复现数字：相位搜索 + 逐 hit 误差；±50ms 全 PASS 在非公共拍时间轴上不可达 | `Tool/audio/bgm_fit.mjs`、`bgm_scan.mjs` |
| loop44 | 素材库模板：题材/素材类两层、注册表驱动校验、`license_class` 与 `tier` 两轴分离 | `Material/kinds.json` + `docs/` + `Tool/check/material_layout.mjs` |
| loop47 | 第二期实测：12 单位 52.48s，0.3x 占比 33.6%，11 缝 0 转场级；BGM 5/13 PASS。同轮发现 `bgm_scan` 批量误判"无瞬态"，**结论以 `bgm_fit` 直跑为准** | `Tool/audio/audio.md` 的口径、`Tool/ops/exec_stitch.mjs`、`bgm_mix.mjs` |
| loop48 | 迁出本包：依赖闭合验证（16 文件、0 集合外、0 解析失败）、路径零泄漏、三个缺口脚本补齐 | 整个包 |

## 被证伪过的做法（别再试）

| 做法 | 为什么不行 |
|---|---|
| 用转场特效救硬接缝 | 三梯度实验：渲染再好，跨色系/跨场景仍是"转场级"观感；只有换单位能解决 |
| 整段统一慢放 | 重量感被摊薄；慢放必须稀缺（0.3x 占比 ≤35%） |
| 按第几段映射速度 | 快杀只有三层，按索引取速会让尾层吃到 0.3x（实测虚长 3 秒） |
| 用 `bgm_scan` 批量结果下结论 | 相位搜索差异导致无瞬态曲误判；必须 `bgm_fit` 直跑复核 |
| 300px 缩略图判切点 | 近景内挥刃会被误判成切中景；切点取证 ≥560px |

## 授权与来源

- 本包代码为内部工具，随包分发不构成对外授权。
- 样例素材由 ffmpeg 合成（PD/CC0）。
- 原仓库真实素材（影之刃零 BV1ydx26rEWv）为外部版权片（`license_class=REVIEW`），**未随包**，按 `Material/docs/授权与可发布.md` 只可研究/评论引用。
