# 图生图 / 图像编辑 i2i（35 接口）

> Modality：`IMAGE:imageUrls*14` —— Gemini 系最多 14 图输入。象限见上级 README（A 开源扩散 / B 闭源扩散 / C 多模态 LLM）。🎯=本账号可走通道。

## 分档

| 档 | 模型 | 接口 | 象限 |
| --- | --- | --- | --- |
| 旗舰 | Nano Banana Pro Ultra | `rhart-image-n-pro-official/edit-ultra` | C |
| 旗舰 | Qwen-Image 3.0 Pro | `alibaba/qwen-image-3.0-pro/image-edit` | A |
| 旗舰 | 万相 2.7 pro | `alibaba/wan-2.7/image-edit-pro` | A |
| 旗舰 | Seedream v5 Pro | `seedream-v5-pro/image-to-image` | B |
| 标准 | **Gemini 3.1 Flash（Nano Banana 2 系）** | `rhart-image-n-g31-flash-official/image-to-image` | C |
| 标准 | Qwen-Image 2.0 / 2.0 Pro / 3.0 / 3.0 Pro | `alibaba/qwen-image-2.0/image-edit`、`alibaba/qwen-image-2.0-pro/image-edit`、`alibaba/qwen-image-3.0/image-edit`、`alibaba/qwen-image-3.0-pro/image-edit` | A |
| 标准 | 即梦 4.6 | `bytedance/jimeng-4.6/image-to-image` | B |
| 标准 | Luma Uni-1 / Uni-1 Max | `luma/uni-1/image-edit`、`luma/uni-1-max/image-edit` | B |
| 标准 | RH 图像 v1 官方 | `rhart-image-v1-official/edit` | ? |
| 标准 | Gemini g-2 / g-3 / g-4 | `rhart-image-g-2/image-to-image`、`rhart-image-g-3/image-to-image`、`rhart-image-g-4/image-to-image` | C |
| 标准 | Higgsfield Soul | `higgsfield/soul/image-to-image` | B |
| 标准 | 即梦 4.6 编辑 | `bytedance/jimeng-4.6/image-to-image` | B |
| 快速 | Gemini 3.1 Flash Lite | `rhart-image-n-g31-flash-lite-official/image-to-image` | C |
| 快速 | Seedream v5 lite | `seedream-v5-lite/image-to-image` | B |
| 快速 | 万相 2.5 preview | `alibaba/wan-2.5-preview/image-to-image` | A |
| 开源本地 | **FLUX 系**（🎯 AI App Flux3图像编辑） | 市场通道 `2114585366186516481` | A |

## 本目录技能

| 技能 | 状态 | 说明 |
| --- | --- | --- |
| `i2i-probe/` | 在役 | 图生图固定变量实验台（Flux3 通道），run/measure/sheet + 判据 reference |
| `flux3-edit/` | 待退役 | 同通道旧实验台，度量口径已被 i2i-probe 覆盖；独有「坑 5 条」待并入后删除 |

## 本账号通道（实测）

| 通道 | ID | 模型 | 价 | 行为特征 |
| --- | --- | --- | --- | --- |
| AI App | `2114585366186516481` | FLUX（A） | 20.06/次出 2 张 | 保画风最强、seed 不暴露、景别不听（scale 1.00） |
| Workflow | `2027204046305628162` | Gemini 3.1 Flash（C） | 1k 50.26 / 2k 75.5 | 听指令（景别 1.31）、seed 可控、可整图直传 |
| Workflow | `2103270694288183297` | Qwen-Image 2.1（A） | 推断 20–50 | 31 本地节点，未实测 |

AI App 备选（未测）：image2.5 `2113087716001927170`（已知贵且糊）、Seedream-v5.5 `2120340341193793538`、Qwen-Image-2.1-Turbo `2112022164944801794`；`2121913480642125825`（qwenimage2.1turbo编辑）无提示词入口，排除。

## 判据

- 保画风重绘 → FLUX（A，10/张）
- 语义编辑（改景别/换装/加删物体）→ Gemini 3.1 Flash（C）
- 多图合成/参考一致性 → Gemini 系（14 路输入）或 H3 多参考（视频侧）
