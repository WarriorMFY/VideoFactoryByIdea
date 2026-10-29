# 小循环 5 · 双语 + 随语流逐词彩色高亮字幕（karaoke 风格）

> 需求原话：**"做这种双语且随着语流彩色高亮单词的字幕"**（附截图：中文在上、英文在下，当前朗读的英文单词显示为青色高亮）。
> 时间：2026-10-29 08:55–10:05（约 70 分钟）。完成时大循环剩余约 **2 天 1 小时**。

---

## 1. 一句话结论

**做出来了，而且不靠肉眼验收**：新增 `Tool/subtitle/make_ass.mjs` 生成 ASS 字幕（中文整句静态 + 英文逐词重绘上色），`vfactory --srt` 直接支持 `.ass`；两条用例（TTS 素材 / 真实影视素材）都通过客观检查——**高亮存在 12/12 帧、单块不重影 12/12 帧、高亮重心随语流位移 544px / 414px**。

| 用例 | 源 | 词级事件 | 高亮存在 | 单块不重影 | 重心位移 | 成片质检 |
| --- | --- | --- | --- | --- | --- | --- |
| E（TTS 英语素材） | 33.9s / 7 句 / 101 词 | 101 | 12/12 | 12/12 | **544 px** | PASS（−16.2 LUFS） |
| F（Sintel 真实素材，含剪辑重映射） | 40.8s / 4 句 / 25 词 | 25 | 12/12 | 12/12 | **414 px** | PASS（仅残留黑场告警＝已知取舍） |

---

## 2. 怎么做的（技术路线）

```
cues.json（句子 + 词级时间戳 + 中文）
   │  ← 若有 EDL：把每个词的 [start,end] 按保留段重映射（跨切点拆词、被剪掉的词跳过）
   ▼
make_ass.mjs ──► karaoke.ass
   ├─ [V4+ Styles]  ZH=SimHei 40px 白字黑描边（贴底+动态抬高）
   │                EN=Arial  36px 白字黑描边（贴底）
   └─ [Events]
        ZH：每句一条，整句静态（时长=该句在成片里的区间并集）
        EN：**逐词重绘** —— 每个词一条事件，把整句英文重画一遍、只给"当前词"上青色 {\c&H..&}
   ▼
vfactory --srt karaoke.ass  →  烧进成片（libass）
```

**为什么不用 ASS 的原生 karaoke（`\k` 逐字变色）**：`\k` 是**累计**语义（唱过的字一直保持变色），而截图要的是"只有当前词亮、其余保持白色"。libass 里做不到"只亮当前词"的累计式写法，所以用**逐词重绘**：事件数 = 词数（本工程素材量级百级，libass 无压力）。

---

## 3. 三个真踩到的坑（都修了）

| 现象 | 根因 | 修法 |
| --- | --- | --- |
| 画面上**相邻两个词同时变色**（重影） | 每个词事件按 `[word.start, word.end]` 铺，边界那一帧前后两条同时命中 | 改成**首尾相接铺砖**：每个窗口的结束时间取下一个窗口的开始（留 1cs），保证任意时刻只有一个词亮 |
| 中文被英文**压住/重叠** | 中英文都用固定下边距；英文两行时向上生长，正好撞到中文 | 中文用**事件级 MarginV**：`26 + 英文行数 × 字号 × 1.3 + 14`，按每句实际英文行数动态抬高 |
| 标题**压住字幕** | 标题 drawtext 固定在 `y=h*0.74` | `vfactory` 改为：有字幕时标题自动放顶部（`h*0.10`），无字幕时才用底部留白 |

顺带修的：`vfactory` 原先的字幕校验只认 SRT 格式（正则匹配"编号+时间"），**合法 ASS 会被误判跳过**，现在按扩展名分别校验（ASS 查 `[Events]`+`Dialogue:`）。

---

## 4. 客观验收（`Tool/acceptance/verify_karaoke.mjs`）

不靠目检，直接扫像素：

1. 从 ASS 里取所有英文词事件，均匀抽 12 帧（避开首尾 0.5/0.8s 淡入淡出，否则高亮被压暗误判）；
2. 每帧解成 `rawvideo rgb24` 落盘，Node 直接扫描**字幕区**（画面下方 34%）里接近高亮色（#33E6C8，容差 28）的像素；
3. 判三件事：
   - **高亮存在**：每帧都能检出（12/12）；
   - **不重影**：每帧只有 1 个词块，且水平包围盒 <320px（12/12）；
   - **跟着语流走**：不同词帧的重心位移 ≥12px（实测 414–544px）。

> 调参过程中踩到两次误报，都记在脚本注释里：容差 46 会把背景草地/树叶高光误判成高亮（误报 5–13 块）；首尾淡入淡出会把高亮压暗导致"缺失"误报。

---

## 5. 交付物

```text
Prototype/loop5_karaoke_subs/
├── README.md                      # 本文件
├── acceptance.md                  # 两个用例的验收数据
├── reproduce.ps1                  # 一键复现（生成 ASS → 烧入 → 客观验收）
├── case_E_l2_karaoke/             # TTS 素材（101 词，语流密、验证高亮节奏最好）
│   ├── final.mp4                  #   成片
│   ├── karaoke.ass                #   字幕源文件（可直接改样式）
│   ├── cues.json                  #   句子+词级时间+译文
│   ├── frame_2_6s / 9_3s / 12_71s.jpg   # 三个不同词被高亮的抽帧
│   ├── verify_karaoke.json        #   客观验收数据
│   └── qa.json                    #   成片质检
└── case_F_real3_karaoke/          # Sintel 真实素材（25 词，含剪辑重映射）
    ├── final.mp4 / karaoke.ass / cues.json / edits.json
    ├── frame_8_85s / 9_6s / 31_73s.jpg
    ├── verify_karaoke.json / qa.json
```

---

## 6. 怎么用到自己的视频上

```powershell
# 前提：已有识别 + 字幕决策单（cues.json 里带 sentences[].words 词级时间）
node Tool\subtitle\asr_vosk.mjs "外语视频.mp4" --out work\tr.json --af "afftdn=nf=-25,highpass=f=300,lowpass=f=3400"
node Tool\edit\vfactory.mjs  "外语视频.mp4" --out out\cut --protect work\tr.json
node Tool\subtitle\make_subs.mjs work\tr.json --out work\subs --mt mymemory

# 生成 karaoke 字幕并烧入（--edl 让字幕跟着剪辑后的时间轴）
node Tool\subtitle\make_ass.mjs work\subs\cues.json --edl out\cut\edits.json `
     --out work\karaoke.ass --hl 33E6C8
node Tool\edit\vfactory.mjs "外语视频.mp4" --out out\final --protect work\tr.json --srt work\karaoke.ass

# 客观验收（可选）
node Tool\acceptance\verify_karaoke.mjs out\final.mp4 work\karaoke.ass --hl 33E6C8 --json out\verify_karaoke.json
```

**可调参数**（`make_ass.mjs`）：`--hl` 高亮色（默认青绿 `33E6C8`）、`--spoken-color` 已唱词变色（默认关）、`--zh-size/--en-size`、`--wrap-zh/--wrap-en` 换行宽度、`--zh-margin/--en-margin` 下边距、`--style bilingual|en|zh`。

---

## 7. 已知限制

1. **词级时间来自 ASR**，识别错的地方高亮也会跟着错（真实影视素材 WER 约 35–45%，见小循环 3）。
2. **逐词重绘**的事件数 = 词数；1 小时长片约 1–1.5 万条事件，libass 仍可处理但文件会到几 MB，未压测。
3. 只做了"当前词高亮"，没做"卡拉OK 扫光（sweep）"和"长句按停顿自动换页"（长句靠 `--wrap-*` 手动换行）。
4. 样式是写死的两套（中文/英文）；没有做主题化/多语言字体回退（英文用 Arial，中文用 SimHei）。
5. 硬字幕（烧进画面），不产出可开关的软字幕轨。

> 若需要"扫光/进度条式"高亮：ASS 的 `\kf` 可以配合"每个词一条事件 + `\kf`"实现，但要注意它是累计语义，得按词拆条重绘；下一轮可做。
