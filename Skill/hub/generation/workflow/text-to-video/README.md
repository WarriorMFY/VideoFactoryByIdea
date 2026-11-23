# 文生视频 t2v（60 接口）

> 象限见上级 README（A 开源扩散 / B 闭源扩散 / C 多模态 LLM）。视频均为扩散 DiT 系；闭源占多。🎯=本账号可走通道（t2v 暂无直接 AI App 实测，优先市场工作流转发）。

## 分档

| 档 | 模型 | 接口 | 象限 |
| --- | --- | --- | --- |
| 旗舰 | 可灵 v3.0 Pro / o3-pro | `kling-v3.0-pro/text-to-video`、`kling-video-o3-pro/text-to-video` | B |
| 旗舰 | 可灵 4K 双雄（v3-4K / o3-4K） | `kling-v3-4k/text-to-video`、`kling-video-o3-4k/text-to-video` | B |
| 旗舰 | Seedance 2.0 | `rhart-video/sparkvideo-2.0/text-to-video` | B |
| 旗舰 | Seedance 2.5 | `bytedance/seedance-2.5-token/text-to-video`、`bytedance/seedance-2.5-global-token/text-to-video` | B |
| 旗舰 | Gemini 视频官方（Veo 系） | `rhart-video-g-official/text-to-video`、`rhart-video-g-official/text-to-video-v1.5` | B/C |
| 旗舰 | Sora 官方 Pro | `rhart-video-s-official/text-to-video-pro` | B |
| 旗舰 | Vidu Q3 Pro | `vidu/text-to-video-q3-pro` | B |
| 旗舰 | 海螺 H3 | `minimax/hailuo-h3/text-to-video` | A（开源但重） |
| 旗舰 | 万相 2.7 | `alibaba/wan-2.7/text-to-video` | A |
| 标准 | 可灵 v2.6 / o1 / v3.0-std | `kling-v2.6-std/text-to-video`、`kling-video-o1/text-to-video`、`kling-v3.0-std/text-to-video` | B |
| 标准 | Seedance 2.0 Global | `bytedance/seedance-2.0-global/text-to-video` | B |
| 标准 | 万相 2.6 | `alibaba/wan-2.6/text-to-video` | A |
| 标准 | 海螺 2.3 / 02（std/pro） | `minimax/hailuo-2.3/t2v-standard`、`minimax/hailuo-02/t2v-pro` 等 | B |
| 标准 | Vidu Q3 | `vidu/text-to-video-q3` | B |
| 标准 | PixVerse v5.6 / v6 | `pixverse-v5.6/text-to-video`、`pixverse-v6/text-to-video` | B |
| 标准 | RH 视频 v3.1-pro | `rhart-video-v3.1-pro-official/text-to-video` | ? |
| 快速 | Sparkvideo 2.0 fast / mini | `rhart-video/sparkvideo-2.0-fast/text-to-video`、`rhart-video/sparkvideo-2.0-mini/text-to-video` | B |
| 快速 | Seedance 2.0 global-fast / mini、1.5-pro-fast | `bytedance/seedance-2.0-global-fast/text-to-video`、`bytedance/seedance-2.0-global-mini/text-to-video`、`seedance-v1.5-pro/text-to-video-fast` | B |
| 快速 | 可灵 v2.5-turbo-std / v3-turbo | `kling-v2.5-turbo-std/text-to-video`、`kling-v3-turbo-std/text-to-video` | B |
| 快速 | Vidu q3-turbo / q3-pro-fast | `vidu/text-to-video-q3-turbo`、`vidu/text-to-video-q3-pro-fast` | B |
| 快速 | 海螺 02-fast | `minimax/hailuo-02/t2v-*fast`（fast 档） | B |
| 快速 | LTX-2 | `rhart-video/ltx-2/text-to-video-lora` | A |
| 快速 | FLUX3 Video | `rhart-video-flux3/text-to-video` | A |
| 快速 | PixVerse c1 | `pixverse-c1/text-to-video` | B |
| 快速 | Gemini Omni Flash | `gemini-omni-flash/text-to-video` | C |

## 本目录技能

| 技能 | 说明 |
| --- | --- |
| `t2v-probe/` | 文生视频固定变量实验台（通道 `2085304953094107137`，H3 加速版），无锚版度量：时长偏差 + 3×3 分区运动 + 事件完成度 |

## 本账号通道（在役，实测）

| 通道 | ID | 模型 | 节点 | 价（实测） |
| --- | --- | --- | --- | --- |
| AI App | `2085304953094107137`（加速版-MiniMax H3） | H3（A 象限但 32B TE 重） | 提示词 `250:prompt`（字段是 prompt）、比例 `115:aspect_ratio`、分辨率 `225:select`（1=480P / 2=720P）、时长 `205:select`（1=5s … 11=15s，每秒一档） | (480P·5s) 10.54–24.33/条，同参数会跳档；9s 22.61–29.58；Circle11 锁 5s=17.00、9s=23.63 |

- 其它位：`231`–`239:image` 9 个多参参考图位、`247`–`249:audio` 3 个音频位（语义未验）
- ⚠️ 参数陷阱：`205:select=5` 不是 5 秒（index 5 = 9s）；`1` 才是 5s
- 历史验证：Circle4–6、Circle10–12（Task `2122309321877577729` → 640×832 / 124 帧 / 5.17s）；Circle11 产物 `Log/Circle11/文生视频/terrain-huangfeng-valley/`；Circle15 评估切段方案后舍弃 t2v 转走 i2v
- 备用形态：市场检索「文生视频」标签后走 Workflow 整图直传（方法见 `../image-to-video/wf-firstlast/`）
- 低成本试探建议：Wan 系（A 象限，本地权重）> FLUX3 Video > 闭源 fast 档

## 备注

- 视频价格随 时长 × 分辨率 × 帧率 浮动，同接口可差 3–5 倍
- 4K 档（kling-*-4k）为最贵子集；`token` 后缀（seedance-2.5-token）按 token 计费，长片更贵
