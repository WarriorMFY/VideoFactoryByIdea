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

## 怎么用

```powershell
node Tool\acceptance\run_acceptance.mjs            # 加 --skip-build 可跳过造素材
node Tool\acceptance\run_subs_acceptance.mjs       # 加 --mt agent --zh-file xx.json 出精译版
node Tool\acceptance\run_real_acceptance.mjs       # 加 --af "..." 换音频预处理

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

## 判定数据在哪

- 剪辑：`History/runs/*/verify.json`
- 成片：`History/runs/*/qa.json`
- 字幕：`History/runs/*_subs*/verify_subs.json`
- 汇总：`History/loops/loop0*/acceptance*.md`
- 循环摘要：`History/CircleLog/log.md`

## 坑

- **QA 的黑场阈值必须与剪辑一致**（0.30 / 0.04 / 0.98），否则会把"剪辑时够不上黑场"的暗场闪一下反复报成缺陷。
- 真实素材没有讲稿 → `verify_subs` 会自动切 reference-free；别为了凑 WER 去手写"真值"。
- 真实素材上"对白压在黑底字幕卡"会导致残留黑场告警，这是**已知取舍**，在各 `run_*.mjs` 里单列，不计入失败。
- 素材缺失时 `run_real_acceptance` 会直接报错——先跑 `setup/fetch_realspeech.mjs`。
