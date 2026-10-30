# 小循环 6 · 执行记录（时间线 / 命令 / 数据）

时区：本机 UTC+8。全部命令在仓库根执行。

## 时间线

| 时间 | 动作 | 结果 |
| --- | --- | --- |
| 12:00 | 探测 LLM Key / MyMemory 上限 / 标点对机翻的影响 | 无 Key（精译走 agent）；MyMemory 500 字符上限；标点让 LUFS 不再被译坏 |
| 12:15 | 写 `Tool/subtitle/restore_punct.mjs` | 首版 4 句（真值 7 句）→ 断句阈值问题 |
| 12:30 | 改"停顿中位数"阈值 | TTS 上 7 句命中；标点验收 F1 1.00 / 句末 100% |
| 12:45 | 写 `Tool/acceptance/verify_punct.mjs` | 句界 F1、句末标点、去标点 WER 三项可量化 |
| 12:55 | `make_subs` 加 `--punct` / 源端术语纠错 / 500 字符保护 | 术语 `l u fs` → `LUFS`；句末缺标点 7 → 0 |
| 13:05 | 写 `Tool/acceptance/verify_translation.mjs` | 首版只算相似度 → 发现同义改写扣分严重，补**缺陷计数** |
| 13:15 | 真实素材（Sintel）跑标点 | **过度断句**（5 句，把一句台词切两半）→ 改 p80 分位数阈值 → 4 句正确 |
| 13:25 | `--cps` 阅读速度节流 | 本素材峰值 8.9 字/秒（<20）不触发；`--cps 5` 时暴露"物理时间不足"→ 改为报告超标条数 |
| 13:30 | 写 `run_text_acceptance.mjs`（一键 + 三种变体对比） | PASS |
| 13:40 | 渲染精译版样片 + 打包 Prototype + 文档 | 交付 |

## 关键命令

```powershell
# 标点恢复（新增）
node Tool\subtitle\restore_punct.mjs History\asr\transcript.json --out History\asr\transcript_punct.json --glossary Tool\subtitle\glossary_zh.json
node Tool\acceptance\verify_punct.mjs History\asr\transcript_punct.json History\bench\l2_en\script.txt History\bench\l2_en\ground_truth.json --json History\asr\verify_punct.json

# 三种翻译变体
node Tool\subtitle\make_subs.mjs History\asr\transcript_punct.json --out History\subs\l2_punct --mt mymemory --punct --glossary Tool\subtitle\glossary_zh.json --cps 20
node Tool\subtitle\make_subs.mjs History\asr\transcript_punct.json --out History\subs\l2_agent --mt agent --punct --zh-file History\subs\zh_agent_l2_punct.json --cps 20
node Tool\acceptance\verify_translation.mjs History\subs\l2_punct\cues.json History\bench\l2_en\reference_zh.json --json History\subs\l2_punct\mt_quality.json

# 一键验收（含上面全部 + 字幕链路回归）
node Tool\acceptance\run_text_acceptance.mjs
```

## 实测数据

| 指标 | A 无标点机翻 | **B 标点+源端纠错** | C 人工级精译 |
| --- | --- | --- | --- |
| 与人工参考相似度 | 47.8% | 47.2% | **94.1%** |
| 句末缺标点 | 7 句 | **0** | 0 |
| 术语错误 | 1 处 | **0** | 0 |
| 残留英文 | 0 | 0 | 0 |
| 中英未加空格 | 2 句 | 2 句 | 0 |
| 峰值 CPS / 超标 | — | 8.9 / 0-13 | 8.9 / 0-13 |

标点恢复（对讲稿真值）：句数 7/7、句界 F1 **1.00**、句末标点 **100%**、文本 WER **6.1%**（= ASR 自身，未改词）、逗号 F1 0.75（信息指标）。

## 产物清单

- 工具：`Tool/subtitle/restore_punct.mjs`、`Tool/acceptance/verify_punct.mjs`、`verify_translation.mjs`、`run_text_acceptance.mjs`；`make_subs.mjs` 扩展（`--punct`/`--cps`/源端术语纠错/500 字符保护）；`glossary_zh.json` 增加 `_source_fixes`
- 数据：`History/asr/transcript_punct.json`、`History/asr/verify_punct.json`、`History/subs/{l2,l2_punct,l2_agent}/`（cues/SRT/mt_quality）
- 成片样张：`History/runs/l6_text/final.mp4`（精译版字幕）
- 验收：`History/loops/loop06/acceptance.md`
- 交付包：`Prototype/loop6_text_quality/`（README + acceptance + reproduce.ps1 + case）

## 未做（边界）

ASR 升级 / 二次识别短句、校对回写闭环、长视频（49min）压测、离线翻译后端、术语库维护流程。

## 收尾补充（打包时补的小闭环，非新能力）

`--mt agent` 之前是"有接口、没法用"：外部译员拿不到"该译哪些句"，只能从源码反推。
补了 `make_subs --dump-en <file>`：导出 `{ "英文原句": "" }` 模板后退出（不翻译、不产 cues），
键为**源端纠错后**的句子（`l u fs` → `LUFS`）；同时把 agent 查表改成多候选
（原句 → 纠错后原句 → 去句末标点），保证手写模板加不加句号都能命中。

- 验证：模板 7 句 → 回填 loop6 精译 → 重跑 `cues.json` 与 `History/subs/l2_agent/cues.json` **13/13 条完全一致（0 diff）**。
- 回归：`node Tool\acceptance\run_text_acceptance.mjs` 仍 **PASS**（WER 6.1%、覆盖 99.8%、句界 0.02s 不变）。
- 文档：`Tool/subtitle/subtitle.md` 增「发布级译文（--mt agent）」一节 + `--dump-en` 参数行；`Prototype/README.md` 用法段同步。
