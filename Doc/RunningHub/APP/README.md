# RunningHub 当前通道（AI 应用 / webapp）

> 账号 `apiType=NORMAL`，标准模型 API 一律 `1014`（仅企业级共享 Key），出图出视频全部走 AI 应用通道。
> 统一调用：`python Skill/RHClaw/runninghub/scripts/runninghub_app.py --run <webappId> --node ... -o <out>`，实例 `default`(24G)；积分以 `usage.chargedPoint` 为准。

## 一、文生图

| 项 | 值 |
| --- | --- |
| webappId | `2046794551444119554`（全能图片G-2.0-文生图-低价渠道版） |
| 参数 | 节点 `18`：`prompt` / `aspectRatio` / `resolution`（仅 1k・2k・4k，1k 最低档） |
| 积分消耗 | **10.72–12.10 / 张**（均值 11.67；3:4・1k 实测 11.23，输出 880×1184） |
| 验证 | Circle10 free，Task `2122362571318329346` |

## 二、文生视频

| 项 | 值 |
| --- | --- |
| webappId | `2085304953094107137`（加速版-MiniMax H3） |
| 参数 | `250:prompt`（字段是 `prompt`）、`115:aspect_ratio`、`225:select=1`（480P）、`205:select=1`（5s） |
| 积分消耗 | **10.54–13.26 / 条**（480P・5s，按实测；参数相同也可能落到 20.57，不按参数推算） |
| 验证 | Circle4–6、Circle10，Task `2122309321877577729` → 640×832 / 124 帧 / 5.17s |

## 三、首帧图生视频

| 项 | 值 |
| --- | --- |
| webappId | `2113790012012720129`（MiniMax+H3+首帧图生视频） |
| 参数 | `140:image`（首帧，必用 140；231 是多参参考，喂首帧无效）、`142:value`（字段是 `value`，不是 `prompt`）、`133:value=5`、`115:aspect_ratio`、`115:megapixels`（0.6 最低档） |
| 积分消耗 | **21.42 / 条**（3:4・0.6MP・5s，输出 672×928 / 124 帧） |
| 验证 | Circle10 free，Task `2122362800721592321` |
