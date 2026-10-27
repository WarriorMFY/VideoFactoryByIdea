# Tool/ — 稳定资产索引（剪辑工厂 v0.2）

> 目录职责：`Tool/` 放**沉淀后的稳定脚本**（可复用、已验证），过程留痕在 `History/`，交付包在 `Prototype/`，
> 第三方二进制与缓存都在 `Workspace/`（可随时清理，按需重建）。
> 剪辑链路只用 Node 标准库 + FFmpeg；字幕链路额外用 koffi + libvosk + edge-tts（由 `bootstrap_asr.mjs` 解包到 Workspace，不走 npm install）。

## 一键入口

| 命令 | 作用 |
| --- | --- |
| `node Tool/run_acceptance.mjs` | **小循环 1 验收**：剪辑用例 → 真值对比 → 成片质检 → `History/loops/loop01/acceptance.md` |
| `node Tool/run_subs_acceptance.mjs` | **小循环 2 验收**：造外语素材 → ASR → 剪辑 → 字幕 → 重映射 → 烧入 → 验收 → `History/loops/loop02/acceptance.md` |
| `.\Prototype\loop1_autocut\reproduce.ps1` | 从零复现小循环 1（装 ffmpeg → 拉素材 → 验收） |

## 环境引导（第三方依赖，落 Workspace）

| 脚本 | 作用 |
| --- | --- |
| `bootstrap_ffmpeg.mjs` | 下载 ffmpeg/ffprobe（npmmirror 镜像，6.1.1 essentials），写 SOURCE.txt |
| `bootstrap_asr.mjs` | 解包 koffi / @koromix/koffi-win32-x64 / vosk / @andresaya/edge-tts / ws 到 Workspace/asr（**替代 npm install**，写 DEPENDENCIES.md） |
| `fetch_vosk_model.mjs` | 多线程分段下载 Vosk 模型（alphacephei 单连接仅 ~15KB/s，必须并行 + 续传） |
| `npm_fetch.mjs <pkg> <dir>` | 从 npmmirror 拉任意 npm tarball 并解包（npm install 在本沙箱会失败时用） |
| `fetch_real_footage.mjs` | 拉公开授权真实素材（Big Buck Bunny, CC-BY 3.0） |

## 剪辑链路（小循环 1）

```text
make_bench_source.mjs  合成素材 + 真值（7 段：运动/黑场/冻帧/静音组合）
make_real_bench.mjs    真实素材 + 已知头/中/尾黑场静音（多段，验证真实素材上的切分与转场）
vfactory.mjs           ★主流水线：探测→信号分析→剪辑决策→渲染→交付包（支持 --srt 烧字幕）
verify_edl.mjs         用真值验收决策：IoU / 过切 / 漏切 / 分段存活率 / 切点误差
qa_report.mjs          成片质检：编码规格 / EBU R128 响度 / 残留黑场 / 音画时长一致
make_timeline.mjs      把 EDL 画成时间轴图（绿=保留 红=切除）
lib/ff.mjs             子进程封装：fd 重定向捕获输出 + fontconfig 自建配置
```

## 字幕链路（小循环 2：外语视频 → 中文字幕）

```text
make_l2_bench.mjs      ★造"外语视频"测试素材：Edge 神经 TTS 逐句合成（讲稿已知=真值）+ 真实画面
                       注意：逐句去首尾静音，否则真值句时长混入静音会让覆盖率指标虚低（实测尾静音 0.8s/句）
asr_vosk.mjs           离线识别：koffi 直连 libvosk.dll，输出词级时间戳 transcript.json
                       坑：Vosk 每段结果由 result() 吐出（会清空内部缓冲），final_result() 常常是空 —— 必须逐段收集
make_subs.mjs          断句 → 句子级翻译（MyMemory/agent/none）→ 显示行 → SRT；术语表修正
remap_subs.mjs         把原片时间轴字幕重映射到剪辑后时间轴（跨切点拆分、保留<35% 丢弃、过短补齐）
verify_subs.mjs        字幕链路验收：WER / 语音覆盖 / 句界误差 / 译文覆盖 / 可读性 / 重映射自检
run_subs_acceptance.mjs 小循环 2 一键验收（含"两次渲染 EDL 一致性"断言，防空错位）
glossary_zh.json       机翻术语表（LUFS / Mbps 等）
tts_sapi.ps1           备用方案：Windows SAPI 离线 TTS（本沙箱 Speak 被拒 E_ACCESSDENIED，仅留档）
```

## 主流水线用法（vfactory.mjs）

```powershell
node Tool\vfactory.mjs <源视频> --out <输出目录> [选项]
  --title "标题"         片头标题（中文用 SimHei，0.2~4.0s 淡入淡出）
  --srt sub.srt          烧入字幕（libass；自动识别双语→缩小字号）
  --transition none     关闭转场（默认 xfade fade）
  --xfade-dur 0.4       转场时长（秒）
  --width/--height/--fps 输出规格（默认 1280x720@30）
  --max-cut 60          切除比例上限，超过则放弃自动切除（防病态素材剪空）
```

输出交付包：`final.mp4`、`edits.json`（EDL）、`report.md`、`contact_sheet.jpg`、`probe.json`、`signals.json`、`runlog.jsonl`、`.work/logs/*.log`（每步 ffmpeg 原始日志）。

## 剪辑规则（vfactory.mjs 内 `DECISION` / `OPT`）

| 规则 | 默认值 | 含义 |
| --- | --- | --- |
| 黑场 → 切 | `blackMinDur 0.12s`, `pix_th 0.10` | 无画面即剪 |
| 冻帧 ∧ 静音 → 切 | `freezeNoise 0.003`, `freezeMinDur 0.35s`, `silenceDb −35`, `silenceMinDur 0.5s` | **两路都无信息才剪**；只有冻帧（口播）或只有静音（动作镜头）保留 |
| 切点吸附镜头边界 | `snapWindow 0.6s`（scdet threshold 8） | 切在镜头切换处，不留半个镜头 |
| 碎片归并 | `minGap 0.4s`, `minKeep 1.2s` | 相邻切除合并；过短的保留段并入切除 |
| 过度切保护 | `--max-cut 60` | 保留率低于 40% 时放弃自动剪切 |

## 字幕链路参数（make_subs.mjs / remap_subs.mjs）

| 参数 | 默认 | 含义 |
| --- | --- | --- |
| `--pause` | 0.3s | 句界候选停顿；素材停顿小就调小 |
| `--max-sent` / `--min-sent` | 110 / 24 字符 | 单句长度上下限（控制机翻上下文与碎片化） |
| `--max-zh` / `--max-en` | 18 字 / 64 字符 | 单行显示宽度 |
| `--min-cue` | 0.8s | 单行最短时长 |
| `--mt` | mymemory | `mymemory` 全自动 / `agent` 用外部精译 / `none` 只出外文 |
| `--glossary` | — | 术语表 JSON，修正 LUFS/Mbps 这类专有词 |
| remap `--min-dur` | 0.6s | 重映射后过短的行补齐到该时长 |

## 环境坑（本机必须知道，已在 lib/ff.mjs / 各脚本里处理）

1. **出网**：PowerShell/curl 被策略拦截（TLS 关闭），仅 Node `fetch` 可出网；gyan.dev / GitHub Release 资产限速或超时，npmmirror 约 2MB/s。
2. **子进程管道被禁**：`spawnSync` 默认 `stdio:'pipe'` 返回 `EPERM`；必须用**文件描述符重定向**捕获输出。
3. **drawtext 字体**：`fontfile=C\:/Windows/...` 会静默回退默认衬线（中文变方块），必须写 `font=SimHei`；且需自建 `fonts.conf`（本机 ffmpeg 找不到默认配置、缓存目录不可写）。
4. **日志格式**：`lavfi.scd.time:` 用冒号；`freezedetect` 在静帧黑场也会触发，黑场段须由 blackdetect 优先归属。
5. **CJK 标题**：`SimHei` 可用；`arialbd` 无 CJK glyph。
6. **PowerShell 是 5.1**（`$PSVersionTable.PSVersion` = 5.1.26100）：含中文的 `.ps1` 必须存成 **UTF-8 with BOM**，否则被按 ANSI 解析导致语法错误（`Prototype/**/reproduce.ps1` 均为纯 ASCII；若确实要写中文，必须存成 UTF-8 with BOM）。
7. **npm 在本沙箱不可靠**：npm install 会因 cache 目录越界/大包 ECONNRESET/"operation was rejected" 失败 → 用 `Tool/npm_fetch.mjs`（tarball + bsdtar）或 `Tool/bootstrap_asr.mjs`。
8. **模型站点限制**：HuggingFace / ModelScope / hf-mirror 全域不可达（拿不到 Whisper 系模型）；alphacephei（Vosk 模型）可达但单连接 ~15KB/s 且会断 → 必须多线程分段 + 续传。
9. **Windows SAPI TTS 被拒**：`SpVoice.Speak` 抛 `E_ACCESSDENIED`（沙箱限制），造测试语音改用 Edge 神经 TTS（`@andresaya/edge-tts`，需外网，实测可用）。
10. **Vosk 结果收集**：`vosk_recognizer_result()` 每段吐结果并清空内部缓冲，`vosk_recognizer_final_result()` 常为空；必须逐段收集 `result` 数组再按时间排序去重。

## 判定数据在哪

- 剪辑决策正确性：`History/runs/*/verify.json`
- 成片合格性：`History/runs/*/qa.json`
- 字幕链路：`History/runs/l2_subs_*/verify_subs.json`（WER/覆盖/句界/可读性/重映射自检）
- 汇总：`History/loops/loop01/acceptance.md`、`History/loops/loop02/acceptance*.md`
- 循环摘要：`History/CircleLog/log.md`
