# 图生视频 i2v（三模式：首帧 / 首尾 / 多图参考）

> 象限见上级 README（A 开源扩散 / B 闭源扩散 / C 多模态 LLM）。🎯=本账号可走通道。

## 本目录技能

| 技能 | 覆盖模式 | 说明 |
| --- | --- | --- |
| `i2v-probe/` | 首帧 | MiniMax H3 通道（webapp `2113790012012720129`），分区度量+运动曲线+retime+dashboard |
| `wf-firstlast/` | 首尾帧 | VACE-Fun 整图直传（Workflow API），双锚 NCC/SSIM 判读 |

## 本账号通道（在役，实测）

| 通道 | ID | 模型 | 节点 | 价（实测） |
| --- | --- | --- | --- | --- |
| AI App（首帧） | `2113790012012720129`（MiniMax+H3+首帧图生视频） | H3（A 象限但 32B TE 重） | 首帧 `140:image`（**唯一图位，无尾帧入口**；`231` 是多参位，喂首帧无效）、提示词 `142:value`（字段名是 value）、时长 `133:value`（FLOAT step 0.1，可写任意秒）、比例 `115:aspect_ratio`、分辨率 `115:megapixels`（0.6 为最低常用档） | (3:4·0.6MP·5s) 21.42/条，672×928/124 帧；(16:9·0.6MP·5s) 28.05/条，1056×608/124 帧；0.92MP 档 37–47 |
| Workflow（首尾帧） | `1904136902449209346`（占位 ID，真图在 `workflow` 字段；模板 24 节点） | Wan2.2-VACE-Fun | 首帧 `205:image`、尾帧 `204:image`（**模板标题写反，只信连线**）、提示词 `119:text`、帧数 `197:value`、宽度 `202:value` | 720 宽/49 帧/3.06s：16.32、12.75 两次（同参数不同价，只记每次实扣） |

- 首帧通道 `usage.consumeMoney` 为空，实扣在 `outputs.data[].chargedPoint`（runninghub_app.py 已回落打印 COST）
- 首帧产出 124–226 帧；21:9 时 1216×512，**左右各 122px 黑边**（剪辑侧裁成 972×512）
- 首尾帧边界：平台不允许用 API 保存自己的可复用工作流；两端锁得住（NCC 0.9788/0.9901），中段仍脑补

## 模式一：首帧（first-frame，72 接口，最大类）

Modality：`IMAGE:firstFrameUrl, IMAGE:lastFrameUrl`（多数接口首尾同吃，见模式二）。

| 档 | 模型 | 接口 | 象限 |
| --- | --- | --- | --- |
| 旗舰 | 可灵 4K 双雄 | `kling-v3-4k/image-to-video`、`kling-video-o3-4k/image-to-video` | B |
| 旗舰 | Seedance 2.0 | `rhart-video/sparkvideo-2.0/image-to-video` | B |
| 旗舰 | Seedance 2.5 | `bytedance/seedance-2.5-token/image-to-video` | B |
| 旗舰 | Sora 官方 Pro | `rhart-video-s-official/image-to-video-pro` | B |
| 旗舰 | Runway Gen-4 Turbo | `rhart-video-r/gen4-turbo-official/image-to-video` | B |
| 旗舰 | 海螺 H3 | `minimax/hailuo-h3/image-to-video` | A（重） |
| 旗舰 | 万相 3.0 / 2.7 | `alibaba/wan-3.0/image-to-video`、`alibaba/wan-2.7/image-to-video` | A |
| 标准 | Seedance 2.0 Global | `bytedance/seedance-2.0-global/image-to-video` | B |
| 标准 | 万相 2.6 | `alibaba/wan-2.6/image-to-video` | A |
| 标准 | 可灵 v2.6-std / v3.0-std | `kling-v2.6-std/image-to-video`、`kling-v3.0-std/image-to-video` | B |
| 标准 | Vidu Q3 / Q3-Pro | `vidu/image-to-video-q3-pro` 等 | B |
| 标准 | 海螺 2.3 / 02（std/pro） | `minimax/hailuo-2.3/image-to-video-pro`、`minimax/hailuo-02/i2v-pro` 等 | B |
| 标准 | PixVerse v6 / v5.6 | `pixverse-v6/image-to-video`、`pixverse-v5.6/image-to-video` | B |
| 标准 | RH 视频 v3.1-pro | `rhart-video-v3.1-pro-official/image-to-video` | ? |
| 快速 | Sparkvideo fast / mini | `rhart-video/sparkvideo-2.0-fast/image-to-video`、`rhart-video/sparkvideo-2.0-mini/image-to-video` | B |
| 快速 | Seedance global-fast / mini | `bytedance/seedance-2.0-global-fast/image-to-video`、`bytedance/seedance-2.0-global-mini/image-to-video` | B |
| 快速 | Seedance 1.5-pro-fast | `seedance-v1.5-pro/image-to-video-fast` | B |
| 快速 | 万相 2.6-flash / 2.5-preview | `alibaba/wan-2.6/image-to-video-flash`、`alibaba/wan-2.5-preview/image-to-video` | A |
| 快速 | Vidu q2-turbo / q3-turbo | `vidu/image-to-video-q2-turbo`、`vidu/image-to-video-q3-turbo` | B |
| 快速 | 海螺 02-fast / 2.3-fast | `minimax/hailuo-02/i2v-*`、`minimax/hailuo-2.3-fast/image-to-video` | B |
| 快速 | FLUX3 Video / LTX-2 | `rhart-video-flux3/image-to-video`、`rhart-video/ltx-2/image-to-video` | A |
| 快速 | PixVerse c1 / SkyReels v4-fast | `pixverse-c1/image-to-video`、`skyreels-v4/image-to-video-fast` | B |
| 快速 | Gemini Omni Flash | `gemini-omni-flash/image-to-video` | C |

**🎯 本账号通道（实测/推断）**

| 通道 | ID | 模型 | 价 | 备注 |
| --- | --- | --- | --- | --- |
| Workflow | `1922977171818598402` | Wan2.1-VACE-14B（A） | 推断 100–300 | 含 mmaudio 音轨，预计最便宜档；AI App `1923002381888311297` |
| Workflow | `2037041277312704514` | Seedance 2.0 Fast（B） | 推断 150–400 | 3 节点官方 API 工作流；AI App `2037048115194236930` |

## 模式二：首尾帧（first + last）

明确吃首尾的模型/通道：

| 模型/通道 | 接口 | 备注 |
| --- | --- | --- |
| 海螺 02 全系 | `minimax/hailuo-02/standard`、`minimax/hailuo-02/pro`、`minimax/hailuo-02/fast` | modality 明确 `firstImageUrl + lastImageUrl` |
| PixVerse 转场 | `pixverse-v6/transition`、`pixverse-v5.5-transition`、`pixverse-c1/transition` | 首尾图直接转场（无提示词编辑） |
| Seedance / Kling / Wan / Vidu 多数 i2v | 各 `/image-to-video` | 支持 `lastFrameUrl` 可选参数（具体以接口文档为准） |
| 🎯 市场首尾帧模板 | Workflow `1967630045374287873`（整图直传占位 `1904136902449209346`） | Circle21 已跑通，见 `Log/Circle21/run_workflow_direct.py` |

## 模式三：多图参考（reference-to-video，25 接口）

Modality：`IMAGE:imageUrls*7, VIDEO:videoUrl` —— 最多 7 图参考，部分接口还吃参考视频。

| 档 | 模型 | 接口 | 象限 |
| --- | --- | --- | --- |
| 旗舰 | 可灵 o3 系（o3-pro / o3-4K / o3-std / o1-std） | `kling-video-o3-pro/refrence-to-video`、`kling-video-o3-4k/refrence-to-video`、`kling-video-o3-std/refrence-to-video`、`kling-video-o1-std/refrence-to-video` | B |
| 旗舰 | Vidu Q3 全家（q3 / q3-pro / q3-mix / q3-drama / q3-ad） | `vidu/reference-to-video-q3`、`vidu/reference-to-video-q3-pro`、`vidu/reference-to-video-q3-mix`、`vidu/reference-to-video-q3-drama`、`vidu/reference-to-video-q3-ad` | B |
| 旗舰 | 万相 3.0 / 2.7 | `alibaba/wan-3.0/reference-to-video`、`alibaba/wan-2.7/reference-to-video` | A |
| 旗舰 | RH 视频 v3.1-pro 官方 | `rhart-video-v3.1-pro-official/reference-to-video` | ? |
| 标准 | 万相 2.6 | `alibaba/wan-2.6/reference-to-video` | A |
| 标准 | SkyReels v4 omni-std / v3 | `skyreels-v4/omni-reference-std`、`skyreels-v3/reference-to-video` | A |
| 标准 | 快乐马 1.0 / 1.1 | `alibaba/happyhorse-1.0/reference-to-video`、`alibaba/happyhorse-1.1/reference-to-video` | B |
| 标准 | PixVerse c1 | `pixverse-c1/reference-to-video` | B |
| 快速 | 万相 2.6-flash | `alibaba/wan-2.6/reference-to-video-flash` | A |
| 快速 | SkyReels v4 omni-fast | `skyreels-v4/omni-reference-fast` | A |
| 快速 | Seedance v1 lite | `seedance-v1-lite/reference-to-video` | B |
| 快速 | RH 视频 v3.1-fast 官方 | `rhart-video-v3.1-fast-official/reference-to-video` | ? |
| 本地大模型 | **MiniMax H3 多参考**（🎯） | 市场通道 `2092878871120142337`（AI App `2093984226331938818`） | A（32B TE 重，价近闭源） |
| 本地大模型 | **MiniMax H3 导演台**（🎯） | 市场通道 `2084788947984666625`（AI App `2088047189137383426`） | A |

## 备注

- 可灵多图参考官方拼写 `refrence-to-video`（少个 e），调用时按官方拼写
- 首尾帧的工作流形态：`wf-firstlast/`（本仓库同层技能）已封装「首帧+尾帧→视频」
- H3 系（32B 文本编码器）是开源但最重的视频模型：能力好，价格接近闭源中档，慎作批量主力
