# 文生图 t2i（42 接口）

> 分档：pro/ultra=旗舰；无后缀=标准；fast/turbo/lite=快速。`-official` 为平台官方稳定渠道。🎯=本账号可走通道。象限见上级 README（A 开源扩散 / B 闭源扩散 / C 多模态 LLM）。

## 分档

| 档 | 模型 | 接口 | 象限 |
| --- | --- | --- | --- |
| 旗舰 | Qwen-Image 3.0 Pro | `alibaba/qwen-image-3.0-pro/text-to-image` | A/B |
| 旗舰 | Nano Banana Pro（Gemini 3 Pro Image） | `rhart-image-n-pro-official/text-to-image-ultra` | C |
| 旗舰 | Seedream v5 Pro | `seedream-v5-pro/text-to-image` | B |
| 旗舰 | 悠船 v8.2（MJ 系） | `youchuan/text-to-image-v82` | B |
| 旗舰 | Luma Uni-1 Max | `luma/uni-1-max/text-to-image` | B |
| 标准 | **Gemini 3.1 Flash** | `rhart-image-n-g31-flash-official/text-to-image` | C |
| 标准 | Qwen-Image 2.0 / 2.0 Pro / 3.0 | `alibaba/qwen-image-2.0/text-to-image`、`alibaba/qwen-image-2.0-pro/text-to-image`、`alibaba/qwen-image-3.0/text-to-image` | A |
| 标准 | Gemini g-3 / g-4 | `rhart-image-g-3/text-to-image`、`rhart-image-g-4/text-to-image` | C |
| 标准 | 万相 2.7（+pro） | `alibaba/wan-2.7/text-to-image`、`alibaba/wan-2.7/text-to-image-pro` | A |
| 标准 | 即梦 4.6 | `bytedance/jimeng-4.6/text-to-image` | B |
| 标准 | Seedream v4 / v4.5 / v5 lite | `seedream-v4/text-to-image`、`seedream-v4.5/text-to-image`、`seedream-v5-lite/text-to-image` | B |
| 标准 | 悠船 v6 / v61 / v7 / v8.1 / niji6 / niji7 | `youchuan/text-to-image-*` | B |
| 标准 | Nano Banana Pro（非 ultra） | `rhart-image-n-pro-official/text-to-image` | C |
| 快速 | Gemini 3.1 Flash Lite | `rhart-image-n-g31-flash-lite-official/text-to-image` | C |
| 快速 | 悠船 v8.2 fast / turbo | `youchuan/text-to-image-v8.2-fast`、`youchuan/text-to-image-v8.2-turbo` | B |
| 快速 | 万相 2.5 preview | `alibaba/wan-2.5-preview/text-to-image` | A |

## 本目录技能

| 技能 | 说明 |
| --- | --- |
| `t2i-probe/` | 文生图固定变量实验台（通道 `2046794551444119554`，G-2.0 低价版），无锚版度量：尺寸核对 + 清晰度/色彩 + 镜像对称度 |

## 本账号通道（在役，实测）

| 通道 | ID | 模型 | 节点 | 价（实测） |
| --- | --- | --- | --- | --- |
| AI App（主通道） | `2046794551444119554`（全能图片G-2.0-文生图-低价渠道版） | G-2.0（B 象限） | `18:prompt`、`18:aspectRatio`（短形式）、`18:resolution`（1k/2k/4k） | (16:9·1k) 10.72–12.10/张，均值 11.67；(3:4·1k) 11.23，输出 880×1184 |
| AI App（第二档） | `2061698064745852930` | G-2.0 高价档（B） | 同上 | 19.60/张（+77%），**无镜像倾向** |
| Workflow | `2027204046305628162`（全能图片V2） | Gemini 3.1 Flash（C） | 整图直传 | 1k 50.26 / 2k 75.5 |
| Workflow | `2103270694288183297`（Qwen-Image 2.1 一体） | Qwen-Image 2.1（A） | 31 本地节点 | 推断 20–50 |

- ⚠️ 主通道副作用：**倾向镜像对称构图**（Circle4 §33.4）；不对称动作卡用第二档或走 i2i 通道
- 主通道边界：仅 3 节点，无图输入，做不了 img2img/inpainting（Circle15）
- 历史验证：Circle4（11.08）→ Circle8（runs 采样）→ Circle10 free（880×1184）→ Circle11 六张（11.05–11.65）→ Circle12（10.90）→ Circle13/21/23 沿用；产物实例 `Log/Circle11/文生图/terrain-huangfeng-valley/`

## 备注

- `rhart-image-n-g31-flash-official` 即本圈「全能图片V2」的底座模型（Nano Banana 2 系）
- 文本渲染需求优先 C 象限（Gemini 系）；画风/审美需求优先 B 象限悠船（MJ 系）
