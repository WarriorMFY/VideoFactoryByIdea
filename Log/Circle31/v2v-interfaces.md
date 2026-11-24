# RunningHub「视频生视频」接口清单（2026-11-24 只读探查）

> 来源：本地 `capabilities.json`（端点快照 2026-08-18，用 `Log/Circle31/v2v_capabilities.py` 抽取）+ 官方标准模型价目页（2026-11-24 抓取，存 `standard-model-pricelist.txt`，解析脚本 `v2v_price.py`）。
> 价格是**标准模型 API 的目录价（人民币），不是积分**；本账号 `apiType=NORMAL`，标准 API 一律返回 `1014 标准模型API仅限企业级-共享API Key调用`，以下价格为「若升级企业级」的参考。

## 〇 先用一句话搞清楚两件事

| 通道 | 能不能用 | 有没有价格目录 |
| --- | --- | --- |
| 标准模型 API（下表全部） | **不能**（1014） | 有，官方价目页 |
| AI 应用（webapp） | 能（走积分） | **没有**价格接口（10 条候选路径均 404）；但站内搜索 `/api/search/workflow` + `tags:[标签id]` 可用，可拉全类目并拿 webappId——实际通道清单见 `v2v-channels.md`（8720 条，26/40 热门可 API 调） |

## 一 指令编辑 video-edit（给视频 + 一句指令，改内容）

| 接口 | 特长 | 目录价（5s 折算） |
| --- | --- | --- |
| 可灵视频编辑 o1 `kling-video-o1-std/edit-video` | 自然语言像素级重构，无需遮罩/关键帧，可选参考图、保留原声 | **¥6.3 / 次** |
| 可灵 o3 std `kling-video-o3-std/video-edit` | 3–15s 局部改（换物/换背景/改风格/改天气），时空一致 | ¥0.81/秒（≈¥4.05） |
| 可灵 o3 pro `kling-video-o3-pro/video-edit` | 同上，最多 4 张参考图，电影级后制品质 | ¥1.08/秒（≈¥5.40） |
| HappyHorse 1.0 `alibaba/happyhorse-1.0/video-edit` | 阿里指令编辑：局部改、保结构保运动；720P/1080P；**输入超 15s 截断** | ¥0.67/秒（≈¥3.35） |
| 万相2.7 `alibaba/wan-2.7/video-edit` | 文/图/视频多模态，最多 3 参考图；2–10s、720P/1080P、30fps | 页面未标价 |
| 全能视频R gen4-aleph `rhart-video-r/gen4-aleph-official/video-to-video` | Runway Aleph：换人/换景/改风格，可加参考图 | 页面未标价 |
| 全能视频X 编辑 `rhart-video-g-official/edit-video` | Grok 系编辑，官方稳定版 | 页面未标价 |
| 全能视频 Omni Flash `gemini-omni-flash/video-edit` | Gemini 系低价渠道版 | 页面未标价 |

## 二 续写 video-extend（从已有片段往后接）

| 接口 | 特长 | 目录价（5s 折算） |
| --- | --- | --- |
| PixVerse V6 续写 `pixverse-v6/extend` | 分析片尾，运动与风格无缝延续 | ¥0.16/秒（≈¥0.80） |
| 万相2.7 续写 `alibaba/wan-2.7/video-extend` | 基于首段无缝生成后续，可长接 | ¥0.51/秒（≈¥2.55） |
| FLUX 3 视频续生 `rhart-video-flux3/video-to-video` | 从末帧续写，5–20s 可调、hd/fhd、**可同时出音轨**、有 draft 模式 | 页面未标价 |
| SkyReels V3 续写·单镜头 `skyreels-v3/single-shot-video-extension` | 单镜头内延长 | 页面未标价 |
| SkyReels V3 续写·镜头切换 `skyreels-v3/shot-switching-video-extension` | 续写时自动切镜，可做「下一镜」 | 页面未标价 |
| 全能视频 V3.1 fast/pro 扩展、全能视频X 续写 | 官方稳定版延长 | 页面未标价 |

## 三 动作迁移 motion-control（视频里的动作 → 套到一张图的角色上）

| 接口 | 特长 | 目录价（5s 折算） |
| --- | --- | --- |
| 万相2.2 角色动作迁移 `wan-2.2-animate`（页名「万相 2.2 角色动作迁移」） | 单图换人、完整保留动作/场景/时长，最长 30s | **¥0.24/秒（≈¥1.20）** |
| 即梦 动作模仿 2.0 | 字节动作捕捉迁移 | ¥0.32/秒（≈¥1.60） |
| kling v2.6 std `kling-v2.6-std/motion-control` | 轻量动作迁移 | ¥0.35/秒（≈¥1.75） |
| kling v2.6 pro `kling-v2.6-pro/motion-control` | 更高保真动作迁移 | ¥0.56/秒（≈¥2.80） |
| 可灵动作控制 V3.0 std/pro/4k | 可灵最新动作控制 | ¥0.81 / ¥1.08 / ¥2.7 每秒 |

## 四 转场 / 特效 / 风格化

| 接口 | 特长 | 目录价 |
| --- | --- | --- |
| PixVerse V6 转场 `pixverse-v6/transition` | 两张图之间生成过渡视频 | ¥0.16/秒（≈¥0.80/5s） |
| PixVerse C1 / V5.5 转场 | 同族旧版 | 页面未标价 |
| PixVerse V5.5 / V6 特效 `pixverse-v6/effects` | 给视频加特效 | 页面未标价 |
| SkyReels V3 视频风格化 `skyreels-v3/video-restyling` | 7 种固定风格：辛普森/乐高/剪纸/毛线/动森/梵高/像素 | 页面未标价（输入视频 ≤100MB） |

## 五 修复类（改「质」不改「内容」）

| 接口 | 特长 | 目录价 |
| --- | --- | --- |
| RH 视频超分+插帧一体 `rhart-video`（RH Upscale） | 指定分辨率/倍率/目标帧率 | **¥0.05/秒（≈¥0.25/5s）** |
| RH 视频超分 / RH 帧率增强 | 拆开做超分、提帧 | 页面未标价 |
| Topaz Proteus / Starlight / Astra / 放大 / 补帧 / 降噪 | 老片修复、降噪、放大 | 页面未标价 |
| 火山字幕擦除·标准 `volc-subtitle-erase/video` | 去硬字幕 | **¥0.005/秒（≈¥0.025/5s）** |
| 火山字幕擦除·精细化 `volc-subtitle-erase-pro/video` | 去得更干净 | **¥0.013/秒（≈¥0.065/5s）** |

## 六 多模态（一段素材里同时编辑 + 续写）

| 接口 | 特长 | 目录价 |
| --- | --- | --- |
| seedance2.0 `rhart-video/sparkvideo-2.0/multimodal-video` | 文本 + 图（≤9）+ 视频（≤3 段）+ 音频（≤3 段），4–15s，支持视频编辑与续写 | ¥0.6/秒（≈¥3.00/5s） |
| seedance2.0-Fast | 同上，速度档 | ¥0.5/秒（≈¥2.50） |
| seedance2.0-Mini | 同上，成本档（原生 480p/720p） | **¥0.3/秒（≈¥1.50）** |
| seedance2.5（含 global）/Token | 最多 30 图 + 10 视频 + 10 音频，按 Token 计费 | 按 token，无单价 |

## 七 对口型 lip-sync

| 接口 | 特长 | 目录价 |
| --- | --- | --- |
| 可灵对口型 `kling-lip-sync/lip-sync-video` | 视频 + 音频 → 口型帧级同步 | ¥0.35 / 5 秒 |
| Kling V2 Std/Pro 数字人口播 | 单图 + 音频 → 口播视频 | ¥0.36 / ¥0.72 每秒 |

## 八 对本片的用法（锈日 · 25s · 1056×608）

| 想要 | 首选 | 5s 成本 |
| --- | --- | --- |
| 改某镜内容（如把镜 3 拉回暖色调） | 可灵 o3 std | ≈¥4.05 |
| 把镜 5 往后接 5s | PixVerse V6 续写 | ≈¥0.80 |
| 用现成动作视频驱动锚图角色 | 万相2.2 动作迁移 | ≈¥1.20 |
| 成片整体提清晰度/补帧 | RH 超分+插帧 | ≈¥0.25 |
| 批量低成本试错 | seedance2.0-Mini | ≈¥1.50 |

> 以上全部是标准 API 目录价；本账号不可调用。若走 webapp 通道，只能按积分实跑记账，无法预先比价。
