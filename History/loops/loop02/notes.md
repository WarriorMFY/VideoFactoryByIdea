# 小循环 2 · 执行记录（时间线 / 命令 / 产物 / 实测数据）

时区：本机 UTC+8。全部命令在仓库根执行。

## 时间线

| 时间 | 动作 | 结果 |
| --- | --- | --- |
| 13:56 | 承接反馈，确认方向 | 本轮主线改为"外语视频 → 中文字幕" |
| 13:58 | 环境探测（pip/HF/npm/SAPI/翻译 API） | HF 与 ModelScope 不可达；MyMemory 与 alphacephei 可用；SAPI 被拒 |
| 14:05 | 确认 Vosk 路线（koffi + libvosk） | vosk 包 82MB 解包成功 |
| 14:12 | 造素材：先试 SAPI TTS | 失败（E_ACCESSDENIED），转 Edge 神经 TTS |
| 14:20 | `make_l2_bench.mjs` 跑通 | 7 句英文（Aria 神经音）+ 真实画面，逐句时间即真值 |
| 14:25 | 字幕链路（断句/翻译/切行） | 发现"先切行后翻译"导致错位 → 改为句子级翻译 |
| 14:40 | Vosk 模型并行下载启动 | 6 线程 × 4MB 分段 |
| 14:58 | 模型就绪（39.3MB） | 解压成功 |
| 14:59 | ASR 首次跑通 | 0 词 → 修 WAV 偏移 + final_result 收集逻辑 → 102 词 / 7 句 / 置信度 0.96 |
| 15:02 | 首次端到端验收 | WER 6.1%，但覆盖率 82.9% → 定位为 TTS 尾静音污染真值 |
| 15:04 | 修素材（逐句 silenceremove）后复跑 | 覆盖率 99.8%，句界误差 0.016s → **PASS** |
| 15:05 | 精译版（agent 后端）复跑 | 同时间轴换人工级译文，字相似度 85.7% → PASS |
| 15:10 | 组装 Prototype/loop2_subtitles/case_C_en2zh + 文档 + 提交 | 交付 |

## 关键命令

```powershell
# 依赖（一次性）
node Tool\bootstrap_asr.mjs            # koffi/vosk/edge-tts 解包到 Workspace/asr
node Tool\fetch_vosk_model.mjs         # 39MB 语音模型（多线程分段）

# 素材 + 识别 + 剪辑 + 字幕 + 重映射 + 烧入 + 验收（一条命令）
node Tool\run_subs_acceptance.mjs

# 精译版（人工级译文 + 真实 ASR 断句）
node History\probe\make_zh_agent.mjs History\subs\l2\cues.json History\bench\l2_en\ground_truth.json History\subs\l2\zh_agent.json
node Tool\run_subs_acceptance.mjs --skip-build --mt agent --zh-file History\subs\l2\zh_agent.json

# 分步执行（等价）
node Tool\make_l2_bench.mjs
node Tool\asr_vosk.mjs History\bench\l2_en\source.mp4 --out History\asr\transcript.json
node Tool\vfactory.mjs History\bench\l2_en\source.mp4 --out History\runs\l2_cut --title "外语视频 · 中文字幕"
node Tool\make_subs.mjs History\asr\transcript.json --out History\subs\l2 --mt mymemory --glossary Tool\glossary_zh.json
node Tool\remap_subs.mjs History\subs\l2\cues.json History\runs\l2_cut\edits.json --out History\subs\l2\remapped --style bilingual
node Tool\vfactory.mjs History\bench\l2_en\source.mp4 --out History\runs\l2_subs_mymemory --srt History\subs\l2\remapped\out_bilingual.srt
node Tool\verify_subs.mjs History\asr\transcript.json History\bench\l2_en\ground_truth.json --cues History\subs\l2\cues.json --remap History\subs\l2\remapped\remap.json --ref History\bench\l2_en\reference_zh.json
```

## 实测数据

| 指标 | 机翻版（全自动） | 精译版 | 判据 |
| --- | --- | --- | --- |
| ASR WER | 6.1%（6/99 词） | 同（共用识别结果） | ≤25% |
| 语音覆盖 | 99.8% | 99.8% | ≥95% |
| 句界误差 均/最大 | 0.016s / 0.045s | 同 | ≤0.8s / ≤1.5s |
| 译文覆盖 | 13/13 | 13/13 | 100% |
| 中文可读性峰值 | 8.89 字/秒 | 8.89 字/秒 | ≤20 |
| 重映射 | 13 条，越界0，重叠0，最短2.03s | 同 | 无越界/重叠 |
| 机翻 vs 人工精译 | 62.9% 字相似度 | 85.7%（自比） | 仅报告 |
| 成片 | 33.88s / 720p / −16.2 LUFS / PASS | 同 | PASS |

耗时（机翻版一键流程，跳过素材生成）：约 75s（识别 ~25s、剪辑渲染 ~15s、字幕翻译 ~20s、二次渲染 ~15s）。

## 产物清单

- 素材与真值：`History/bench/l2_en/`（script.txt、tts/*.mp3|wav、source.mp4、ground_truth.json、reference_zh.json）
- 识别：`History/asr/transcript.json`、`History/asr/mt_cache.json`（翻译缓存）
- 字幕：`History/subs/l2/`（cues.json、en/zh/bilingual.srt、remapped/remap.json + 成片时间轴 srt）
- 精译版：`History/subs/l2_agent/`
- 运行产物：`History/runs/l2_cut`、`History/runs/l2_subs_mymemory`、`History/runs/l2_subs_agent`
- 验收：`History/loops/loop02/acceptance.md`、`acceptance_agent.md`
- 交付包：`Prototype/loop2_subtitles/case_C_en2zh/`（成片 ×2、双语 SRT、识别稿、验收数据、抽帧）

## 未做（边界）

Whisper 级 ASR、软字幕、多语种实测、字幕样式模板、长视频压测、真人素材验证。
