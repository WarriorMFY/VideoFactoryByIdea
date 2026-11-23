# 通道纪律（平台级）

> 本文件只管**平台级规则**：跨通道通用的生成端边界、换通道纪律、凭证管理。
> 各功能的在役通道表（webappId/workflowId、节点、单价、实测锚点）已迁至业务层：
> 文生图 → `../../workflow/text-to-image/README.md`；图生图 → `../../workflow/image-to-image/README.md`；
> 文生视频 → `../../workflow/text-to-video/README.md`；图生视频（首帧/首尾/多参）→ `../../workflow/image-to-video/README.md`。
> 单价「当前值」的真相源是上述各功能 README 的通道表；本文件与 `cost.md` 维护**证据与纪律**。
> 账号 `apiType=NORMAL`，标准模型 API 一律返回 `1014`（仅企业级共享 Key）。出图出视频全部走 AI 应用通道，实例 `default`(24G)。
> 调用：`python Skill/hub/generation/runninghub/scripts/runninghub_app.py --run <webappId> --node ... -o <out>`
> 积分以任务回传 `usage.chargedPoint` 为准；不回传时用账户 `remainPoint` 差值补记，并在账本 `notes` 注明。

## 一、写什么

- **文生图**：像素级画面约束（位置、遮挡、材质、光照），详见 `Skill/chain/card-experiment/reference/prompt-writing.md` §二。
- **文生视频／图生视频**：因果事件链（发生了什么 → 先后 → 终态），详见同文件 §一。
- **整卡直送**：脚本只拼接卡片正文（剥 frontmatter），不抽字段、不改写；prompt 快照与 SHA1 随任务存档。

## 二、生成端边界（跨通道通用）

- **灵活但不精确**：事件级接近 100%，时间数字 0/6 命中，数值约束（%／比例）不落点。
- **每次输出都是新样本**：同 prompt 不可复现，必须留 prompt 快照、任务号、实扣。
- **成本按条／张，不按秒线性**：9s≈2.2×5s；同参数同档位也会跳档（10.54 vs 20.57、11.22 vs 24.33），只能逐条实测。
- **质检不过即重生成**；**不在生成端抠像素**（那是剪辑端的事）。
- **图生视频特有**：首帧锚定生效（对源图 NCC≈0.956）；同 prompt 切点噪声 6–8 帧；动作会被改写但保留逻辑。

## 三、换通道纪律

1. 先 `python Skill/hub/generation/runninghub/scripts/runninghub_app.py --info <appId>` 查节点真名（不消耗积分）。
2. 改对应功能 README 的通道表与技能脚本里的默认值；节点名以实际返回为准，不许照抄记忆。
3. 改完在当轮账本记一条「换通道」日期与原因。

## 四、凭证

- 唯一文件：`Skill/hub/generation/runninghub/credential.txt`（一行 `RUNNINGHUB_API_KEY=<key>`，不入库）。
- 唯一实现：`scripts/rh_credential.py` 的 `load_key()`；各链 `scripts/credential.py` 只是转发，环境变量若已设则临时覆盖。
- 新环境：复制同目录 `credential.example.txt` 为 `credential.txt` 再填 key。
- 不在此文件记录任何 key 内容。
