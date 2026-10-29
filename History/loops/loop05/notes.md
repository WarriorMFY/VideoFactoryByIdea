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

## 附加修复 · 2026-10-29 10:20–11:30 · "字幕频繁抖动"（用户反馈）

反馈原话：**"上一轮交付物的字幕存在频繁抖动问题，修复一下"**。

### 先量化，再动手

新建 `Tool/acceptance/diagnose_flicker.mjs`：把同一份 ASS 烧到**纯黑底**（隔离画面干扰）上，逐帧扫"英文行带域"，
统计"整行消失 / 高亮断档 / 文字块位移"，只有**连续 ≥2 帧**才算抖动（单帧 33ms 人眼不可察）。

| 指标（全片逐帧） | v1 交付版 | v2 修复版 |
| --- | --- | --- |
| 闪断（英文行整行消失） | 30 帧 / 16 组 | **0 / 0** |
| 高亮缺失（该亮未亮） | 80 帧 / 37 组 | **0 / 0** |
| 位置跳 | 45 次（最大 55px） | 4 次（18px，仅跨句行数差异） |

### 三个根因 → 三个修法

1. **词事件之间有空档**：按 `[word.start, word.end]` 铺事件，词间空档（最长 0.2s）没有任何事件覆盖 → 英文行整行消失几帧。
   → 每个 tile **无缝延伸到下一个 tile 起点**（`make_ass.mjs` 铺砖逻辑改写）。
2. **极短词高亮等于没亮 + 高频跳色**：单/双字母词（`l u f s`）高亮像素个位数，且 0.06–0.1s 换色。
   → `--merge-word 0.18`：过短词与**同一行**相邻词合并成一个 tile；单双字母强制合并；**禁止跨行合并**（否则行尾词+下一行行首词同时亮，更怪）。
3. **中文随英文行数上下跳**：`MarginV` 逐句动态算。
   → 中文位置**全片固定**（`--zh-margin-mode fixed`，按最大英文行数算一次）。

顺带：句首补齐（ASR 首词晚于句子起点 30–100ms）、句末最多延长 0.25s、`vfactory` 有字幕时标题自动移到顶部。

### 验收口径本身也修了三处（否则测不准）

- 不能在成片上扫像素：BBB 草地/白云被当成白字（白字中位数 2312px），误报 29 帧闪断 → **隔离纯黑底**。
- "应显示"范围要用**中文整句区间**：用英文事件并集会把词间空档排除在统计外，正好漏掉最大抖源。
- 位置跳要用**文字块上下边界**（不用白字质心）：质心随上色词漂移，误报 14–18px。

### 回归

- 用例 E/F：`verify_karaoke` 12/12（高亮存在、不重影、会移动）+ `diagnose_flicker` PASS + 成片质检 PASS。
- `.\Prototype\loop5_karaoke_subs\reproduce.ps1` 实跑 PASS（含抖动诊断）。
- 交付快照已用 v2 产物替换；保留 `flicker_before_fix.json` 作为对照。