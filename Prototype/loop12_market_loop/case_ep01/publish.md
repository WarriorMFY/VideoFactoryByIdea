# 交付包 · EP01「5 个剪辑提速技巧」（工厂样片）

> 这期节目是为了验证 **市场 → 工厂 → 交付 → 反馈 → 迭代** 这条链路能不能跑通，
> 所以它同时是**产品样片**和**流水线证据**。素材授权干净（CC-BY 画面 + 合成语音），可以直接公开，不涉及搬运侵权。

## 1. 选题依据（来自真实市场侦查，见 `History/loops/loop12/market_report.md`）

| 关键词 | 搜索结果量 | 前 8 条播放合计 | 说明 |
| --- | --- | --- | --- |
| 中英双语 | 1000（封顶） | 1288 万 | 需求明确，供给大多是"搬运 + 机翻字幕" |
| 编程教程 英文 | 1000（封顶） | 2517 万 | 英文长教程的受众最大 |
| Blender 教程 双语 | 1000（封顶） | 1903 万 | 软件教程 + 双语是刚需 |
| 剪辑教程 英文 | 1000（封顶） | 418 万 | **本期选它**：与工厂现有素材/能力最贴合 |

结论：**"英文原声 + 高质量中英双语"是一个被验证过的需求，而现有供给普遍在"字幕质量"上偷懒** ——
这正是工厂能打的位置（双语 + 逐词高亮 + 术语/单位规范 + 人工校对回写）。

## 2. 交付物清单

| 文件 | 说明 |
| --- | --- |
| `render_16x9/final.mp4` | **主交付**：1280×720 / H.264 / 30fps / AAC 48k，37.4s，烧入双语 + 逐词高亮，QA **PASS** |
| `karaoke.ass` | 双语逐词高亮字幕（可复用到其它平台/软字幕） |
| `subs/{bilingual,zh,en}.srt` | 双语/单语字幕，便于二创与检索 |
| `cover_16x9.jpg` | 1280×720 封面（标题 + 副标题 + 角标） |
| `ground_truth.json` / `script_en.txt` / `zh_agent.json` | 讲稿、真值时间码、精译文件（可复现、可审计） |
| `feedback.csv` / `feedback_report.md` | 反馈采集表 + 追踪报告（当前状态：待采集） |

## 3. 发布文案（可直接改）

**标题（A/B 三版，按"关键词 + 收益 + 反差"结构）**
- A：`5 个剪辑提速技巧｜英文原声 + 中英双语字幕，照着做能省一半时间`
- B：`剪辑总卡在细节？这 5 个小改动让成片立刻"变贵"（中英双语）`
- C：`剪辑师不会告诉你的 5 个提速技巧 | 英文原声·中英双语`

**简介**
```
本期 5 个技巧，全部来自真实剪辑工作流，每条都能立刻用：
1) 跟着节拍剪，不要跟着静音剪
2) 字幕放进安全区（离底边至少 40px）
3) 响度归一到 −16 LUFS，对白峰值不超 −1 dB
4) 导出 15 Mbps，发布前先看开头 3 秒
5) 关掉声音看一遍自己的片子

英文原声 + 中英双语字幕，当前词高亮，适合边看边练。
（本期为工厂样片：画面 CC-BY，语音为合成音，用于验证"双语字幕 + 交付"链路。）
```

**标签**：`剪辑教程` `视频剪辑` `中英双语` `剪辑技巧` `后期` `创作者工具` `效率`

**分区**：知识 → 软件应用 / 设计·创意

**封面文案**：主标题「5 个剪辑提速技巧」；副标题「英文原声 · 中英双语 · 逐词高亮」；角标「工厂样片」

**置顶评论**（用来收反馈，直接对应 `feedback.csv` 的 notes 列）
```
哪一条你最想先试？或者你被哪条坑过？评论告诉我，下期就拆它。
字幕字号/速度有想调的也直说，我改完会重发一版。
```

## 4. 上传清单（**需要人来做**，工厂不代登录）

- [ ] 用自己的账号登录 B 站创作中心 → 投稿
- [ ] 上传 `render_16x9/final.mp4`，封面用 `cover_16x9.jpg`（已过 `check_cover` 自检；取帧来自**无字幕干净成片**）
- [ ] （可选，B 站支持竖屏）另投 `final_9x16.mp4` + `cover_9x16.jpg`（1080×1920，字幕已按竖屏重排）
- [ ] 填标题（选一版）、简介、标签、分区
- [ ] 声明：本片画面为 Blender 开放影片（CC-BY 3.0），语音为合成音；**不含第三方版权素材**
- [ ] 发布后把播放/完播/互动数据填进 `feedback.csv`（T+1 / T+3 / T+7）
- [ ] 跑 `node Tool/ops/track_feedback.mjs --csv Prototype/loop12_market_loop/case_ep01/feedback.csv`，按报告里的 P0 动作改下一版

## 5. 这期已知的局限（别当成"完美成品"）

1. **语音是合成的**：不是真人讲师，情绪和节奏比真人平；这期验证链路，不验证"人设/口播魅力"；
2. **没有真人出镜/实拍演示**：画面是循环铺的开放影片，和"剪辑技巧"内容不强相关（真实交付要换成对应素材）；
3. **竖屏版没做**：B 站以横屏为主，但抖音/视频号需要 9:16；下一轮再补（需要单独的字幕字号/换行策略）；
4. **封面文字有没有压到主体/被裁，需要人眼确认**（我读不了图）；
5. 反馈数据目前是**空的**——链路跑通 ≠ 有效果，效果要等真实上架后的 T+1/T+7 数据。

## 6. 复现

```powershell
# 1) 造素材（合成口播 + 循环画面，37s）
node Tool\ops\make_episode.mjs --script Workspace\deliverables\ep01_editing_tips\script_en.txt --out Workspace\deliverables\ep01_editing_tips
# 2) 识别 + 对齐讲稿 + 出双语字幕（精译）+ 出 ASS + 烧入
node Tool\subtitle\asr_vosk.mjs Workspace\deliverables\ep01_editing_tips\source.mp4 --out Workspace\deliverables\ep01_editing_tips\transcript.json
node Tool\subtitle\align_script.mjs Workspace\deliverables\ep01_editing_tips\transcript.json Workspace\deliverables\ep01_editing_tips\ground_truth.json --out Workspace\deliverables\ep01_editing_tips\transcript_aligned.json
node Tool\subtitle\make_subs.mjs Workspace\deliverables\ep01_editing_tips\transcript_aligned.json --out Workspace\deliverables\ep01_editing_tips\subs --punct --mt agent --zh-file Workspace\deliverables\ep01_editing_tips\zh_agent.json --glossary Tool\subtitle\glossary_zh.json --cps 20
node Tool\subtitle\make_ass.mjs Workspace\deliverables\ep01_editing_tips\subs\cues.json --out Workspace\deliverables\ep01_editing_tips\karaoke.ass --hl 33E6C8
node Tool\edit\vfactory.mjs Workspace\deliverables\ep01_editing_tips\source.mp4 --out Workspace\deliverables\ep01_editing_tips\render_16x9 --title "5个剪辑提速技巧" --srt Workspace\deliverables\ep01_editing_tips\karaoke.ass --width 1280 --height 720 --max-cut 0
# 3) 封面 + 反馈追踪
node Tool\ops\make_cover.mjs --video Workspace\deliverables\ep01_editing_tips\render_16x9\final.mp4 --out Workspace\deliverables\ep01_editing_tips\cover_16x9.jpg --title "5 个剪辑提速技巧" --sub "英文原声 · 中英双语 · 逐词高亮" --tag "工厂样片"
node Tool\ops\track_feedback.mjs --csv Prototype\loop12_market_loop\case_ep01\feedback.csv
```
