# 小循环 2 增量的反馈：外语视频 → 中文字幕（含双语）

> 需求原话：**"那先做「外语视频加中文字幕吧」，其他你看着来。"**
> 本轮目标：给定一段**外语**视频（本轮首个语种=英语），自动识别 → 翻译成中文 → 生成字幕 → **按剪辑后的时间轴**对齐 → 烧进成片交付。
> 时间窗口：2026-10-27 10:44 → 10-31 10:44；本轮 13:56–15:10（约 75 分钟），结束时剩余约 3 天 19 小时。

---

## 1. 一句话结论

**跑通了，且每个环节都能用数字验收**：英语语音识别 WER **6.1%**，字幕覆盖语音 **99.8%**，句界误差 **0.016s（均）/ 0.045s（最大）**，13 条字幕全部译出、无越界无重叠，成片 **−16.2 LUFS / 720p / H.264** 质检 PASS。
字幕是在**剪辑后的时间轴**上重新映射的（跨切点的行会拆分），因此删减与字幕不会错位——这正是"外语视频加字幕"最容易翻车的地方。

| 指标 | 结果 | 判据 |
| --- | --- | --- |
| 语音识别 WER（vs 已知讲稿） | **6.1%**（错 6/99 词） | ≤ 25% |
| 语音被字幕覆盖 | **99.8%** | ≥ 95% |
| 句界误差 均/最大 | **0.016s / 0.045s** | ≤ 0.8s / ≤ 1.5s |
| 中文译文覆盖 | **13/13 条** | 100% |
| 中文字幕可读性（峰值） | 8.89 字/秒 | ≤ 20 字/秒 |
| 重映射自检 | 13 条，越界 0，重叠 0，最短 2.03s | 无越界/重叠 |
| 机翻 vs 人工精译（参考） | 62.9% 字符相似度 | 仅报告（见 §5） |
| 成片质检 | 33.88s / 1280×720 / −16.2 LUFS / PASS | — |

一键复跑：`node Tool/run_subs_acceptance.mjs`（记录写进 `History/loops/loop02/acceptance.md`）。

---

## 2. 它现在会做什么

```
外语视频 ─┬─ 抽音轨（16k mono 裸 PCM，避开 WAV 头偏移坑）
          ├─ 离线识别：Vosk（koffi 直连 libvosk.dll，词级时间戳，纯 CPU、无需 GPU/联网）
          ├─ 断句：以"停顿≥0.3s"为候选、限制单句长度、合并过碎片段
          ├─ 翻译：句子级（保留上下文）→ 中文；MyMemory 公开 API（带磁盘缓存）
          │        可选术语表修正（LUFS / Mbps 这类专有词）
          ├─ 排字幕：中文 ≤18 字/行、英文 ≤64 字符/行，行内时间按字数比例分配
          ├─ 重映射：把"原片时间轴"的字幕映射到"剪辑后时间轴"
          │        · 完全落在保留段 → 平移
          │        · 跨切点 → 按保留比例拆成两条（文本按词/字比例分配）
          │        · 保留 <35% 的行 → 丢弃（避免半句话）
          └─ 烧入：libass + SimHei（中文行在上、英文行在下），随成片一起出报告/EDL/时间轴图
```

**为什么"先翻译句子、再切显示行"**：早期版本直接把字幕行切好再翻译，机翻只看到半句上下文，翻出"第二，把...第三归一化"这种串行错位；改成句子级翻译后，13 条行全部通顺可读。

---

## 3. 交付物（`Prototype/loop2_subtitles/case_C_en2zh/`）

| 文件 | 是什么 |
| --- | --- |
| `final_mt.mp4` | **成片（全自动机翻版）**：识别→翻译→烧字幕，全程无人工 |
| `final_polished.mp4` | **成片（人工精译版）**：同样识别时间轴，换成人级译文，用于对比上限 |
| `frame_mt.jpg` / `frame_polished.jpg` | 两张抽帧，直接看双语字幕效果 |
| `bilingual_final_timeline.srt` | 与成片对齐的双语字幕（可直接给剪辑软件用） |
| `zh_source_timeline.srt` / `bilingual_source_timeline.srt` | 原片时间轴版本（未重映射） |
| `transcript.json` | 词级识别结果（词、起止、置信度） |
| `cues.json` | 句子 + 译文 + 显示行（机器可读的字幕决策单） |
| `script.txt` / `ground_truth.json` / `reference_zh.json` | 讲稿、真值（逐句时间）、人工精译参考 |
| `verify_subs.json` / `qa.json` / `timeline.png` / `contact_sheet.jpg` | 验收数据、质检数据、决策时间轴、抽帧拼图 |

本级目录另有：`acceptance_mt.md` / `acceptance_polished.md`（两版验收记录，自动生成）、`reproduce.ps1`（一键复现）。

> 源视频未随包（26MB），用 `node Tool/make_l2_bench.mjs` 一条命令即可重建（讲稿+语音+画面全自动生成）。

---

## 4. 复现 / 怎么用到你自己的视频上

```powershell
# 一键复现本轮全部结论（在仓库根执行；幂等，已下的依赖/模型会复用）
.\Prototype\loop2_subtitles\reproduce.ps1              # 机翻版全链路
.\Prototype\loop2_subtitles\reproduce.ps1 -Polished    # 额外产出人工精译版
```

```powershell
# 分步（首次准备）
node Tool\bootstrap_asr.mjs            # koffi + libvosk + edge-tts（约 82MB，2 分钟）
node Tool\fetch_vosk_model.mjs         # 英语模型 39MB（源站限速，脚本用 6 线程分段拉，约 15 分钟）

# 1) 跑一条外语视频
node Tool\asr_vosk.mjs "你的外语视频.mp4" --out work\transcript.json
node Tool\vfactory.mjs  "你的外语视频.mp4" --out out\cut            # 先剪辑，拿到 EDL
node Tool\make_subs.mjs  work\transcript.json --out work\subs --mt mymemory --glossary Tool\glossary_zh.json
node Tool\remap_subs.mjs work\subs\cues.json out\cut\edits.json --out work\subs\remap --style bilingual
node Tool\vfactory.mjs  "你的外语视频.mp4" --out out\final --srt work\subs\remap\out_bilingual.srt

# 只想出字幕不烧画面：直接用 work\subs\bilingual.srt（原时间轴）或 remap 版（剪辑后时间轴）
```

常用开关：`--mt none`（只出外文字幕）、`--mt agent --zh-file 精译.json`（用人工/LLM 译文）、`--style zh|en|bilingual`（烧入样式）。

**换语种**：`Tool/asr_vosk.mjs` 的 `--model` 指向对应 Vosk 模型目录即可（德语/法语/日语/西语等 Vosk 都有小模型）；`make_subs.mjs` 目前 `langpair` 固定 `en|zh-CN`，换语种改一行；断句/行长参数在 `TH` 里。

---

## 5. 机翻 vs 人工精译（本轮最该看的东西）

同一时间轴、同一断句，只有译文不同：

| # | 识别出的英文 | 机翻（MyMemory） | 人工精译 |
| --- | --- | --- | --- |
| 1 | welcome back to the workshop where return raw footage into finished films | 欢迎回到工作坊，将原始镜头放回成品胶片中 | 欢迎回到工作坊，我们在这里把原始素材变成成片。 |
| 3 | first always cut on the beat because rhythm is what keeps the audience awake | 首先，总是节拍，因为节奏是让观众保持清醒的原因 | 第一，永远在节拍上剪，因为节奏才能让观众保持清醒。 |
| 4 | second remove the silent gaps longer than half a second before you touch the colors | 在触摸颜色之前，将静音间隙移除超过半秒 | 第二，在碰调色之前，先把长度超过半秒的静音空隙去掉。 |
| 5 | third normalize the audio to minus sixty sixteen l u fs which is the standard… | 第三，将音频标准化为负六十六l u fs ，这是在线视频平台的标准 | 第三，把音频响度归一到负十六 LUFS，这是在线视频平台的标准。 |

- 字符相似度均值 **62.9%**（精译版自比 85.7%，差值就是"机翻天花板"）。
- 机翻的问题很集中：**无标点的 ASR 文本**导致专有词被拆开（LUFS → "l u fs"）、语序直译、术语（LUFS/Mbps）被译坏。
- 结论：**能出可看的字幕，但正式交付建议过一遍人工/LLM 润色**。术语表（`Tool/glossary_zh.json`）能修掉一部分，但修不了语序。

---

## 6. 已知限制（诚实清单）

1. **识别模型是 Vosk 小模型**（39MB，纯 CPU）：本轮素材是神经 TTS 朗读稿（很干净），WER 6.1% 属于最好情况；**真实人声、口音、背景噪声下 WER 会明显更高**，未测。
2. **测试素材是合成的英语语音 + 真实画面**：本机 Windows SAPI 的 TTS 在沙箱里被拒（`EACCES/0x80070005`），HuggingFace/ModelScope 全域不可达（下不了 Whisper 类模型），所以选了 Edge 在线神经 TTS 造"讲稿已知"的素材——好处是 WER/时间轴可以机器验收，代价是**不是真人原声**。
3. **机翻质量有限**（见 §5），且 MyMemory 是公开免费 API：有配额、依赖外网、不该用于批量商业产出；生产应换自建 MT 或 LLM 精译。
4. **ASR 没有标点/大小写**：断句靠停顿，遇到"一句话里长停顿"会拆成两句（不影响对齐，但可能影响翻译连贯性）。
5. **只验证了 1 个语种（英→中）**，其他语种只需换模型，未实测。
6. **字幕样式只有一种**（底部、白字黑边、固定字号）；没有描边/位置/双行限制的精细排版，也不做硬字幕/软字幕封装选择（当前一律硬烧）。
7. **长视频未压测**：本轮 34 秒；Vosk 是流式解码，理论线性，但 1 小时素材的内存/耗时未测。
8. 若视频本身**没有音轨**，本功能不适用（会直接报错）。

---

## 7. 下一轮建议（等你挑）

| 选项 | 价值 | 代价 |
| --- | --- | --- |
| **① 换更强 ASR（Whisper 系）** | 真实人声/口音/噪声下 WER 大幅下降，且自带标点 → 翻译质量连带提升 | 需拿到模型（当前 HF 不可达，要另找源）；CPU 上慢，长片需分段/量化 |
| **② 译文质量升级（LLM 精译 + 术语表 + 上下文）** | 直接把"能看"变"能发" | 需要模型/API；成本与合规要定 |
| **③ 多语种 + 自动语种识别** | 一套流程覆盖多国素材 | 每语种一个模型，下载慢；先解决下载通道 |
| **④ 字幕样式/位置/竖屏适配** | 观感专业度 | 纯手艺活，靠目检 |
| **⑤ 软件字幕（可开关）+ 交付多轨** | 平台/客户可自行开关字幕 | 需封装 srt 到 mp4，播放器兼容性要测 |

我的建议：**① + ② 一起做**（先解决"听得准"，再解决"译得好"），③④⑤ 按你要发的平台再定。当前最痛的短板是"模型下载通道"（本机 HF 不可达），下一轮开工前值得先花 15 分钟打通一个可用源。
