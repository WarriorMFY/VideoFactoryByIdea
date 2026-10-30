# acceptance/ — 一键验收（证明"它是对的"）

> 这里是**判定层**：不产出新能力，只把 `bench/` + `edit/` + `subtitle/` 串起来跑，然后用真值/质检数据给出 PASS/FAIL。
> 原则：判定数据可复现，不靠口头推断。

## 文件

| 脚本 | 作用 | 产出 |
| --- | --- | --- |
| `verify_edl.mjs` | **剪辑决策验收**：EDL vs 真值 → IoU / 过切(FP) / 漏切(FN) / 分段存活率 / 切点误差 | `verify.json` |
| `qa_report.mjs` | **成片质检**：编码规格、EBU R128 响度、残留黑场/冻帧、音画时长差 | `qa.json` |
| `run_acceptance.mjs` | 小循环 1 一键验收（合成 + 真实素材两用例） | `History/loops/loop01/acceptance.md` |
| `run_subs_acceptance.mjs` | 小循环 2 一键验收（TTS 外语素材，含机翻/精译两种后端） | `History/loops/loop02/acceptance*.md` |
| `run_real_acceptance.mjs` | 小循环 3 一键验收（真实素材 + 语音保护对照 + 音频预处理实验） | `History/loops/loop03/acceptance.md` |
| `run_multi_speech_acceptance.mjs` | **小循环 4**：多样本批量验收（真实影视 + 多口音 TTS），逐样本跑 ASR(2 变体对照)→剪辑→机翻→重映射→烧入→验收/质检 | `History/loops/loop04/report.md` + `metrics.json` |
| `snapshot_loop4.mjs` | 把 loop4 产物整理成交付快照（成片/字幕/抽帧/判定数据） | `Prototype/loop4_multi_samples/cases/<id>/` |
| `verify_karaoke.mjs` | **逐词高亮字幕验收**（小循环 5）：扫像素判断"高亮存在 / 不重影 / 高亮随语流移动" | `verify_karaoke.json` |
| `diagnose_flicker.mjs` | **抖动诊断**（小循环 5 v2）：把 ASS 烧到纯黑底（隔离画面）后逐帧统计"英文行是否整行消失 / 高亮是否断档 / 文字块是否上下跳" | `flicker.json` |
| `verify_punct.mjs` | **标点恢复验收**（小循环 6）：句界 F1 / 句末标点准确率 / 去标点后 WER（用讲稿真值） | `verify_punct.json` |
| `verify_translation.mjs` | **翻译质量**（小循环 6）：与人工参考的相似度 + **缺陷计数**（句末缺标点/术语错误/残留英文/中英空格） | `mt_quality.json` |
| `run_text_acceptance.mjs` | 小循环 6 一键验收：标点恢复 → 三种翻译变体横向对比 → 字幕链路回归 | `History/loops/loop06/acceptance.md` |
| `run_rescue_acceptance.mjs` | **小循环 7**：短句救援验收 —— 最优预处理链是否真的更准 / 跨素材是否倒退 / 证伪证据是否充分 / 是否伤中长句（会顺带调三支探针） | `History/loops/loop07/acceptance.md` |
| `run_review_acceptance.mjs` | **小循环 8**：校对回写闭环 —— 恒等回写逐字节一致 / 改动只落指定行 / 三类误操作被拒绝 / 回写后能出片 | `History/loops/loop08/acceptance.md` |
| `run_long_acceptance.mjs` | **小循环 9**：49 分钟长视频压测（全链路耗时/字幕条数/校对表规模）+ 术语一致性审计回归 | `History/loops/loop09/acceptance.md` |
| `run_knowledge_acceptance.mjs` | **小循环 11**：知识型内容链路 —— 内容分诊（knowledge vs narrative）／数值单位规范化（含幂等与不误伤）／中文单位正确性（含对照组）／术语候选 | `History/loops/loop11/acceptance.md` |

## 怎么用

```powershell
node Tool\acceptance\run_acceptance.mjs            # 加 --skip-build 可跳过造素材
node Tool\acceptance\run_subs_acceptance.mjs       # 加 --mt agent --zh-file xx.json 出精译版
node Tool\acceptance\run_real_acceptance.mjs       # 加 --af "..." 换音频预处理
node Tool\acceptance\run_multi_speech_acceptance.mjs --only tos_90s   # 小循环 4：多样本批量（可只跑指定样本）
node Tool\acceptance\snapshot_loop4.mjs                               # 把小循环 4 产物整理进 Prototype
node Tool\acceptance\run_rescue_acceptance.mjs --force                 # 小循环 7：短句救援（需先下 TOS 电影+字幕）
node Tool\acceptance\run_review_acceptance.mjs --force                 # 小循环 8：校对回写闭环
node Tool\acceptance\run_long_acceptance.mjs                           # 小循环 9：49 分钟长视频压测（第一次跑约 25 分钟）
node Tool\acceptance\run_knowledge_acceptance.mjs --force              # 小循环 11：知识型内容（分诊/单位/术语）

# 单独验一个 EDL / 一条成片
node Tool\acceptance\verify_edl.mjs out\edits.json bench\ground_truth.json --json out\verify.json
node Tool\acceptance\qa_report.mjs  out\final.mp4 --json out\qa.json
```

## 判据（阈值可通过参数改）

| 检查 | 判据 | 脚本 |
| --- | --- | --- |
| 剪辑决策 | IoU ≥ 0.90、过切 ≤ 0.6s、漏切 ≤ 0.6s、每段存活率达标、切点误差 ≤ 0.6s | `verify_edl` |
| 成片规格 | H.264 / yuv420p / 恒定帧率 / AAC 48k；响度 ≈ −16 LUFS 且峰值 ≤ −1 dBTP；无残留黑场；音画差 < 0.1s | `qa_report` |
| 字幕（有讲稿） | WER ≤ 25%、语音覆盖 ≥ 95%、句界误差 均 ≤0.8s/最大 ≤1.5s、译文覆盖 100%、中文可读性 ≤20 字/秒 | `verify_subs` |
| 字幕（无讲稿） | 跳过 WER/句界，只看译文覆盖、可读性、重映射自检（无越界/重叠、最短 ≥0.5s） | `verify_subs` reference-free |
| 跨步骤一致性 | 两次渲染的 EDL 必须完全相同（否则字幕会错位） | 各 `run_*` 内置断言 |
| 逐词高亮字幕 | 每个采样帧都检到高亮色；高亮块间最大空隙 <200px 且总宽 <480px（不重影）；不同词重心位移 ≥12px（跟随语流） | `verify_karaoke` |
| 字幕抖动 | 连续 ≥2 帧整行缺失 = 0；连续 ≥2 帧高亮缺失 = 0；句内文字块上下边界位移 >4px 的次数 = 0（单帧 33ms 不计） | `diagnose_flicker` |
| 标点恢复 | 句界 F1 ≥0.85、句末标点准确率 ≥85%、去标点后 WER ≤10% | `verify_punct` |
| 翻译缺陷 | 句末缺标点 = 0、术语错误 = 0（相似度仅作参考） | `verify_translation` |
| 短句救援 | 预处理链比不处理准 ≥1pp；跨素材不倒退；**证伪证据充分**（干净 TTS 命中 ≥3、原片混音 ≤1、7 条链最佳 0 命中）；中长句覆盖不倒退 >5pp | `run_rescue_acceptance` |
| 校对回写 | 恒等回写 cues/SRT 逐字节一致；改动只落指定行；删行/改时间码/空译文**必须被拒绝**；回写后出片质检不 FAIL | `run_review_acceptance` |
| 长视频压测 | 49 分钟素材全链路跑通（7 阶段）、成片 > 40 分钟、字幕 ≥ 200 条、279 行规模下回写恒等、术语审计能抓到被切行切断的术语、质检不 FAIL | `run_long_acceptance` |
| 知识型内容 | 分诊能分开教学片/电影（music_ratio 方向正确）；源句出现 `−16 LUFS`/`15 Mbps`、规范化幂等且不误伤普通数字；中文无"负十六/卢夫斯"（对照组拿不到）；术语候选非空 | `run_knowledge_acceptance` |

## 判定数据在哪

- 剪辑：`History/runs/*/verify.json`
- 成片：`History/runs/*/qa.json`
- 字幕：`History/runs/*_subs*/verify_subs.json`
- 逐词高亮：`History/runs/karaoke_*/verify_karaoke.json`
- 汇总：`History/loops/loop0*/acceptance*.md`、`report*.md`
- 循环摘要：`History/CircleLog/log.md`

## 坑

- **QA 的黑场阈值必须与剪辑一致**（0.30 / 0.04 / 0.98），否则会把"剪辑时够不上黑场"的暗场闪一下反复报成缺陷。
- 真实素材没有讲稿 → `verify_subs` 会自动切 reference-free；别为了凑 WER 去手写"真值"。
  例外：ToS 有**官方字幕**，可以合法当真值（`setup/make_tos_excerpt.mjs` 生成）。
- 真实素材上"对白压在黑底字幕卡"会导致残留黑场告警，这是**已知取舍**，在各 `run_*.mjs` 里单列，不计入失败。
- 素材缺失时 `run_real_acceptance` 会直接报错——先跑 `setup/fetch_realspeech.mjs`。
- **别并发跑两个 `run_multi_speech_acceptance`**：两个 driver 会互相覆盖 `metrics.json`
  （实测被 kill 的 job 留下孤儿子进程造成过）。脚本现在有 pid 锁（`History/loops/loop04/.run.lock`），
  确认孤儿已死可手动删锁。
- 多样本验收里"真实电影 WER 30.5% / 覆盖 59.9%"是**模型能力上限**，不是链路 bug：
  按真值句长分桶后，1–3 词短句覆盖率只有 24%（感叹/呼叫被漏），见 `History/loops/loop04/report.md` 关键问题 3。
