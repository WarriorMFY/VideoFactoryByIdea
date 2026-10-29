# 小循环 5 · 执行记录（时间线 / 命令 / 数据）

时区：本机 UTC+8。全部命令在仓库根执行。

## 时间线

| 时间 | 动作 | 结果 |
| --- | --- | --- |
| 08:55 | 收到截图 + 需求，确认 ASS 路线 | 判定 `\k` 不匹配"只亮当前词"，改用逐词重绘 |
| 09:00 | 写 `Tool/subtitle/make_ass.mjs` | 首版：中文整句 + 英文逐词事件，101 词/7 句 |
| 09:05 | `vfactory --srt x.ass` 渲染 | **静默跳过烧入**（字幕校验只认 SRT）→ 修校验 |
| 09:12 | 抽帧检查 | 发现**相邻两词同时高亮**（事件边界重叠）→ 改首尾相接铺砖 |
| 09:20 | 再抽帧 | 发现**中文被两行英文压住** → 中文改事件级 MarginV 动态抬高 |
| 09:28 | 写 `Tool/acceptance/verify_karaoke.mjs` | 像素级验收；两轮误报后调稳（容差 46→28、只扫字幕区、避开淡入淡出） |
| 09:45 | 真实素材用例（Sintel + EDL 重映射） | 25 词，PASS |
| 10:00 | 打包 `Prototype/loop5_karaoke_subs` + reproduce.ps1 实跑 | PASS（E/F 两用例 verify 均 exit=0） |

## 关键命令

```powershell
# TTS 素材（101 词）
node Tool\subtitle\make_ass.mjs History\subs\l2\cues.json --out History\subs\karaoke\l2.ass --hl 33E6C8
node Tool\edit\vfactory.mjs History\bench\l2_en\source.mp4 --out History\runs\karaoke_l2 --title "双语 · 逐词高亮" --srt History\subs\karaoke\l2.ass
node Tool\acceptance\verify_karaoke.mjs History\runs\karaoke_l2\final.mp4 History\subs\karaoke\l2.ass --json History\runs\karaoke_l2\verify_karaoke.json

# 真实素材（含剪辑重映射）
node Tool\subtitle\make_ass.mjs History\subs\real3\cues.json --edl History\runs\real3_subs\edits.json --out History\subs\karaoke\real3.ass
node Tool\edit\vfactory.mjs Workspace\assets\realspeech\sintel-trailer.mp4 --out History\runs\karaoke_real3 --protect History\asr\transcript_real.json --srt History\subs\karaoke\real3.ass
node Tool\acceptance\verify_karaoke.mjs History\runs\karaoke_real3\final.mp4 History\subs\karaoke\real3.ass --json History\runs\karaoke_real3\verify_karaoke.json
```

## 实测数据

| 项 | 用例 E（TTS 素材） | 用例 F（Sintel 真实素材 + 重映射） |
| --- | --- | --- |
| 源/成片 | 33.878s → 33.878s（无删减） | 52.2s → 40.767s（语音保护后切 11.57s） |
| 句数 / 词级事件 | 7 句 / 101 条 | 4 句 / 25 条 |
| 高亮存在 | 12/12 帧 | 12/12 帧 |
| 单块不重影 | 12/12 帧 | 12/12 帧 |
| 高亮重心位移 | 544.0 px | 414.2 px |
| 平均高亮像素 | 590.8 | 522 |
| 成片质检 | PASS（−16.2 LUFS，音画差 0.045s） | PASS（−14.9 LUFS，音画差 0.004s；残留黑场 3＝已知取舍） |
| 端到端耗时 | 渲染 ~15s + 验收 ~20s | 渲染 ~16s + 验收 ~20s |

## 产物清单

- 字幕：`History/subs/karaoke/l2.ass`、`real3.ass`
- 成片与验收：`History/runs/karaoke_l2/`、`History/runs/karaoke_real3/`（final.mp4、verify_karaoke.json、qa.json、runlog、.work/logs）
- 抽帧：`History/runs/karaoke_l2/_k*.jpg`、`_v*.jpg`、`History/runs/karaoke_real3/_r*.jpg`
- 交付包：`Prototype/loop5_karaoke_subs/`（README + acceptance + reproduce.ps1 + 两用例快照）

## 修掉的问题（都已写进对应文档注释）

1. `vfactory` 字幕校验只认 SRT → 合法 ASS 被静默跳过。
2. 词事件边界重叠 → 相邻两词同时高亮（重影）。
3. 中英文固定下边距 → 两行英文压住中文。
4. 标题固定 `y=h*0.74` → 有字幕时压住字幕（改为有字幕时自动顶部）。
5. 像素验收两轮误报：容差过大把背景草地当高亮；首尾淡入淡出把高亮压暗导致"缺失"。

## 未做（边界）

`\kf` 扫光式高亮、长句自动分页、多语言字体回退、软字幕轨、长片事件量压测。
