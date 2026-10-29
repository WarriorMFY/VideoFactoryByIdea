# subtitle/ — 外语视频 → 中文字幕

> 四步一条链：**识别 → 断句翻译 → 排显示行 → 重映射到剪辑后时间轴**，最后交给 `edit/vfactory.mjs --srt` 烧进成片。
> 顺序不能反：字幕必须跟着剪辑结果走，否则删减越多、错位越狠。

## 文件

| 脚本 | 作用 |
| --- | --- |
| `asr_vosk.mjs` | 离线识别（koffi 直连 `libvosk.dll`），输出**词级时间戳** `transcript.json`；`--af` 可指定音频预处理，`--model` 换模型/语种 |
| `make_subs.mjs` | 断句（按停顿 + 长度上限 + 最短句长）→ **句子级**翻译（MyMemory / agent / none）→ 排显示行 → `cues.json` + `en/zh/bilingual.srt` |
| `make_ass.mjs` | **双语 + 逐词彩色高亮（karaoke）**：中文整句静态（在上）+ 英文逐词重绘上色（在下）→ ASS；带 `--edl` 时按剪辑重映射 |
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

## 双轨选择

| 想要什么 | 用哪个 | 产物 |
| --- | --- | --- |
| 普通双语/单语字幕（整行同时出现） | `remap_subs.mjs` → SRT | `out_bilingual.srt` |
| **随语流逐词彩色高亮**（karaoke 风格） | `make_ass.mjs` → ASS | `karaoke.ass`（`vfactory --srt` 直接认 ASS） |

```powershell
# karaoke：中文在上静态、英文在下逐词高亮
node Tool\subtitle\make_ass.mjs work\subs\cues.json --edl out\cut\edits.json `
     --out work\karaoke.ass --hl 33E6C8
node Tool\edit\vfactory.mjs "外语视频.mp4" --out out\final --protect work\tr.json --srt work\karaoke.ass
node Tool\acceptance\verify_karaoke.mjs out\final.mp4 work\karaoke.ass --hl 33E6C8   # 客观验收
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
| `make_ass --hl` | 33E6C8 | 当前词高亮色（RRGGBB） |
| `make_ass --spoken-color` | 空（关） | 已唱过的词换成另一色（默认不换，只亮当前词） |
| `make_ass --zh-size/--en-size` | 40 / 36 | 中英字号（PlayRes 与成片一致时即像素级） |
| `make_ass --wrap-zh/--wrap-en` | 14 / 40 | 单行换行宽度（WrapStyle=2 关闭自动换行，全靠这里） |
| `make_ass --style` | bilingual | `bilingual` / `en` / `zh` |
| `make_ass --zh-margin-mode` | fixed | `fixed`＝中文位置全片统一（**不抖**）；`dynamic`＝按每句英文行数贴合 |
| `make_ass --merge-word` | 0.18s | 短于该时长的词并入**同一行**相邻 tile 一起高亮（防高频跳色）；0＝关闭 |
| `make_ass --hold-tail` / `--min-show` | 0.25s / 0.067s | 句末词最多延长多久 / 句末事件最短显示 |

## 坑

- **先翻译句子、再切显示行**。反过来会让机翻只看到半句，翻出"第二，把…第三归一化"这种串行错位。
- Vosk 结果是逐段吐出的（`final_result()` 常为空），必须逐段收集 `result` 再按时间去重。
- ASR 无标点：断句只能靠停顿，长句会带偏翻译 → 宁可多切、别合并。
- 音频必须是 **16k 单声道裸 PCM**（WAV 头长度不固定，按 44 字节跳会读出垃圾）。
- 字幕样式需 `FontName=SimHei`（中文），否则方块（见 [`../env.md`](../env.md)）。
- **识别工作目录必须每次独立**（`History/asr/.../.asr_work/<输出名>_<pid>/`）：曾固定用 `.asr_work/`，
  被 kill 的 job 留下的孤儿进程和新进程抢同一个 PCM，结果 33s 片子识别出 262s 的音频、字幕时间码静默错位。
  现在还会**校验抽音频时长与输入一致**（差 >2% 直接失败）。
- **短句是当前最大短板**（小循环 4 实测）：真实电影里 1–3 词短句（`Abort!`/`Cut!`/`Nooooo!`）覆盖率只有 24%，
  长句 84%。别把 WER 差距当"译错"，先看是真漏句还是错词。
- **空 SRT 会让烧入失败**：`vfactory` 现在会先判空/判合法，跳过烧入并告警；上游 `make_subs`/`remap_subs`
  仍可能产出 0 行字幕（例如素材只有 1 个噪声词），这是正常结果，不是 bug。

## karaoke（ASS）的坑

- **不要用 ASS 原生 `\k` 做"只亮当前词"**：`\k` 是累计语义（唱过的字一直亮）。要"只有当前词亮"就必须
  **逐词重绘**：每个词一条事件、把整句英文重画一遍、只给当前词上色。事件数 = 词数，量级在万级以内 libass 无压力。
- **词事件必须首尾相接**：若按 `[word.start, word.end]` 直接铺，边界那一帧前后两条同时命中 → 画面上**两个词同时变色**（实测重影）。
  正确做法：每个窗口结束时间取下一个窗口的开始，留 1cs 间隔。
- **中英文垂直排版**：英文贴底、中文的 `MarginV` 要按"该句英文实际行数"动态抬高
  （`26 + 行数×字号×1.3 + 14`），否则英文两行时会把中文压住。
- **`vfactory` 的 ASS 校验**：早期只认 SRT（正则匹配"编号+时间"），合法 ASS 会被误判跳过；现在按扩展名分别校验。
- **ASS 不要再叠 `force_style`**：ASS 自带样式，`vfactory` 对 `.ass` 走纯净滤镜（否则 karaoke 颜色/排版被覆盖）。

## karaoke 抖动的三个真根因（2026-10-29 反馈后修）

第一版交付后反馈"字幕频繁抖动"。用 `acceptance/diagnose_flicker.mjs` 逐帧量化，定位到三处，全部修掉：

| 现象 | 根因 | 修法 |
| --- | --- | --- |
| 英文行**整行消失几帧再出现**（闪断 30 帧/16 组） | 词事件按 `[word.start, word.end]` 各自铺，词与词之间空档（可达 0.2s）**没有任何事件覆盖** | 每个 tile **无缝延伸到下一个 tile 开始**；空档期间保持上一个词高亮 |
| **高亮像没亮**（缺失 80 帧/37 组） | 单/双字母词（ASR 把 LUFS 听成 `l u f s`）高亮像素只有个位数，且 0.06–0.1s 就换色 | 过短词（<0.18s）与**同一行内**相邻词合并成一个 tile；单双字母强制合并（**不跨行**，跨行合并会"行尾词+下一行行首词"同时亮，观感更差） |
| 跨句**整块上下跳**（45 次，最大 55px） | 中文 `MarginV` 按每句英文行数动态算，行数不同就跳 | 中文位置改**全片固定**（`--zh-margin-mode fixed`，按最大行数算一次） |

诊断口径（也踩过坑，写进脚本注释）：必须**把 ASS 烧到纯黑底**上测（否则 BBB 草地/白云会被当白字，误报 29 帧闪断）；
"应显示"区间要用**中文整句**而不是英文事件并集（否则正好漏掉词间空档）；
位置判据要用**文字块上下边界**而不是白字质心（质心随上色词漂移，误报 14–18px）。
