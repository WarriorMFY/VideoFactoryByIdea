# 标准模型 API 目录 · 视频家族（快照 2026-08-18 端点 / 2026-11-24 价目）

> 全部走 `/openapi/v2/...`，**本账号 apiType=NORMAL 一律返回 `1014 标准模型API仅限企业级-共享API Key调用`**，不能跑。
> 价格是官方价目页的**目录价（人民币）**，不是积分；仅作「若升级企业级」的比价参考。

## 一 指令编辑 video-edit（视频 + 一句指令改内容）

| 接口 | 特长 | 目录价（5s 折算） |
| --- | --- | --- |
| 可灵 o1 std `kling-video-o1-std/edit-video` | 自然语言像素级重构，无需遮罩，可留原声 | **¥6.3 / 次** |
| 可灵 o3 std `kling-video-o3-std/video-edit` | 3–15s 局部改（换物/换背景/风格/天气） | ¥0.81/秒（≈¥4.05） |
| 可灵 o3 pro `kling-video-o3-pro/video-edit` | 同上，≤4 参考图，电影级 | ¥1.08/秒（≈¥5.40） |
| HappyHorse 1.0 `alibaba/happyhorse-1.0/video-edit` | 局部改、保结构保运动，输入 >15s 截断 | ¥0.67/秒（≈¥3.35） |
| 万相2.7 `alibaba/wan-2.7/video-edit` | 文/图/视频多模态，≤3 参考图，2–10s | 未标价 |
| 全能视频R gen4-aleph `rhart-video-r/gen4-aleph-official/video-to-video` | Runway Aleph：换人/换景/改风格 | 未标价 |
| 全能视频X 编辑 `rhart-video-g-official/edit-video` | Grok 系，官方稳定版 | 未标价 |
| Omni Flash `gemini-omni-flash/video-edit` | Gemini 系低价渠道 | 未标价 |

## 二 续写 video-extend

| 接口 | 特长 | 目录价 |
| --- | --- | --- |
| PixVerse V6 `pixverse-v6/extend` | 分析片尾，运动与风格无缝延续 | ¥0.16/秒（≈¥0.80） |
| 万相2.7 `alibaba/wan-2.7/video-extend` | 基于首段无缝续，可长接 | ¥0.51/秒（≈¥2.55） |
| FLUX 3 `rhart-video-flux3/video-to-video` | 从末帧续写 5–20s，可同时出音轨 | 未标价 |
| SkyReels V3 单镜头 `skyreels-v3/single-shot-video-extension` | 单镜头内延长 | 未标价 |
| SkyReels V3 切镜 `skyreels-v3/shot-switching-video-extension` | 续写时自动切镜 | 未标价 |

## 三 动作迁移 motion-control（视频动作 → 套到单图角色）

| 接口 | 特长 | 目录价 |
| --- | --- | --- |
| 万相2.2 `wan-2.2-animate` | 单图换人、保动作/场景/时长，≤30s | **¥0.24/秒（≈¥1.20）** |
| 即梦 动作模仿 2.0 | 字节动作捕捉迁移 | ¥0.32/秒（≈¥1.60） |
| kling v2.6 std `motion-control` | 轻量动作迁移 | ¥0.35/秒（≈¥1.75） |
| kling v2.6 pro `motion-control` | 更高保真 | ¥0.56/秒（≈¥2.80） |
| 可灵动作控制 V3.0 std/pro/4k | 最新动作控制 | ¥0.81 / ¥1.08 / ¥2.7 每秒 |

## 四 转场 / 特效 / 风格化

| 接口 | 特长 | 目录价 |
| --- | --- | --- |
| PixVerse V6 转场 `pixverse-v6/transition` | 两图之间生成过渡视频 | ¥0.16/秒（≈¥0.80） |
| PixVerse V5.5/V6 特效 | 给视频加特效 | 未标价 |
| SkyReels V3 风格化 `skyreels-v3/video-restyling` | 7 种固定风格（辛普森/乐高/剪纸/毛线/动森/梵高/像素），≤100MB | 未标价 |

## 五 修复类（改质不改内容）

| 接口 | 特长 | 目录价 |
| --- | --- | --- |
| RH 超分+插帧一体 | 指定分辨率/倍率/目标帧率 | **¥0.05/秒（≈¥0.25）** |
| RH 超分 / 帧率增强 | 拆开做 | 未标价 |
| Topaz Proteus / Starlight / Astra / 放大 / 补帧 / 降噪 | 老片修复 | 未标价 |
| 火山字幕擦除·标准 `volc-subtitle-erase/video` | 去硬字幕 | ¥0.005/秒（≈¥0.025） |
| 火山字幕擦除·精细化 `volc-subtitle-erase-pro/video` | 去得更干净 | ¥0.013/秒（≈¥0.065） |

## 六 多模态（编辑 + 续写一体）

| 接口 | 特长 | 目录价 |
| --- | --- | --- |
| seedance2.0 `rhart-video/sparkvideo-2.0/multimodal-video` | 文本+图≤9+视频≤3+音频≤3，4–15s | ¥0.6/秒（≈¥3.00） |
| seedance2.0-Fast | 速度档 | ¥0.5/秒（≈¥2.50） |
| seedance2.0-Mini | 成本档（480p/720p） | **¥0.3/秒（≈¥1.50）** |
| seedance2.5 | ≤30 图+10 视频+10 音频 | 按 Token，无单价 |

## 七 对口型 lip-sync

| 接口 | 特长 | 目录价 |
| --- | --- | --- |
| 可灵对口型 `kling-lip-sync/lip-sync-video` | 视频+音频→帧级口型 | ¥0.35 / 5 秒 |
| Kling V2 Std/Pro 数字人口播 | 单图+音频→口播视频 | ¥0.36 / ¥0.72 每秒 |

## 八 典型成本（若可用）

| 想要 | 首选 | 5s 成本 |
| --- | --- | --- |
| 改某镜内容/色调 | 可灵 o3 std | ≈¥4.05 |
| 成片往后接 5s | PixVerse V6 续写 | ≈¥0.80 |
| 现成动作驱动角色图 | 万相2.2 动作迁移 | ≈¥1.20 |
| 整片提清晰度/补帧 | RH 超分+插帧 | ≈¥0.25 |
| 批量低成本试错 | seedance2.0-Mini | ≈¥1.50 |

> 以上全部不可调（1014）。想用同等能力，走 webapp 通道（见 `market-survey.md`），代价是只能按积分实跑、无法预比价。
