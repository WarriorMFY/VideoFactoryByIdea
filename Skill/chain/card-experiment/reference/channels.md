# 通道与节点（本链默认值）

> 机械参数的唯一维护处是 `Skill/hub/generation/workflow/` 下各功能 README 的通道表（webappId、节点真名、档位、单价区间）；换通道纪律见 `Skill/hub/generation/runninghub/references/channels.md` §三。本文件只留**本链脚本的默认值**与踩过的坑；两边不一致先改 hub，再改这里。
> 观察类结论（帧数实测、切点实际落在何处、积分落在哪个区间等）走 `evidence/`，人工验收后才写。
> 账号 `apiType=NORMAL`，标准模型 API 一律报 `1014`（仅企业级共享 Key）；出图出视频全部走 AI 应用通道，实例 `default`（24G）。

## 本链默认值

| 用途 | webappId | 关键位 |
| --- | --- | --- |
| 文生图 | `2046794551444119554` | `18:prompt`、`18:aspectRatio=16:9`、`18:resolution=1k` |
| 文生视频 | `2085304953094107137` | `250:prompt`、`115:aspect_ratio`、`225:select=1`（480P）、`205:select=1`（5s） |
| 首帧图生视频 | `2113790012012720129` | `140:image`（首帧）、`142:value`（prompt）、`133:value`（秒）、`115:megapixels=0.6` |

三条通道的完整节点表、画幅枚举（`1:1`／`2:3`／`3:2`／`3:4`／`4:3`／`9:16`／`16:9`／`21:9`）、`231`–`239` 多参图位与 `247`–`249` 音频位语义（未验）、单价区间，见 `Skill/hub/generation/workflow/` 下 text-to-image、text-to-video、image-to-video 的 README 通道表。

## 三个坑

1. `205:select=5` 不是 5 秒：它是 input 索引，`5`=9s、`1`=5s、`11`=15s（5s–15s 每秒一档）。
2. 首帧只能喂 `140:image`；`231` 是多参参考位，喂首帧无效；该通道没有尾帧入口。
3. 首帧 i2v 的时长走 `133:value`（FLOAT，可写任意秒）；文生视频的时长走 `205:select`（秒档位）。两者别混。

## 凭证与计费

- api key：唯一文件是 `Skill/hub/generation/runninghub/credential.txt`（不入库）；本链 `scripts/credential.py` 只是转发到 hub 的 `load_key()`，环境变量若已设则临时覆盖。不设环境变量也能跑。
- 计费口径：以账户 `remainPoint` 差值为准；任务回传 `chargedPoint` 时优先用它，两者都没记才用差值补记并在 `notes` 注明。
- 换通道：先 `python scripts/rh_api.py --info <appId>` 查节点真名（不消耗积分），再改 hub 的 `channels.md`、本文件与脚本默认值；节点名以实际返回为准，不许照抄记忆。
