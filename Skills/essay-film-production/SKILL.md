---
name: essay-film-production
description: "散文影像（essay film）成片生产：把 AI 静帧 / 版式卡 / 旁白三样素材，按一份 spec 组装成有双峰节奏、叙事调色、双层字幕与三级混音的短片。当用户说「把这篇稿做成短片」「用图+旁白剪一条」「做一条散文影像」「复现《光偷走的那两小时》那种剪辑」「版式卡/金句卡/双栏数据卡怎么进成片」时使用。只覆盖 loop23 这一次实验验证过的 8 类技术，方法论与参数在此，实现一律按仓库路径引用。"
description_en: "Essay-film production: assemble stills, layout cards and narration into a short film with dual-peak rhythm, narrative color temperature, layered subtitles and 3-tier audio mix. Covers only the 8 techniques validated in loop23. Methodology and parameters here; implementation referenced by repo path."
license: Internal
allowed-tools:
disable: false
---

# 散文影像成片：从 spec 到一条能看的短片

这条技能管**生产**：给定一份旁白稿，产出 2 分钟左右的短片，节奏有快慢、色温有走向、声音有层次。
它不管**选题**，也不管**学别人怎么剪**——那是 `Skills/edit-craft-scouting/SKILL.md` 的事。
本技能里的 8 类技术，全部是那次实验里被量化判卷采纳过的，不是从教程抄来的清单。

一句话产出：**输入 spec.json + 图片目录 + 版式卡目录，输出 final.mp4 + manifest.json，全程本地、不联网、不发布。**

## 什么时候用

- 手里有一篇 800–1200 字的散文/说明稿，想做成 2 分钟短片（不是口播，不是 PPT 翻页）
- 需要"图 + 旁白 + 图表卡"三段式结构，且希望节奏不像幻灯片
- 要复现或改写 `Prototype/loop23_shortfilm/spec.json` 那条片
- 需要版式卡（标题/金句/双栏数据/折线图/片尾）以整屏 PNG 进时间轴

**不适用**：访谈/多机位素材剪辑；纯口播；竖屏切片；需要真实拍摄素材的项目。

## 八类技术 → 落点（这张表就是本技能的核心）

| # | 技术 | 在 spec 里怎么写 | 经验值 | 失败长相 |
| --- | --- | --- | --- | --- |
| 1 | 极限快切 | 连续若干 `kind:"img"`，`dur` 0.6–0.7，同 `chapter` | 开场 5 连切，ASL 0.6s | 低于 0.55 开始频闪；观众只能靠暂停看清 |
| 2 | 声画同步 | 不用写，渲染器按切点自动铺音效 | whoosh 0.30、章节首 impact 0.50 | 音量压过人声第一字（>0.5 必盖） |
| 3 | 双峰节奏 | `dur` 刻意分两簇：0.6–0.7 与 3.2–6.0 | min ≤0.7s、p90 ≥4s | 全片 5s 均速 = 幻灯片；全片 0.6s = 只剩炫技 |
| 4 | 叙事调色 | 每镜 `k`（色温 K），按时代递进 | 1800→2700→4300→5000→6500→7500→回升 4000 | 全片一个色温：像套滤镜，不像叙事 |
| 5 | 镜头内运动 | `zoom` 取 in / out / pan-l / pan-r / still | 1.10× 顶，0.0009/帧 | 原图宽 <2000px 直接推近 → 糊（必须先超采样） |
| 6 | 日记字幕层 | 段上写 `tts`，字幕自动生成 | 起点 +0.3s，收尾 = min(段尾−0.15, 语音+0.35) | `dur` 短于语音 → 末字被切（用 `max(dur, 语音+0.8)`） |
| 7 | 双栏信息卡 | `kind:"info"` + `card:"infoN.png"` | 左 56% 透画面 / 右 44% 渐变面板 | 数字卡与画面抢主体：左图必须虚化或压暗 |
| 8 | 花字 | `overlays:[{text, style:"num", at, dur}]` | 120px 橙字，中上 `\pos(960,200)` | 图表卡自带标题时压字（见坑 6） |

八类不必全上；**但一条片里至少要有 3 类，且必须包含第 3 类（节奏）**——否则它就是配了旁白的图集。

## 七步流水线（渲染器内部顺序，别调换）

```text
① TTS 逐段合成 → ② 排时间轴 → ③ 逐 shot 串行渲染 clip → ④ concat + 视频流时长校验
→ ⑤ 三级音频预混 → ⑥ 生成 ASS 双层字幕 → ⑦ 终合成 + 视频流时长校验 + manifest
```

为什么逐 shot 串行：单图多分支 filter_complex 会打爆 h264 解码器，**视频流静默截断而退出码为 0**。
这条铁律来自 `History/loops/loop18/notes.md` 的坑 17，本管线继承。

校验只看两处，但两处都必须过：concat 后、终合成后，各查一次**视频流**时长（`-select_streams v:0`），
容器时长会被音频撑满，查不出截断。

## 时间轴：语音驱动，不手填

段长 = `max(dur, 语音时长 + 0.8)`。手填的 `dur` 只是下限，不是真值——中文 6 秒稿经常念到 7.2 秒，
按 6 秒排会让下一镜在话说一半时切走。渲染器会打印总时长，**以它为准**再回填简介里的时间点。

## 三级音频：谁让谁

| 层 | 内容 | 关键参数 |
| --- | --- | --- |
| voice | TTS 分段，按 `start+0.3` 对齐字幕 | 先 amix 成一条，再 `asplit` 成两路（一路给 ducking 触发） |
| sfx | 切点 whoosh + 章节首 impact | 快切段相邻 <0.7s 时 whoosh 会连成噪声 → 关掉或降到 0.2 |
| bgm | 合成 drone pad（55+110Hz + 粉噪空气层，零版权） | `sidechaincompress` threshold 0.02 / ratio 6 / attack 80 / release 500 |
| 总 | 三组 amix → `loudnorm I=-16 TP=-1.5 LRA=11` | 人声段应主导（-20dB 量级），静读卡时 BGM 回升 |

**BGM 是速度床，不是节拍器。** 别声称"踩点对齐"——实测踩点混剪的切点落峰仅 1.1× 随机（坑 20），
切点的"点"多半是画面语义。这条片也一样：音效负责标点，BGM 只负责托住情绪。

## 版式卡：HTML 排版，浏览器截图

卡片一律用一页 HTML 排（`Prototype/loop23_shortfilm/cards.html` 是母版），Playwright 逐块截成 1920×1080 PNG。
理由：字距、渐变、SVG 折线、绝对定位，在浏览器里所见即所得；在 ffmpeg 里画 drawtext 是自找麻烦。

三条设计约束：

1. **每个卡块必须是固定 1920×1080 的整屏块**（渲染器会检测尺寸偏差并告警）
2. 一页 HTML 放全部卡，用 id 区分；配色只用一套（本片：米金 `#c8956a` + 近黑 `#08080a`）
3. 双栏卡的左侧画面从 `cards_src/` 引用，由渲染脚本先拷图再截图

版式卡**不套色温**：设计稿的米色/橙字一旦被 `colortemperature` 推一遍就变脏黄。色温只作用于照片。

## 素材：AI 静帧的三条硬约束

1. **裁掉水印带**：生成图底部常有标识，进时间轴前用 crop 切掉（本片 `crop=1536:864:0:0`）
2. **先超采样再推近**：裁完只有 1536 宽，直接 1.10× 推近等于放大原图 → 边缘糊；
   统一 `scale=2400:-2` 留出余量再 `zoompan`
3. **片尾必须声明 AI 生成**：本片片尾卡写"画面为 AI 生成 · 仅用于剪辑技术研究"；
   外部素材（他站视频）一律不进成片，只做技术研究

## QC 闸门（不过就别拿去给人看）

1. 视频流时长与时间轴差 ≤0.3s（两处都查）
2. 抽帧 16 格：调色梯度 / 双栏卡 / 图表 / 花字 / 字幕 / 水印残留，逐格看
3. `shot_profile` 复核：min ≤0.7s 且 p90 ≥4s（双峰成立），切点数与 spec 镜头数对得上
4. 字幕在安全区，不压花字、不压卡片主数字
5. 人声段与静读卡的电平差 ≥6dB（能量包络抽查即可，别当音乐分析用）
6. 魔数：1080p30 / CRF 19 / AAC 160k / `+faststart`；2 分钟片落在 20–25MB

细则见 [`references/qc-checklist.md`](references/qc-checklist.md)。

## 坑位（本次实盘，全都会静默失败）

1. **就地转码必被 ffmpeg 拒绝**：`-i a.wav … a.wav` 报 `same as Input #0 - exiting`。
   原实现没检查返回状态，这条归一化**从未真正执行**，靠末段 loudnorm 兜住了听感。
   修法：raw → 归一化两步，且检查状态（已固化进 ops 版）。
2. **相对路径 × 继承 cwd**：`card_dir` 写成相对路径时，换目录运行会让 card 分支全部失败，
   concat 只拼出 3.8s 的片子，且**退出码 0**。修法：一切路径绝对化 + 每个分支检查状态。
3. **filter label 只能消费一次**：人声同时喂 ducking 与总混会报 `matches no streams`，报错指向图尾部。
   修法：`asplit=2`。
4. **版式卡套色温 = 毁设计**：卡是设计原色的，别进调色层。
5. **`\pos(960,200)` 是死坐标**：图表卡顶部自带标题，花字固定在这个位置会轻微重叠（本片遗留）。
   花字位置应随卡型给两个 y：普通图 200、图表卡 120 或改右下。
6. **快切段连发 whoosh**：间隔 <0.7s 时音效连成白噪声，比没有更难听。
7. **`--reuse-tts` 按目录隔离**：换输出目录复用 TTS，要先把旧 `.work/*.wav` 拷进新目录（坑 18）。

## 本仓库参考实现（按路径引用，不复制）

| 用途 | 路径 |
| --- | --- |
| 渲染主链（参数化，含 spec 校验与降级分支） | `Tool/ops/make_essay.mjs` |
| 版式卡批量截图 | `Tool/ops/render_cards.mjs` |
| 本片 spec（21 镜，含 8 类技术映射说明） | `Prototype/loop23_shortfilm/spec.json` |
| 版式卡母版（7 张卡的 HTML/CSS/SVG） | `Prototype/loop23_shortfilm/cards.html` |
| 定版成片与 manifest | `Prototype/loop23_shortfilm/out/final.mp4` |
| 定版时的原样脚本（冻结快照，仅供复现） | `Prototype/loop23_shortfilm/make_essay.mjs` |
| 节奏画像数据 | `History/loops/loop23/profile_final.json` |
| 工具表与全部坑位 | `Tool/ops/ops.md` |
| 方法论上游（选种/判卷/人闸门） | `Skills/edit-craft-scouting/SKILL.md` |

## 红线

1. **不发布**：成片一律停在人闸门，发布由人决定。
2. **不伪造指标**：节奏、电平、时长一律贴实测数字，不写"更有电影感"。
3. **素材干净**：外部视频不进成片；AI 画面在片尾标注；数据必须多源核实并写来源。
4. **不改设计稿迁就渲染**：卡与画面尺寸不匹配时改 spec，不改卡片版式。

## 完成判据

逐条打勾才算交付，细则见 [`references/qc-checklist.md`](references/qc-checklist.md)：

1. spec 里 8 类技术至少落 3 类，含双峰节奏；每类能在成片里指出具体镜头号
2. 时间轴由语音驱动，总时长与渲染器打印值一致
3. 两处视频流时长校验通过，误差 ≤0.3s
4. 抽帧 16 格全过，水印零残留
5. `shot_profile` 双峰指标成立（min ≤0.7s、p90 ≥4s）
6. 三级音频齐备，人声段主导，静读卡 BGM 回升
7. 片尾有 AI 生成声明与数据来源
8. 停在人闸门前：未发布、未改 Tool 以外的归档
