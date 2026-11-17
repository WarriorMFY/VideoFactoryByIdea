# 通道与节点（只写机械参数，不写观察结论）

> 观察类结论（帧数固定、秒数不被读等）走 `experience/`，且必须人工验收后才写。
> 权威清单与实测价以 `Doc/RunningHub/APP/README.md` 为准；本文件只保留脚本默认值，两边不一致先改 Doc。

## 文生图

| 项 | 值 |
| --- | --- |
| webapp | `2046794551444119554`（G-2.0） |
| instance | `default` |
| 节点 | `18:prompt`、`18:aspectRatio`、`18:resolution` |
| 常用 | `16:9`／`1k` |

## 文生视频

| 项 | 值 |
| --- | --- |
| webapp | `2085304953094107137`（MiniMax H3 加速版） |
| 节点 | `250:prompt`、`115:aspect_ratio`、`225:select=1`、`205:select` |
| 画幅 | `16:9 (Widescreen)` |
| 时长 | `205:select`：`1`=5s、`5`=9s、`6`=10s |

## 凭证与计费

- api key：环境变量 `RUNNINGHUB_API_KEY` 优先，其次读仓库 `AGENTS.md` 的 apikey 行；脚本不写死。
- 计费口径：以账户 `remainPoint` 差值为准；任务回传 `chargedPoint` 时会优先用它。
- 换通道：先 `runninghub_app.py --info <appId>` 查节点 id，再改本文件与脚本默认值。
