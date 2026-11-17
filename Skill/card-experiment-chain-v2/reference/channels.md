# 通道与节点（只写机械参数，不写观察结论）

> 观察类结论（帧数固定、秒数不被读、实测积分落在哪个区间等）走 `evidence/`，人工验收后才写。
> 账号 `apiType=NORMAL`，标准模型 API 一律报 `1014`（仅企业级共享 Key）；出图出视频全部走 AI 应用通道，实例 `default`（24G）。

## 一、文生图

| 项 | 值 |
| --- | --- |
| webapp | `2046794551444119554`（全能图片 G-2.0·文生图·低价渠道版） |
| instance | `default` |
| 节点 | `18:prompt`、`18:aspectRatio`、`18:resolution`（`1k`／`2k`／`4k`，`1k` 最低档） |
| 常用 | `16:9`／`1k` |

## 二、文生视频

| 项 | 值 |
| --- | --- |
| webapp | `2085304953094107137`（加速版·MiniMax H3） |
| 节点 | `250:prompt`、`115:aspect_ratio`、`225:select=1`（480P）、`205:select` |
| 画幅 | `16:9 (Widescreen)` |
| 时长 | `205:select`：`1`=5s、`5`=9s、`6`=10s |

## 三、首帧图生视频

| 项 | 值 |
| --- | --- |
| webapp | `2113790012012720129`（MiniMax+H3+首帧图生视频） |
| 首帧 | `140:image`——**必须用 140**；`231` 是多参参考位，喂首帧无效 |
| 节点 | `142:value`（字段名是 `value`，不是 `prompt`）、`133:value`（秒数）、`115:aspect_ratio`、`115:megapixels`（`0.6` 最低档） |

## 凭证与计费

- api key：读技能内 `credential.txt`（一行 `RUNNINGHUB_API_KEY=<key>`，明文随技能走）；唯一入口是 `scripts/credential.py` 的 `load_key()`，环境变量若已设则临时覆盖。不设环境变量也能跑。
- 计费口径：以账户 `remainPoint` 差值为准；任务回传 `chargedPoint` 时优先用它，两者都没记才用差值补记并在 `notes` 注明。
- 换通道：先 `python scripts/rh_api.py --info <appId>` 查节点真名（不消耗积分），再改本文件与脚本默认值；节点名以实际返回为准，不许照抄记忆。
