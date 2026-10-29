# 小循环 5 验收记录：双语 + 逐词高亮字幕

时间：2026-10-29　验收脚本：`Tool/acceptance/verify_karaoke.mjs` + `Tool/acceptance/qa_report.mjs`
判定口径：**不靠目检**——直接扫像素判断"高亮是否存在 / 是否只亮一个词 / 是否跟着语流移动"，再叠加成片质检。

## 结论

| 用例 | 源素材 | 词级事件 | 高亮存在 | 单块不重影 | 重心位移 | 成片质检 | 总判定 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| E `case_E_l2_karaoke` | TTS 英语素材 33.9s / 7 句 / 101 词 | 101 | 12/12 | 12/12 | **544 px** | PASS（−16.2 LUFS，音画差 0.045s） | **PASS** |
| F `case_F_real3_karaoke` | Sintel 真实素材 40.8s / 4 句 / 25 词（含剪辑重映射） | 25 | 12/12 | 12/12 | **414 px** | PASS 除"残留黑场=3"（对白压黑底＝已知取舍） | **PASS** |

## 判据说明

| 检查 | 阈值 | 含义 |
| --- | --- | --- |
| `highlight_present` | 所有采样帧都能检出高亮色像素 | 字幕真的上了色 |
| `single_block_per_frame` | 每帧只有 1 个词块 且 水平包围盒 < 320px | 没有"两词同时亮"的重影 |
| `highlight_moves` | 重心位移 ≥ 12px | 高亮跟着语流走，不是死亮一个词 |

采样方式：从 ASS 里取全部英文词事件，均匀抽 12 帧，帧时刻取词窗口中点；**避开首尾 0.8–1.2s 淡入淡出**（否则颜色被压暗导致"缺失"误报）；只扫画面下方 34%（字幕区），避免背景草地/树叶的青绿色干扰。

## 抽样明细（用例 E）

| 时刻 | 高亮像素 | 词块 | 重心 x | 该帧句子 |
| --- | --- | --- | --- | --- |
| 0.90s | 951 | 1 | 751.9 | welcome back to the workshop where return raw footage into finished films |
| 2.75s | 755 | 1 | 579.4 | 同上（当前词不同） |
| 5.39s | 324 | 1 | 669.5 | today i will show you three simple tricks… |
| 7.72s | 496 | 1 | 820.9 | 同上 |
| 10.48s | 319 | 1 | 677.3 | first always cut on the beat… |
| 12.71s | 836 | 1 | 783.7 | 同上（抽帧 `frame_12_71s.jpg` 可见 "audience" 高亮） |
| 16.20s | 420 | 1 | 365.3 | second remove the silent gaps… |
| 18.23s | 592 | 1 | 639.2 | 同上 |

## 抽样明细（用例 F，真实素材 + 重映射）

| 时刻 | 高亮像素 | 词块 | 重心 x | 备注 |
| --- | --- | --- | --- | --- |
| 8.85s | 479 | 1 | 419.3 | 源片 12.18s 的 "what brings…" 重映射到成片 8.75s 起 |
| 9.36s | 337 | 1 | 598.7 | 高亮向右移动 |
| 9.60s | 321 | 1 | 700.2 | 继续右移 |
| 10.11s | 198 | 1 | 825 | 句尾 |
| 31.73s | 1029 | 1 | 453.4 | 另一句（"dangerous quest…"） |

## 复现

```powershell
.\Prototype\loop5_karaoke_subs\reproduce.ps1
```

产物写到 `History/runs/karaoke_l2`、`History/runs/karaoke_real3`；本目录是同批产物的快照。
