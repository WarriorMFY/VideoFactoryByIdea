# 小循环 1 · 自动剪辑 + 成片交付（Auto-Edit Factory v0.1）

> 输入一段原视频 → 内部自动完成"看片 → 定剪点 → 重排 → 加转场/响度/标题 → 出成片 → 出决策单" → 交付一个可验收的成片包。
> 本轮目标不是"做完整剪辑软件"，而是**把最小闭环跑通，并用可量化真值证明它真的能剪对**。
> 时间：2026-10-27 13:33–13:55（约 22 分钟）；运行时窗口剩余 3 天余。

---

## 1. 一句话结论

**能剪对、且证据可复现**：两套带机器可读真值的用例全部 PASS —— 该切的（黑场、冻帧+静音）100% 切掉，不该切的（口播冻帧、无声动作镜头、真实素材主体）100% 保留，切点在镜头边界上误差 ≤ 0.017s，成片规格与响度达标。

| 用例 | 源 → 成片 | 该切 | 实际切 | 过切（误删） | 漏切 | IoU | 最大切点误差 | 成片 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A 合成素材（7 段，含各种病态段） | 42.00s → 31.62s | 10.00s | 10.00s | **0s** | **0s** | **1.000** | 0s | 1280×720 H.264 High / AAC −15.9 LUFS |
| B 真实素材（Big Buck Bunny CC-BY 3.0 + 已知废镜头） | 17.00s → 9.63s | 7.00s | 6.98s | **0s** | 0.017s | **0.998** | 0.017s | 1280×720 H.264 High / 2 段带 0.4s 交叉淡化 |

> 判据是脚本算出来的，不是目测：`Tool/acceptance/verify_edl.mjs`（决策对错）+ `Tool/acceptance/qa_report.mjs`（成片合不合格）。
> 一键复跑全部结论：`node Tool/acceptance/run_acceptance.mjs`，记录写进 `History/loops/loop01/acceptance.md`。

---

## 2. 它现在到底会做什么

```
原视频 ──┬─ 探测：分辨率/帧率/码率/音轨（ffprobe）
         ├─ 信号分析（一次视频 pass + 一次音频 pass）
         │     · blackdetect   黑场
         │     · freezedetect  冻帧（画面静止）
         │     · scdet         镜头切换点
         │     · silencedetect 静音
         ├─ 剪辑决策（规则可调，见下）
         │     黑场 → 切；冻帧 ∧ 静音 → 切；只有冻帧 或 只有静音 → 保留
         │     切点吸附到最近镜头边界（±0.6s）
         │     <1.2s 碎片并入切除；切除比例 >60% 时放弃自动切除（保护）
         ├─ 渲染
         │     逐段精确裁剪 → 统一画幅/帧率/像素格式 → xfade 交叉淡化 + acrossfade
         │     → loudnorm −16 LUFS → 首尾淡入淡出 → 可选标题/CJK 字 / 可选 SRT 字幕烧入
         └─ 交付包
               final.mp4（成片）· edits.json（EDL 决策单）· report.md（人读报告）
               timeline.png（决策时间轴图）· contact_sheet.jpg（抽帧目检）
               probe/signals/qa/verify.json · runlog.jsonl（每步 ffmpeg 命令，可审计）
```

**为什么是"冻帧 ∧ 静音"而不是"冻帧就切"**：口播/静态镜头画面天然不动，只看画面会把主体全删掉；反过来无声的动作镜头只有画面信息，只看音频也会删错。两路都没信息才剪——这条规则正是用例 A 里 F 段（冻帧但有音轨）、G 段（静音但有画面）要守住的东西，实测都守住了。

---

## 3. 交付物清单（本目录）

| 路径 | 是什么 |
| --- | --- |
| `case_A_synth/source.mp4` | 合成测试素材（7 段，42s，故意含黑场/冻帧/静音/仅静音/仅冻帧） |
| `case_A_synth/final.mp4` | **成片**：切除 C(黑场) 与 D(冻帧+静音)，保留其余 5 段，带标题与 0.4s 交叉淡化 |
| `case_A_synth/timeline.png` | 决策时间轴图（绿=保留、红=切除，一眼看懂剪了什么） |
| `case_A_synth/contact_sheet.jpg` | 成片抽帧拼图（目检用） |
| `case_A_synth/edits.json` | EDL：每段入出点、切除原因、规则参数（机器可读） |
| `case_A_synth/report.md` | 人读交付报告 |
| `case_A_synth/ground_truth.json` | 该用例的真值（脚本生成，非人工涂改） |
| `case_A_synth/verify.json` / `qa.json` | 真值验收结果 / 成片质检结果 |
| `case_B_real/*` | 同上，素材换成真实片段 Big Buck Bunny（© Blender Foundation, CC-BY 3.0）+ 已知头/中/尾废镜头 |
| `acceptance.md` | 两用例汇总验收记录（自动生成） |
| `reproduce.ps1` | 一键复现：装 ffmpeg → 造用例 → 跑工厂 → 真值验收 → 质检 |

原型代码在 `Tool/`（稳定资产，索引见 `Tool/Tool.md`），过程留痕在 `History/`。

---

## 4. 怎么用（换成你自己的视频）

```powershell
# 0) 首次准备（本机网络只有 Node 能出网，故用 Node 下载 ffmpeg 到 Workspace）
node Tool\setup/bootstrap_ffmpeg.mjs

# 1) 剪一条片子
node Tool\edit/vfactory.mjs "D:\videos\原片.mp4" --out out\我的片子 --title "我的片子"

# 常用选项
#   --title "…"        片头标题（中文用 SimHei，自动淡入淡出）
#   --srt sub.srt      把字幕烧进画面（外置 SRT；自动出字幕见 loop2_subtitles）
#   --transition none  不要转场，直接硬切
#   --xfade-dur 0.4    转场时长
#   --width 1080 --height 1920 --fps 30   竖屏成片
#   --max-cut 60       切除比例上限（超过则放弃自动剪切，避免把片子剪空）

# 2) 只看决策对不对 / 成片合不合格
node Tool\acceptance/verify_edl.mjs out\我的片子\edits.json <真值.json>
node Tool\acceptance/qa_report.mjs  out\我的片子\final.mp4

# 3) 决策时间轴图
node Tool\edit/make_timeline.mjs out\我的片子\edits.json out\我的片子\timeline.png
```

---

## 5. 复现本目录全部结论

```powershell
# 在仓库根目录
.\Prototype\loop1_autocut\reproduce.ps1
```

依次执行：`bootstrap_ffmpeg`（装 ffmpeg）→ `fetch_real_footage`（拉真实公开素材，失败则跳过 B）→ `run_acceptance`（造 A/B 用例、跑工厂、真值验收、成片质检、写 `History/loops/loop01/acceptance.md`）。
产物写到 `History/runs/`；本目录里的是同一批产物的**快照**。单步等价命令见 `History/loops/loop01/notes.md`。

---

## 6. 已知限制（诚实清单）

1. **只能"做减法"，不能"读懂内容"**：判据全部来自信号（黑场/冻帧/静音/镜头边界），不理解语义。"高光/重点/口误"这类取舍需要 ASR 或视觉模型——**小循环 2 已补上 ASR 侧的转写**。
2. **本轮自身不含语音转写**：只能烧入外部 SRT；自动字幕见 `../loop2_subtitles/`。
3. **转场只有 fade**；没有变速、Ken Burns、调色、BGM 自动避让。
4. **真实素材用例无音轨**：所用 BBB 公开片段本身无音频，B 用例不覆盖音频路径（音频路径由 A 用例覆盖：−15.9 LUFS 达标）。
5. **单机 CPU 编码**（无 GPU、无 `nvidia-smi`）；42s 素材全流程约 7s，10 分钟长片未测。
6. **竖屏/异形比例**按 `scale+pad` 加黑边，不做智能裁切。
7. **切点是启发式**：极端素材（全片手持微动、全片无人声）可能需要调 `vfactory.mjs` 里的 `DECISION` 参数。
8. **不做音频修复**：爆音/底噪/齿音未处理，只做响度归一。

---

## 7. 依赖与合规

| 依赖 | 来源 / 版本 | 许可 | 说明 |
| --- | --- | --- | --- |
| FFmpeg / ffprobe | npmmirror 镜像 `ffmpeg-static/b6.1.1` → 实为 ffmpeg 6.1.1 essentials build (gyan.dev) | GPLv3（含 libx264/libass/fontconfig） | 仅本机运行时使用，**不随交付物分发**；复现脚本自行下载；来源记录在 `Workspace/bin/ffmpeg/SOURCE.txt` |
| Node.js | 本机 24.20.0 | MIT | 仅用标准库 |
| 字体 | `C:/Windows/Fonts/simhei.ttf` | 系统字体，本机使用 | drawtext/libass 需要可写 fontconfig 配置，已由 `Tool/lib/ff.mjs` 生成到 `Workspace/cache/fontconfig/` |
| 测试素材 B | test-videos.co.uk 的 Big Buck Bunny 片段 | © Blender Foundation, **CC-BY 3.0** | 仅作测试，随用例随附并注明出处 |

> 环境坑（出网限制、管道被禁、字体/fontconfig、日志格式等）统一记录在 `Tool/Tool.md` 的"环境坑"一节，避免与代码文档重复。

---

## 8. 本轮之后发生了什么

- 小循环 2 在这个基础上加了**字幕链路**（离线 ASR → 机翻 → 随剪辑重映射 → 烧入），见 `../loop2_subtitles/README.md`。
- 循环摘要与人反馈：`History/CircleLog/log.md`。
