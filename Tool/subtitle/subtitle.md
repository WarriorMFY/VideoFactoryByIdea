# subtitle/ — 外语视频 → 中文字幕

> 四步一条链：**识别 → 断句翻译 → 排显示行 → 重映射到剪辑后时间轴**，最后交给 `edit/vfactory.mjs --srt` 烧进成片。
> 顺序不能反：字幕必须跟着剪辑结果走，否则删减越多、错位越狠。

## 文件

| 脚本 | 作用 |
| --- | --- |
| `asr_vosk.mjs` | 离线识别（koffi 直连 `libvosk.dll`），输出**词级时间戳** `transcript.json`；`--af` 可指定音频预处理，`--model` 换模型/语种 |
| `make_subs.mjs` | 断句（按停顿 + 长度上限 + 最短句长）→ **句子级**翻译（MyMemory / agent / none）→ 排显示行 → `cues.json` + `en/zh/bilingual.srt` |
| `remap_subs.mjs` | 把**原片时间轴**的字幕重映射到**剪辑后时间轴**（跨切点拆分、保留<35% 丢弃、过短补齐） |
| `verify_subs.mjs` | 字幕验收：有讲稿时算 WER/句界误差；无讲稿自动切 reference-free（译文覆盖/可读性/重映射自检） |
| `glossary_zh.json` | 机翻术语表（修 LUFS / Mbps 这类被译坏的专有词） |

## 最短链路

```powershell
node Tool\subtitle\asr_vosk.mjs "外语视频.mp4" --out work\tr.json `
     --af "afftdn=nf=-25,highpass=f=300,lowpass=f=3400"
node Tool\edit\vfactory.mjs "外语视频.mp4" --out out\cut --protect work\tr.json
node Tool\subtitle\make_subs.mjs work\tr.json --out work\subs --mt mymemory --glossary Tool\subtitle\glossary_zh.json
node Tool\subtitle\remap_subs.mjs work\subs\cues.json out\cut\edits.json --out work\subs\remap --style bilingual
node Tool\edit\vfactory.mjs "外语视频.mp4" --out out\final --protect work\tr.json --srt work\subs\remap\out_bilingual.srt
```

## 关键参数

| 参数 | 默认 | 含义 |
| --- | --- | --- |
| `asr --af` | 空 | 音频预处理。真实影视音轨推荐 `afftdn=nf=-25,highpass=f=300,lowpass=f=3400`（置信度 0.816→0.918） |
| `asr --model` | small-en-us-0.15 | 换语种/换模型。实测 128MB 的 lgraph 大模型在影视混音上**更差** |
| `make_subs --mt` | mymemory | `mymemory` 全自动 / `agent`（`--zh-file` 人工或 LLM 精译）/ `none` 只出外文 |
| `--pause` / `--max-sent` / `--min-sent` | 0.3s / 110 / 12 | 断句：停顿阈值、单句字数上限、最短句长（真实对白多短句，`min-sent` 别设太大，否则两句并一句再翻译会串味） |
| `--max-zh` / `--max-en` | 18 / 64 | 单行显示宽度 |
| `remap --style` | bilingual | 烧入样式：`zh` / `en` / `bilingual` |
| `remap --min-dur` | 0.6s | 重映射后过短的行补齐到该时长 |

## 坑

- **先翻译句子、再切显示行**。反过来会让机翻只看到半句，翻出"第二，把…第三归一化"这种串行错位。
- Vosk 结果是逐段吐出的（`final_result()` 常为空），必须逐段收集 `result` 再按时间去重。
- ASR 无标点：断句只能靠停顿，长句会带偏翻译 → 宁可多切、别合并。
- 音频必须是 **16k 单声道裸 PCM**（WAV 头长度不固定，按 44 字节跳会读出垃圾）。
- 字幕样式需 `FontName=SimHei`（中文），否则方块（见 [`../env.md`](../env.md)）。
