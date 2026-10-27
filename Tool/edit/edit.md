# edit/ — 剪辑主链路（出片）

> 一个脚本干完：探测 → 信号分析 → 剪辑决策 → 渲染 → 交付包。
> 决策规则在这里，验收在 [`../acceptance/`](../acceptance/acceptance.md)。

## 文件

| 脚本 | 作用 |
| --- | --- |
| `vfactory.mjs` | **主流水线**。探测/信号分析（黑场、冻帧、静音、镜头切点）→ 决策（含语音保护）→ 渲染（xfade 转场、loudnorm、淡入淡出、标题、字幕烧入）→ 交付包 |
| `make_timeline.mjs` | 把 EDL 画成时间轴图（绿=保留、红=切除），给人一眼复核 |

## vfactory.mjs 用法

```powershell
node Tool\edit\vfactory.mjs <源视频> --out <目录> [选项]
```

| 选项 | 默认 | 含义 |
| --- | --- | --- |
| `--title "…"` | 空 | 片头标题（中文用 SimHei，0.2–4.0s 淡入淡出） |
| `--srt file.srt` | 空 | 烧入字幕（libass；自动识别双语并缩小字号） |
| `--protect tr.json` | 空 | **语音保护**：ASR 识别到语音的区间一律不剪（真实素材必备） |
| `--protect-pad` / `--protect-conf` | 0.25s / 0.5 | 语音区间余量 / 只采信置信度≥该值的词 |
| `--black-pix` / `--black-pic` / `--black-dur` | 0.04 / 0.98 / 0.30 | 黑场判定（默认值已在真实影视素材上校准） |
| `--max-cut` | 60 | 切除比例上限（超过则放弃自动剪切，防病态素材剪空） |
| `--transition` / `--xfade-dur` | fade / 0.4 | 转场方式与时长 |
| `--width/--height/--fps` | 1280/720/30 | 输出规格（竖屏可用 1080x1920） |

**产出**：`final.mp4`、`edits.json`（EDL，含规则参数与语音保护区间）、`report.md`、`contact_sheet.jpg`、`probe.json`、`signals.json`、`runlog.jsonl`、`.work/logs/*.log`（每步 ffmpeg 原始日志）。

## 决策规则（都可在脚本顶部 `DECISION`/`OPT` 调）

| 规则 | 默认 | 含义 |
| --- | --- | --- |
| 黑场 → 切 | 0.30s / pix 0.04 / pic 0.98 | 无画面即剪 |
| 冻帧 ∧ 静音 → 切 | freeze 0.35s、silence −35dB 0.5s | **两路都无信息才剪**；只有冻帧（口播）或只有静音（动作镜头）保留 |
| 切点吸附镜头边界 | ±0.6s（scdet） | 切在镜头切换处，不留半个镜头 |
| 碎片归并 | minGap 0.4s / minKeep 1.2s | 相邻切除合并；过短保留段并入切除 |
| **语音保护** | `--protect` | 识别到语音的区间从切除集合里挖掉（真实素材上救回被误剪的对白） |
| 过度切保护 | max-cut 60% | 保留率低于 40% 时放弃自动剪切 |

## 为什么是"冻帧 ∧ 静音"

口播/静态镜头画面天然不动，只看画面会把主体全删；无声的动作镜头只有画面信息，只看音频也会删错。两路都没信息才剪——这条规则是合成素材 A 用例里 F/G 段要守住的东西。

## 坑

- 黑场参数不要调回 `pix_th=0.10`：暗场景会被判成黑场，实测把对白整段剪掉（见 `History/loops/loop03/`）。
- 语音保护会连带保住"对白压在黑屏/字幕卡"上的黑屏（音画绑定）——这是取舍，不是 bug。
- 渲染两遍（先出 EDL 再烧字幕）时，两次 EDL 必须一致；`acceptance/run_*.mjs` 里有断言。
- 取时长/探测日志一律通过 `lib/ff.mjs`，别自己拼 `spawnSync`。
