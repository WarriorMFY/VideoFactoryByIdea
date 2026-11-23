# 常用功能 × 态度档矩阵（模型接口全景，Circle27）

> 来源：`Log/Circle21/catalog_by_task.json`（平台 Model API 目录，45 类任务的官方菜单）+ 本圈实测 + Circle24 应用记录。
> **重要**：这套 Model API 我们账号用不了（apiType=NORMAL，调则 1014）；但**市场里的 AI 应用/工作流全部基于这些模型**，所以它是"能力菜单"。可走通道 = 市场 AI App / Workflow（标 🎯）。
> 档位按命名推断：pro/ultra/4k=旗舰；无后缀=标准；fast/turbo/lite/mini=快速。`official` = 平台官方稳定渠道，首选。

## 一、文生图（t2i，42 接口）

| 档 | 模型 | 接口 | 备注 |
|---|---|---|---|
| 旗舰 | Qwen-Image 3.0 Pro | `alibaba/qwen-image-3.0-pro/text-to-image` | 阿里最新 |
| 旗舰 | Nano Banana Pro（Gemini 3 Pro Image） | `rhart-image-n-pro-official/text-to-image-ultra` | 谷歌旗舰 |
| 旗舰 | Seedream v5 Pro | `seedream-v5-pro/text-to-image` | 字节 |
| 旗舰 | 悠船 v8.2（MJ 系） | `youchuan/text-to-image-v82` | 审美向 |
| 旗舰 | Luma Uni-1 Max | `luma/uni-1-max/text-to-image` | |
| 标准 | **Gemini 3.1 Flash** | `rhart-image-n-g31-flash-official/text-to-image` | 🎯 全能图片V2 同族底座 |
| 标准 | Qwen-Image 2.0 / 2.0 Pro / 3.0 | `alibaba/qwen-image-2.0[-pro]/text-to-image` | |
| 标准 | Gemini g-3 / g-4 | `rhart-image-g-3/g-4/text-to-image` | |
| 标准 | 万相 2.7（+pro） | `alibaba/wan-2.7/text-to-image[-pro]` | |
| 标准 | 即梦 4.6 | `bytedance/jimeng-4.6/text-to-image` | |
| 标准 | Seedream v4.5 / v5 lite | `seedream-v4.5|v5-lite/text-to-image` | |
| 快速 | Gemini 3.1 Flash Lite | `rhart-image-n-g31-flash-lite[-official]/text-to-image` | 最便宜一档 |
| 快速 | 悠船 v8.2 fast/turbo | `youchuan/text-to-image-v8.2-fast|turbo` | |
| 快速 | 万相 2.5 preview | `alibaba/wan-2.5-preview/text-to-image` | |

## 二、图生图 / 图像编辑（i2i，35 接口）

| 档 | 模型 | 接口 | 备注 |
|---|---|---|---|
| 旗舰 | Nano Banana Pro Ultra | `rhart-image-n-pro-official/edit-ultra` | |
| 旗舰 | Qwen-Image 3.0 Pro | `alibaba/qwen-image-3.0-pro/image-edit` | |
| 旗舰 | 万相 2.7 pro | `alibaba/wan-2.7/image-edit-pro` | |
| 旗舰 | Seedream v5 Pro | `seedream-v5-pro/image-to-image` | |
| 标准 | **Gemini 3.1 Flash（Nano Banana 2 系）** | `rhart-image-n-g31-flash-official/image-to-image` | 🎯 本圈实测：1k 50.26 / 2k 75.5 |
| 标准 | Qwen-Image 2.0/3.0（+pro） | `alibaba/qwen-image-2.0|3.0[-pro]/image-edit` | 🎯 市场有本地版工作流 |
| 标准 | 即梦 4.6 / Luma Uni-1 | `bytedance/jimeng-4.6/image-to-image` | |
| 标准 | RH 图像 v1 官方 | `rhart-image-v1-official/edit` | |
| 标准 | Gemini g-2 / g-3 / g-4 | `rhart-image-g-2|3|4/image-to-image` | |
| 快速 | Gemini 3.1 Flash Lite | `rhart-image-n-g31-flash-lite[-official]/image-to-image` | |
| 快速 | Seedream v5 lite / 万相 2.5 preview | `seedream-v5-lite` / `wan-2.5-preview/image-to-image` | |
| 开源本地 | FLUX 系列 | AI App「Flux3图像编辑」`2114585366186516481` | 🎯 实测 ≈20/次出 2 张（10/张） |

## 三、文生视频（t2v，60 接口）

| 档 | 模型 | 接口 | 备注 |
|---|---|---|---|
| 旗舰 | 可灵 v3.0 Pro / o3-pro / v3-4k / o3-4k | `kling-v3.0-pro|video-o3-pro|kling-v3-4k|video-o3-4k/text-to-video` | 4K 档最贵 |
| 旗舰 | Seedance 2.0 | `rhart-video/sparkvideo-2.0/text-to-video` | 字节旗舰 |
| 旗舰 | Seedance 2.5 | `bytedance/seedance-2.5-token/text-to-video` | |
| 旗舰 | Gemini 视频官方 | `rhart-video-g-official/text-to-video[-v1.5]` | Veo 系 |
| 旗舰 | Sora 官方 Pro | `rhart-video-s-official/text-to-video-pro` | |
| 旗舰 | Vidu Q3 Pro / 海螺 H3 / 万相 2.7 | `vidu/text-to-video-q3-pro`、`minimax/hailuo-h3/text-to-video` | |
| 标准 | 可灵 v2.6 / o1 / v3.0-std | `kling-v2.6-std|video-o1|v3.0-std/text-to-video` | |
| 标准 | Seedance 2.0 Global | `bytedance/seedance-2.0-global/text-to-video` | |
| 标准 | 万相 2.6 / 2.7 | `alibaba/wan-2.6|2.7/text-to-video` | |
| 标准 | 海螺 2.3 / 02 / Vidu Q3 / PixVerse v6 | 各厂商 std/pro 档 | |
| 快速 | Sparkvideo 2.0 fast/mini | `rhart-video/sparkvideo-2.0-{fast,mini}` | |
| 快速 | Seedance 2.0 global-fast/mini、1.5-pro-fast | `bytedance/seedance-...` | |
| 快速 | 可灵 v2.5-turbo、Vidu q3-turbo | `kling-v2.5-turbo-std` 等 | |
| 快速 | LTX-2 / FLUX3 Video / 海螺 02-fast / PixVerse c1 | `rhart-video/ltx-2`、`rhart-video-flux3` | 🎯 市场有 Seedance2.0 Fast 工作流 |

## 四、图生视频·首帧（i2v，72 接口）

| 档 | 模型 | 接口 | 备注 |
|---|---|---|---|
| 旗舰 | 可灵 4K 系（v3-4k / o3-4k） | `kling-v3-4k/image-to-video` | |
| 旗舰 | Seedance 2.0 / 2.5-token | `rhart-video/sparkvideo-2.0`、`seedance-2.5-token` | |
| 旗舰 | Sora Pro / Runway Gen-4 Turbo / 海螺 H3 / 万相 3.0 | `rhart-video-s-official/...pro`、`rhart-video-r/gen4-turbo-official`、`alibaba/wan-3.0/image-to-video` | |
| 标准 | Seedance 2.0 Global / 万相 2.7·2.6 / 可灵 v2.6 / Vidu Q3 / 海螺 2.3·02 / PixVerse v6 | 各 std/pro | |
| 快速 | Sparkvideo fast/mini、Seedance global-fast/mini、万相 2.6-flash、vidu q2-turbo、pixverse-c1、海螺 02-fast、FLUX3 Video、Gemini Omni Flash | 各 fast/mini | |
| 开源本地 | Wan2.1-VACE-14B | 🎯 市场工作流 `1922977171818598402`（AI App `1923002381888311297`） | 预计视频最便宜档 |
| 官方 API | Seedance 2.0 Fast | 🎯 市场工作流 `2037041277312704514`（AI App `2037048115194236930`） | |

**首尾帧专项**（first+last 同时吃）：
- 海螺 02 系：`minimax/hailuo-02/{standard,pro,fast}`（modality 明确 firstImageUrl+lastImageUrl）
- PixVerse 转场：`pixverse-v6/transition`（首尾图直接转场）
- 多数 i2v 接口（Seedance/Kling/Wan/Vidu）文档支持 `lastFrameUrl` 可选
- 🎯 本仓已跑通：市场首尾帧模板 `1967630045374287873`（Circle21）

## 五、图生视频·多图参考（reference-to-video，25 接口）

| 档 | 模型 | 接口 | 备注 |
|---|---|---|---|
| 旗舰 | 可灵 o3-pro / o3-4k / o3-std / o1-std | `kling-video-o3-*/reference-to-video`（注意官方拼写 refrence） | 最多 7 图参考 |
| 旗舰 | Vidu Q3 全家（q3/q3-pro/q3-mix/q3-drama/q3-ad） | `vidu/reference-to-video-q3*` | 短剧/广告向 |
| 旗舰 | 万相 3.0 / 2.7、RH 视频 v3.1-pro 官方 | `alibaba/wan-3.0|2.7/reference-to-video` | |
| 标准 | 万相 2.6、SkyReels v4 omni-std、快乐马 1.0/1.1、PixVerse c1 | `alibaba/wan-2.6/reference-to-video` 等 | |
| 快速 | 万相 2.6-flash、SkyReels v4 fast、Seedance v1 lite、RH v3.1-fast | 各 flash/fast/lite | |
| 本地大模型 | MiniMax H3 多参考 | 🎯 市场工作流 `2092878871120142337`（AI App `2093984226331938818`） | 32B 文本编码器，重、贵 |
| 本地大模型 | MiniMax H3 导演台 | 🎯 市场工作流 `2084788947984666625`（AI App `2088047189137383426`） | |

## 我们账号的通道对照（可实际调用）

| 功能 | 通道 | ID | 模型 | 实测价 |
|---|---|---|---|---|
| 图生图 | AI App | 2114585366186516481 | FLUX（开源权重） | 20.06/次（2张） |
| 图生图 | Workflow | 2027204046305628162 | Gemini 3.1 Flash | 1k 50.26 / 2k 75.5 |
| 图生图 | Workflow | 2103270694288183297 | Qwen-Image 2.1（本地） | 推断 20–50 |
| 图生图 | AI App | 2113087716001927170 / 2120340341193793538 / 2112022164944801794 | image2.5 / Seedream-v5.5 / Qwen-Image-2.1-Turbo | 未测（image2.5 已知贵且糊） |
| 图生视频·首帧 | Workflow | 1922977171818598402 | Wan2.1-VACE-14B | 推断 100–300/条 |
| 图生视频·首帧 | Workflow | 2037041277312704514 | Seedance 2.0 Fast | 推断 150–400/条 |
| 图生视频·首尾 | Workflow | 1967630045374287873 | 首尾帧模板（Circle21） | 未测 |
| 图生视频·多参考 | Workflow | 2092878871120142337 | MiniMax H3 | 推断 200–500/条 |

## 六、按模型固有变量重排（架构 × 权重归属）

> 决定能力形状的是**架构范式**（纯扩散 DiT / 原生多模态 LLM），决定价格基准的是**权重归属**（开源自托管=GPU 秒 / 闭源 API=厂商定价）。两者相乘即价格，架构决定"能听什么指令"。

### 象限 A：纯扩散 DiT · 开源权重（最便宜，吃 GPU 秒）

| 模态 | 模型 | 接口/通道 | 备注 |
|---|---|---|---|
| 图 | FLUX 系（BFL） | `rhart-image/f-dev`、🎯 AI App Flux3图像编辑 | 10/张实测；保画风强、听指令弱 |
| 图 | Qwen-Image 2.x（阿里开源） | `alibaba/qwen-image-2.0/image-edit`、🎯 工作流 2103270694288183297 | 20–50 推断 |
| 图 | z_image turbo | 🎯 市场工作流 1995894229622800386（配套） | 极便宜小模型 |
| 视频 | Wan 系 2.5/2.6/2.7/3.0（阿里开源） | `alibaba/wan-*/...` | 视频便宜档 |
| 视频 | Wan2.1-VACE-14B | 🎯 工作流 1922977171818598402 | 预计视频最低价 |
| 视频 | MiniMax H3（2026-08 开源） | 🎯 工作流 2092878871120142337 / 2084788947984666625 | 开源但重（32B TE），价近闭源 |
| 视频 | LTX-2 / SkyReels v3/v4 / Hunyuan3D | `rhart-video/ltx-2`、`skyreels-*`、`hunyuan3d-*` | |

**能力形状**：画风保真强、空间控制强（mask/pose/depth）、**seed 可控可复现**；语义推理弱（"中景"听不懂——Flux3 scale 1.00 实证）。

### 象限 B：纯扩散 DiT · 闭源 API（厂商定价，中贵）

| 模态 | 模型 | 接口 | 备注 |
|---|---|---|---|
| 图 | Seedream v4/v4.5/v5（字节） | `seedream-v5-pro`、`seedream-v5-lite` | 字节自研 |
| 图 | 即梦 4.6（火山） | `bytedance/jimeng-4.6` | |
| 图 | 悠船 v6–v8.2（MJ 系） | `youchuan/text-to-image-*` | 审美向 |
| 视频 | 可灵全家（v2.5→v3-4K、o1/o3） | `kling-*` | 4K 档最贵 |
| 视频 | Seedance 全家（1.5→2.5） | `rhart-video/sparkvideo-2.0*`、`bytedance/seedance-*` | |
| 视频 | 海螺 02/2.3、Vidu Q2/Q3、PixVerse、快乐马、Sora、Runway Gen-4、Veo（rhart-video-g） | 各厂接口 | 闭源 DiT 黑盒 |

**能力形状**：同扩散系——画风/运镜强，语义遵循中等（大厂商多加了 LLM 提示词增强），seed 通常不暴露或部分暴露，价格 50–600/条。

### 象限 C：原生多模态 LLM · 闭源（token 计价，最贵但最听话）

| 模态 | 模型 | 接口/通道 | 备注 |
|---|---|---|---|
| 图 | Gemini 3.1 Flash（Nano Banana 2 系） | `rhart-image-n-g31-flash[-official]`、🎯 工作流 2027204046305628162 | 1k 50.26 / 2k 75.5 实测；**景别 scale 1.31 实证会执行** |
| 图 | Nano Banana Pro（Gemini 3 Pro Image） | `rhart-image-n-pro-official`（+ultra） | 旗舰，最贵 |
| 图 | Gemini g-2/g-3/g-4 | `rhart-image-g-*` | 谷歌图像几代 |

**能力形状**：语义编辑强（会推理"改什么/怎么改"）、多图参考理解强（*14 图输入）、文字渲染强；**seed 不暴露不可复现**、无 mask/pose 等空间控制、按 token/图计价。

### 能力形状对照（本圈实证）

| 能力维度 | 扩散 DiT | 多模态 LLM |
|---|---|---|
| 画风保真（复刻原图） | 强 | 强 |
| 语义编辑（景别/动作/加减物） | 弱（只重绘） | **强（1.31 推近实证）** |
| 可复现（seed） | **强（显式可控）** | 弱（不暴露） |
| 空间控制（mask/pose） | **强** | 弱 |
| 多参考图输入 | 中（1–3 路） | **强（至 14 路）** |
| 文字渲染 | 弱（FLUX.2 改善） | **强** |

### 价格公式

```
图价 ≈ 归属(开源:GPU秒≈10–50 | 闭源DiT:50–80 | 闭源LLM:50–75→旗舰更贵)
视频价 ≈ 归属 × 体量 × 时长/分辨率
      (开源≈100–300 | 闭源DiT≈150–600 | 4K/H3重载最高)
```

**结论**：选"便宜"= 选象限 A；选"听话（能听懂镜头语言）"= 选象限 C；选"厂商生态/特定运镜"= 象限 B。三者不可兼得，这是模型本体的固有边界，不是通道差异。
