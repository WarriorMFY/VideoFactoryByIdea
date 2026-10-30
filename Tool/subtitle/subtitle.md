# subtitle/ — 外语视频 → 中文字幕

> 四步一条链：**识别 → 断句翻译 → 排显示行 → 重映射到剪辑后时间轴**，最后交给 `edit/vfactory.mjs --srt` 烧进成片。
> 顺序不能反：字幕必须跟着剪辑结果走，否则删减越多、错位越狠。

## 文件

| 脚本 | 作用 |
| --- | --- |
| `asr_vosk.mjs` | 离线识别（koffi 直连 `libvosk.dll`），输出**词级时间戳** `transcript.json`；`--af` 可指定音频预处理，`--model` 换模型/语种 |
| `restore_punct.mjs` | **标点/大小写恢复**（无模型、纯规则）：按停顿分位数切句，补句末标点（`?`/`!`/`.`）、逗号、句首大写、代词 I、术语/专名大写 → `transcript_punct.json`（词级时间不变） |
| `make_subs.mjs` | 断句 → **句子级**翻译（MyMemory / agent / none）→ 排显示行 → **阅读速度节流** → `cues.json` + `en/zh/bilingual.srt`；`--punct` 直接吃标点版句子 |
| `make_ass.mjs` | **双语 + 逐词彩色高亮（karaoke）**：中文整句静态（在上）+ 英文逐词重绘上色（在下）→ ASS；带 `--edl` 时按剪辑重映射 |
| `remap_subs.mjs` | 把**原片时间轴**的字幕重映射到**剪辑后时间轴**（跨切点拆分、保留<35% 丢弃、过短补齐） |
| `export_review.mjs` | 把 `cues.json` 导成**人工校对表** `review.csv`，并标出 `cps_over`/`zh_long`/`en_residual`/`sp_gap`/`empty_zh` |
| `apply_review.mjs` | 把改过的 `review.csv` **回写**成 `cues.json` + 三份 SRT；行数/idx/时间码/en/空译文逐项校验，不合格就拒绝写入 |
| `asr_rescue.mjs` | **短句救援**（实验性，默认不开）：能量 VAD 找"有声但没识别"的区间，逐窗滤波放大重识别。实测在当前模型上救不回来（见 `Prototype/loop7_short_utterance/`），但"找未覆盖区间"本身可当漏译检查器 |
| `classify_content.mjs` | **内容分诊**（小循环 11）：语音覆盖/置信度/**配乐占比**/短句占比/句长/术语密度 → `knowledge`/`mixed`/`narrative` + 当前策略建议（CPS、翻译后端、是否需要人工校对） |
| `normalize_units.mjs` | **数值与单位规范化**（小循环 11）：`minus sixty sixteen l u fs` → `−16 LUFS`、`fifteen megabits per second` → `15 Mbps`；只改句子文本、不动词级时间，替换留痕、幂等 |
| `align_script.mjs` | **讲稿强制对齐**（小循环 12）：有讲稿/官方字幕时，按真值句子把 ASR 词流切开（TTS/连续口播的 Vosk 词时间轴常常首尾相接，靠停顿断句会把多句并成一句） |
| `term_candidates.mjs` | **术语候选**（小循环 11）：从转录挑"该进术语表的词"（缩写/单位、专名、高频词、高频二元短语），标注是否已在表 |
| `verify_subs.mjs` | 字幕验收：有讲稿时算 WER/句界误差；无讲稿自动切 reference-free（译文覆盖/可读性/重映射自检） |
| `glossary_zh.json` | 术语表：普通键值修**译文**；`_source_fixes` 修**源句**（ASR 拆坏的 `l u fs` → `LUFS`），送翻译前生效 |

## 最短链路

```powershell
node Tool\subtitle\asr_vosk.mjs "外语视频.mp4" --out work\tr.json `
     --af "afftdn=nf=-25,highpass=f=200,lowpass=f=4000"
node Tool\subtitle\restore_punct.mjs work\tr.json --out work\tr_punct.json --glossary Tool\subtitle\glossary_zh.json
node Tool\edit\vfactory.mjs "外语视频.mp4" --out out\cut --protect work\tr.json
node Tool\subtitle\make_subs.mjs work\tr_punct.json --out work\subs --mt mymemory --punct --glossary Tool\subtitle\glossary_zh.json --cps 20
node Tool\subtitle\remap_subs.mjs work\subs\cues.json out\cut\edits.json --out work\subs\remap --style bilingual
node Tool\edit\vfactory.mjs "外语视频.mp4" --out out\final --protect work\tr.json --srt work\subs\remap\out_bilingual.srt
```

> 加了标点之后的收益是可量化的（同一素材）：句末缺标点 **7/7 句 → 0**、术语错误 **1 → 0**，
> 句界与讲稿真值 F1 **1.00**、句末标点正确率 **100%**，而文本 WER 不变（说明只补标点没改词）。

## 发布级译文（`--mt agent`）

机翻只到"能看懂"。要发布级，把译文换成人工/LLM 精译，两步：

```powershell
# 1) 导出待译清单（已做源端术语纠错，如 l u fs → LUFS；cues 不产出）
node Tool\subtitle\make_subs.mjs work\tr_punct.json --punct `
     --glossary Tool\subtitle\glossary_zh.json --dump-en work\zh_todo.json
# 2) 填好中文（格式 `{ "英文原句": "中文译文" }`），再跑流水线
node Tool\subtitle\make_subs.mjs work\tr_punct.json --out work\subs --punct `
     --glossary Tool\subtitle\glossary_zh.json --mt agent --zh-file work\zh_todo.json --cps 20
```

- 模板的键就是断句结果，**别改键**；缺句会直接 `throw`（不会静默退回机翻）。
- 键查找顺序：原句 → 源端纠错后的原句 → 去掉句末标点的版本，所以手写时加不加句末句号都能对上。
- 精译版与机翻版**共用同一条时间轴**，可以直接对比（`verify_translation.mjs` 算缺陷数 + 与参考译文的相似度）。

## 人工校对回写（`export_review` → 改 CSV → `apply_review`）

机器产出之后，人能改、改完能回灌：`cues.json` 是下游（重映射/高亮/烧入）的唯一输入，所以**必须回写到 cues**，不能只改 SRT。

```powershell
node Tool\subtitle\export_review.mjs work\subs\cues.json --out work\review            # → review.csv（只改 zh 列）
node Tool\subtitle\apply_review.mjs  work\subs\cues.json work\review\review.csv --out work\reviewed
node Tool\edit\vfactory.mjs 原片.mp4 --out out\final --srt work\reviewed\bilingual.srt
```

- 导出时会打标：`cps_over`（读太快）/`zh_long`（太长）/`en_residual`（残留英文）/`sp_gap`（中英缺空格）/`empty_zh`（漏译），
  外加**术语一致性审计**（小循环 9）：`term_missing`（英文里有 `LUFS`/`Mbps` 这类术语，中文里找不到规范写法——最常见就是被行宽切行切断）、
  `term_variant`（译成了术语表里记录的错法，如「卢夫斯」）。术语统计写在 `review.json` 的 `term_audit`。
- 回写会逐项校验，**任一不合格就拒绝写入并报行号**：行数、idx 顺序、时间码被改、`en` 被改、`zh` 为空。
  确实要改时间码时用 `--allow-retime`（会记进 `review_report.json`）；改原文用 `--allow-en-edit`（`en` 是高亮锚点，慎用）。
- 恒等测试：导出→不改→回写，`cues.json` 与 `bilingual.srt` 逐字节一致（`Tool/acceptance/run_review_acceptance.mjs`）。

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
| `asr --af` | 空 | 音频预处理。**真实影视音轨推荐 `afftdn=nf=-25,highpass=f=200,lowpass=f=4000`**：TOS 90s 上 WER 31.6%→28.4%（代价：词数 82→79，噪声段少猜了） |
| `asr --model` | small-en-us-0.15 | 换语种/换模型。实测 128MB 的 lgraph 大模型在影视混音上**更差** |
| `make_subs --mt` | mymemory | `mymemory` 全自动 / `agent`（`--zh-file` 人工或 LLM 精译）/ `none` 只出外文 |
| `make_subs --dump-en` | 关 | 只导出待译模板 `{ "英文原句": "" }` 后退出（给 `--mt agent` 用），不翻译 |
| `make_subs --punct` | 关 | 使用 `restore_punct.mjs` 的带标点断句（翻译质量明显更好，推荐开） |
| `make_subs --cps` | 20 | 中文阅读速度上限（字/秒）；先延长显示、再按标点拆分，仍超标只在日志里报数 |
| `make_subs --no-unit-norm` | 关（即默认开规范化） | 只做术语表纠错、**不做**数值/单位规范化（小循环 11 的对照组开关） |
| `restore_punct --sent-pause` | 自动(p80) | 断句阈值：默认取词间停顿的 **80 分位**（夹在 0.30–0.70s） |
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
  小循环 7 已把这条路探到底：**干净 TTS 下这些短句能识别（8/10），原片混音下 0/10**，
  7 条预处理链 × 10 条漏句 = 0 命中，窗口放大到 6–10s 也救不回来 → 是模型能力上限，换 Whisper 级之前别在"喂法"上继续投入。
- **Vosk 的 recognizer 是有状态的**：复用同一个 recognizer 识别第二段音频，时间戳会接着上一段累加
  （实测 90s 素材里出现 105s/112s 的词）。模型可复用，**recognizer 必须每段新建**（`lib/vosk.mjs` 已封装）。
- **短窗解码会空**：1–2s 切片经常 `acceptHits=0`、`final_result` 为空，别指望"切小段逐个识别"。
- **空 SRT 会让烧入失败**：`vfactory` 现在会先判空/判合法，跳过烧入并告警；上游 `make_subs`/`remap_subs`
  仍可能产出 0 行字幕（例如素材只有 1 个噪声词），这是正常结果，不是 bug。

## 标点恢复的坑（小循环 6）

- **断句阈值别用中位数**：影视素材句内停顿本身就有 0.2–0.5s，`median×3` 会把一句台词切成两半（实测
  `you don't / long as i can remember`）。改用**停顿分布的 80 分位**并夹到 [0.30, 0.70]。
- **`_source_fixes` 必须精确取键**：用 `startsWith('_source_fixes')` 会命中说明字段 `_source_fixes_note`（字符串），
  于是拿字符串去遍历做替换 = 静默失效（实测 LUFS 仍被译成 `luf`）。
- **术语纠错要在"送翻译之前"**：ASR 把 `LUFS` 拆成 `l u fs`，事后替换译文已经来不及；先修源句再翻。
- **MyMemory 单次 500 字符上限**：超长句返回 403 `QUERY LENGTH LIMIT`，`make_subs` 会拆成两次请求再拼。
- **CPS 不是万能的**：下一条字幕已经压上来时，物理时间不够就无法达标；`make_subs` 会**报告超标条数**，不假装已修好。
- **标点验收要有真值**：用 TTS 讲稿当基准（句界 F1、句末标点、去标点后 WER），别靠肉眼看"像不像"。 

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
