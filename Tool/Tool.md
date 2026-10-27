# Tool/ — 稳定资产索引（剪辑工厂 v0.1）

> 目录职责：`Tool/` 放**沉淀后的稳定脚本**（可复用、已验证），过程留痕在 `History/`，交付包在 `Prototype/`，
> 第三方二进制与缓存都在 `Workspace/`（可随时清理，按需重建）。
> 全部脚本只用 Node 标准库 + FFmpeg，无第三方 npm 依赖。

## 一键入口

| 命令 | 作用 |
| --- | --- |
| `node Tool/run_acceptance.mjs` | **端到端验收**：造用例 → 跑工厂 → 真值对比 → 成片质检 → 写 `History/loops/loop01/acceptance.md`，PASS/FAIL 用退出码表达 |
| `.\Prototype\reproduce.ps1` | 从零复现（装 ffmpeg → 拉素材 → 验收） |

## 流水线与各脚本职责

```text
Tool/bootstrap_ffmpeg.mjs   ffmpeg/ffprobe 落地到 Workspace/bin/ffmpeg（幂等，来源/许可证写 SOURCE.txt）
Tool/fetch_real_footage.mjs 拉公开授权真实素材到 Workspace/assets（CC-BY 3.0，Big Buck Bunny）
Tool/make_bench_source.mjs  造「带真值」的合成素材（7 段：运动/黑场/冻帧/静音组合）→ source.mp4 + ground_truth.json
Tool/make_real_bench.mjs    真实素材 + 已知头/中/尾黑场静音 → 仍是机器可读真值
Tool/vfactory.mjs           ★主流水线：探测→信号分析→剪辑决策→渲染→交付包（final.mp4/edits.json/report.md/…）
Tool/verify_edl.mjs         用真值客观验收决策：IoU / 过切 / 漏切 / 分段存活率 / 切点误差
Tool/qa_report.mjs          成片质检：编码规格 / EBU R128 响度 / 残留黑场 / 音画时长一致
Tool/make_timeline.mjs      把 EDL 画成时间轴图（绿=保留 红=切除），供人一眼复核
Tool/lib/ff.mjs             调用封装：fd 重定向捕获输出 + fontconfig 自建配置（见下方环境坑）
```

## 主流水线用法（vfactory.mjs）

```powershell
node Tool\vfactory.mjs <源视频> --out <输出目录> [选项]
  --title "标题"         片头标题（中文用 SimHei，0.2~4.0s 淡入淡出）
  --srt sub.srt          烧入字幕（libass）
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

## 环境坑（本机必须知道，已在 lib/ff.mjs 里处理）

1. **出网**：PowerShell/curl 被策略拦截（TLS 关闭），仅 Node `fetch` 可出网；gyan.dev / GitHub Release 资产限速或超时，npmmirror 约 2MB/s。
2. **子进程管道被禁**：`spawnSync` 默认 `stdio:'pipe'` 返回 `EPERM`；必须用**文件描述符重定向**捕获输出。
3. **drawtext 字体**：`fontfile=C\:/Windows/...` 会静默回退默认衬线（中文变方块），必须写 `font=SimHei`；且需自建 `fonts.conf`（本机 ffmpeg 找不到默认配置、缓存目录不可写）。
4. **日志格式**：`lavfi.scd.time:` 用冒号；`freezedetect` 在静帧黑场也会触发，黑场段须由 blackdetect 优先归属。
5. **CJK 标题**：`SimHei` 可用；`arialbd` 无 CJK glyph。
6. **PowerShell 是 5.1**（`$PSVersionTable.PSVersion` = 5.1.26100）：含中文的 `.ps1` 必须存成 **UTF-8 with BOM**，否则被按 ANSI 解析导致语法错误（`Prototype/reproduce.ps1` 已带 BOM）。

## 判定数据在哪

- 决策正确性：`History/runs/*/verify.json`（IoU、过切/漏切秒数、分段存活率、切点误差）
- 成片合格性：`History/runs/*/qa.json`（编码规格、响度、残留缺陷、音画时长差）
- 汇总：`History/loops/loop01/acceptance.md`
