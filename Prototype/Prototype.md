# Prototype/ — 小循环增量目录

> 按 AGENTS.md §3.1 / §3.3：一个子目录 = 一个小循环的增量（`loopNN_<短名>/`），本文件是该目录的唯一索引。
> 本文件只回答两件事：**现在到哪了**（当前进度）、**走过哪些轮**（增量清单）。
> 「这条路现在长什么样」在 [Idea/State.md](../Idea/State.md)；逐轮过程在 [循环日志](../History/CircleLog/log.md)；代码在 `Tool/`。
> 回链：[AGENTS.md](../AGENTS.md) · [Idea/State.md](../Idea/State.md) · [循环日志](../History/CircleLog/log.md)

## 当前进度

| 项 | 状态 |
|---|---|
| 大循环 | **进行中**：`Idea/Idea.md` 结束日期为「想法驱动，时间不限」，无预算耗尽问题 |
| 增量 | 41 轮已记，40 个目录（loop24 未建目录） |
| 最近一轮 | loop41 · 先让 LLM 认识人：填 `USER.md`（唯一真源）+ `AGENTS §1.6` 定读取时机；并实测清「LLM 上下文注入机制」（六层输入 + 4,137 次调用曲线） |
| 本轮状态 | loop41 已收工（11-07 16:30 → 11-08 13:05，跨夜，实际约 3.5 小时），**待人工放行**（§2.3 闸门二）。本轮另确定「留痕单一通道」：`.workbuddy/memory/` 停写并已清空 |
| 待人工确认 | ① **`E5` 七条已永久化**（原素材 `memory/2026-11-05/06.md` 于 11-07 22:31 随清理删除）：是否把 `E5` 降级为 `W` 并标「已知永久缺口」，否则它会永远报错；② #46 火海巨兽终局（带台词字幕）是否入库；③ 迁出包 CutFactory 四项决定；④ `ops/` 存量拆分（触发条件：脚本涨过 45 或连续三次找不到东西）；⑤ `History/asr/speech4/.asr_work/asr_16k.pcm` 9.2MB 临时 PCM 误入库待清；⑥ 机制知识要不要进常驻通道（现只在本轮索引，压缩即消失） |
| 索引欠账 | `node Tool/check/repo_sync_check.mjs` 实测（11-08 13:0x）：**断链 0 / 缺同名索引 0 / 多余说明文件 0 / 目录缺清单行 0 / 进行中 0**（Prototype·Tool·Skills·Material·Idea 全合规）；遗留——`E5` 7 轮（loop32–38，**已永久化**，素材删除）、缺日志回链 1 个（loop38，因它没有条目）、深层说明文件 1 组（按 §3.3 懒迁移）。History 层未纳入扫描 |

## 增量清单

`loopNN` 即小循环号（AGENTS.md §2.1）。**所有轮次相关信息只在此表保留摘要**——过程看日志，现状看 `Idea/State.md`，细节看各 loop 目录索引。

- 日志列直达 `log.md` 对应条目；标「缺」表示该轮尚无编号条目；
- 目录形态：早期（loop1–12）为 `README.md` + `reproduce.ps1` + `acceptance.md` + `case_*/`；loop27 起改为单索引 `loopNN_xxx.md`，复现命令写进索引正文（§3.3）。

| loop | 主题 | 关键结果 | 日志 |
|---|---|---|---|
| 1 | 自动剪辑 + 成片交付（Auto-Edit） | 决策 IoU 1.000/0.998，误删有效内容 0s，切点误差 ≤0.017s，成片 −15.9 LUFS | [小循环 1](../History/CircleLog/log.md#loop1) |
| 2 | 外语视频 → 中文字幕（含随剪辑重映射） | WER 6.1%，字幕覆盖 99.8%，句界误差 0.016s | [小循环 2](../History/CircleLog/log.md#loop2) |
| 3 | 真实外语素材验证 + 语音保护 | 对白 4/4 保住，切除 13.52→11.57s；置信度 0.816→0.918；真实语音词准 ~55–65% | [小循环 3](../History/CircleLog/log.md#loop3) |
| 4 | 多样本英译中（真实影视 + 多口音 TTS） | 口音 WER 1.1–6.7%；真实电影 WER 30.5% / 覆盖 59.9%，漏的几乎全是 1–3 词短句 | [小循环 4](../History/CircleLog/log.md#loop4) |
| 5 | 双语 + 逐词彩色高亮字幕（karaoke） | 高亮 12/12、无重影 12/12；抖动修复后闪断 30→0 帧、高亮缺失 80→0 帧 | [小循环 5](../History/CircleLog/log.md#loop5) |
| 6 | 字幕文本层：标点恢复 / 精译 / 阅读速度 | 句界 F1 1.00、句末标点 100%、术语错误 1→0；精译对人工参考 94.1% | [小循环 6](../History/CircleLog/log.md#loop6) |
| 7 | 真实影视短句漏识（假设被证伪） | WER 31.6→28.4%，短句覆盖仅 +3.0pp（目标 +10pp）；7 链 × 10 漏句 0 命中 → 判为模型上限 | [小循环 7](../History/CircleLog/log.md#loop7) |
| 8 | 校对回写闭环（人改中文 → 回灌时间轴） | 恒等回写逐字节一致；3/3 误操作被拒；回写后出片 QA PASS | [小循环 8](../History/CircleLog/log.md#loop8) |
| 9 | 49 分钟长片压测 + 术语一致性审计 | 48.7 分钟成片、273 条字幕 / 校对表 273 行恒等；修掉 2 个只在长片暴露的 bug | [小循环 9](../History/CircleLog/log.md#loop9) |
| 10 | 逐词高亮长片规模验收 | 1030 事件 / 103KB / 生成 0.1s；12/12 帧高亮在；口径修正为 ≈1 事件每词 | [小循环 10](../History/CircleLog/log.md#loop10) |
| 11 | 知识型内容链路：分诊 + 单位规范化 + 术语候选 | 分诊 knowledge 0.95 / narrative 0.17；`−16 LUFS`、`15 Mbps` 规范化幂等；术语候选 61 / 31 个 | [小循环 11](../History/CircleLog/log.md#loop11) |
| 12 | 市场 ↔ 工厂闭环（侦查 → 样片 → 交付包 → 反馈） | 侦查 134 条、前 8 条 2517 万播放；样片 WER 9.5% / 覆盖 100%、QA PASS；上架与真实反馈仍需人工 | [小循环 12](../History/CircleLog/log.md#loop12) |
| 13 | 反馈时钟：不等市场投票，自造判卷 | — | [小循环 13](../History/CircleLog/log.md#loop13) |
| 14 | 对标优化：名人 AI 演讲 × 双语高亮字幕 | — | [小循环 14](../History/CircleLog/log.md#loop14) |
| 15 | 能力迁移：TalkFactory 独立包 | 独立包跑通 | [小循环 15](../History/CircleLog/log.md#loop15) |
| 16 | 能力打包迁移沉淀为 Skill | Skill 落地 | [小循环 16](../History/CircleLog/log.md#loop16) |
| 17 | TED 演讲剪辑创新点调研 | — | [小循环 17](../History/CircleLog/log.md#loop17) |
| 18 | P1–P5 并入摘要主链 + EP-A v2 成片 | EP-A v2 成片 | [小循环 18](../History/CircleLog/log.md#loop18) |
| 19 | B 站同赛道剪辑技术学习 | — | [小循环 19](../History/CircleLog/log.md#loop19) |
| 20 | 「师夷长技」Skill | Skill 落地 | [小循环 20](../History/CircleLog/log.md#loop20) |
| 21 | edit-craft-scouting 首跑：金句卡流派移植 | 金句卡流派移植成功 | [小循环 21](../History/CircleLog/log.md#loop21) |
| 22 | 跨内容域剪辑技术图谱 | — | [小循环 22](../History/CircleLog/log.md#loop22) |
| 23 | 首部独立成片《光偷走的那两小时》 | 独立成片交付 | [小循环 23](../History/CircleLog/log.md#loop23) |
| 24 | （未建目录）loop18 结轮 + loop23 沉淀 | — | [小循环 24](../History/CircleLog/log.md#loop24) |
| 25 | 剪辑强 UP 主技术成长路径图谱 | — | [小循环 25](../History/CircleLog/log.md#loop25) |
| 26 | B 路径首作《AI工坊的一夜》 | 独立成片交付 | [小循环 26](../History/CircleLog/log.md#loop26) |
| 27 | 素材采集线 collect_material | 采集线可用 | [小循环 27](../History/CircleLog/log.md#loop27) |
| 28 | 紫冥剑三招拆解（28b 逐帧慢放 / 28c 古谱纸笺 / 28d 动捕速率） | 0.7× 逆推还原实速 | [小循环 28](../History/CircleLog/log.md#loop28) |
| 29 | 细节取证 + 取证试片 | 取证五细节 D1–D5 + 时间码验证法 | [小循环 29](../History/CircleLog/log.md#loop29) |
| 30 | 幕后专访取证 | 采访金句可引原话 | [小循环 30](../History/CircleLog/log.md#loop30) |
| 31 | 双游戏武术演出量化对比 | 发力峰密度 / 姿态层次量化 | [小循环 31](../History/CircleLog/log.md#loop31) |
| 32 | 影之刃零动作单元拆解（武器-招式） | 30 武器模组、四段式招式结构 | 缺 |
| 33 | 镜头语言重加工实验（数字重摄影） | 单机位无真视差；V3 速度斜坡 + 推近最佳 | 缺 |
| 34 | recam 重摄影工具化 | 配置驱动：full/crop/zoom × 变速 × 拖影 | 缺 |
| 35 | 对比剪辑流（vs_split） | 17s 成片，lr/tb 双版式 | 缺 |
| 36 | 对比策展（完整处决单位） | 5 组完整单位对位 | 缺 |
| 37 | 处决边界检测（exec_bound） | 运动曲线提议 + 取证条带；5 组 QC 全过 | 缺 |
| 38 | 影零处决全量抽取（1080p60） | 46 单位 / 156.26s / 138 关键帧；185 条入库 | 缺 |
| 39 | 仓库目录与循环日志协同管理 | 三段式写入 + 双链 + 校验器（E1 断链 0、W1 归零）；另附：`Prototype.md` 204→66 行只留进度与清单、`Idea/State.md` 独立成「走到哪」 | [小循环 39](../History/CircleLog/log.md#loop39) |
| 40 | 仓库结构优化（索引规则补漏 + 存量清账） | §3.3 补适用范围与五类豁免；46 份 README/REPORT 正文零丢失并入同名索引（逐行核验 0 缺失）；E2 16→0、新增 E6/E7 全仓检查归零 | [小循环 40](../History/CircleLog/log.md#loop40) |
| 41 | 先让 LLM 认识人（关于人的知识放哪、怎么更新） | `USER.md` 填为唯一真源 + `AGENTS §1.6` 定读取时机；另实测「上下文注入机制」（六层输入 / `read_when` 实证 / 4,137 次调用曲线：地板 34,582→峰值 215,336）；附带确定「留痕单一通道」并清空 `.workbuddy/memory/` | [小循环 41](../History/CircleLog/log.md#loop41) |
