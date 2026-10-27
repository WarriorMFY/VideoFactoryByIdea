# 小循环 1 · 执行记录（时间线 / 命令 / 产物）

时区：本机时间（UTC+8）。全部命令在仓库根 `D:\Data\DeepseekHarness\IdeaDrivenLoop\VideoFactory` 执行。

## 时间线

| 时间 | 动作 | 结果 |
| --- | --- | --- |
| 13:33 | 读目录、建 `Prototype/History/Tool/Workspace` | 骨架就绪（未擅自创建 `Goal/Archived`） |
| 13:35 | 环境探测（ffmpeg/python/node/网络/GPU/磁盘） | ffmpeg 缺失；仅 Node 可出网；无 GPU；pip 超时 |
| 13:45 | 尝试 gyan.dev 下载 ffmpeg | 失败：~13KB/s |
| 13:52 | 实测 npmmirror 镜像 → 改写 bootstrap | 成功：ffmpeg 6.1.1 essentials（79MB，13.3s） |
| 13:58 | 写合成素材生成器 `make_bench_source.mjs` | 42s/7.85MB，含 7 段 + 真值 JSON |
| 14:05 | 写主流水线 `vfactory.mjs` | 首次运行：发现 pipe 限流 → 改 fd 重定向 |
| 14:15 | 首次 bench 跑通 | 但漏切「冻帧+静音」段（区间合并 bug） |
| 14:22 | 修区间差集 + scdet 正则 | bench 决策与真值完全一致：IoU=1.0 |
| 14:30 | 修边界误差指标（并集边界比较） | 验收 PASS |
| 14:35 | 中文字体排查（4 种写法对比） | `font=SimHei` 才有效；写入 lib/ff.mjs |
| 14:42 | 真实素材用例（BBB CC-BY + 头/中/尾废镜头） | IoU=0.998，过切 0s |
| 14:50 | 写 `qa_report.mjs` | 发现真实片段无音轨 → 质检项做"不适用"处理 |
| 14:55 | 写 `run_acceptance.mjs` 一键验收 | synth=PASS, real=PASS |
| 15:00 | 时间轴图 + 组装 `Prototype/` 交付包 | 27.7MB 交付物 |

## 关键命令（可逐条复跑）

```powershell
node Tool/bootstrap_ffmpeg.mjs                    # 装 ffmpeg/ffprobe 到 Workspace/bin/ffmpeg
node Tool/fetch_real_footage.mjs                  # 拉公开授权真实素材（CC-BY 3.0）
node Tool/make_bench_source.mjs                   # 合成用例 A 素材 + 真值
node Tool/make_real_bench.mjs                     # 真实用例 B 素材 + 真值
node Tool/vfactory.mjs History\bench\synth\source.mp4 --out History\runs\bench01 --title "剪辑工厂 DEMO"
node Tool/vfactory.mjs History\bench\real\source.mp4  --out History\runs\real01  --title "真实素材测试"
node Tool/verify_edl.mjs History\runs\bench01\edits.json History\bench\synth\ground_truth.json --json History\runs\bench01\verify.json
node Tool/qa_report.mjs  History\runs\bench01\final.mp4 --json History\runs\bench01\qa.json
node Tool/make_timeline.mjs History\runs\bench01\edits.json History\runs\bench01\timeline.png --label "用例A 合成素材 剪辑决策"
node Tool/run_acceptance.mjs                      # 一键全量验收（含上面全部步骤）
```

## 实测数据（本轮硬证据）

| 项 | 用例 A 合成 | 用例 B 真实素材 |
| --- | --- | --- |
| 源 | 42.00s / 1280x720@30 / AAC 48k | 17.00s / 1920x1080@60（素材无音轨→垫静音） |
| 成片 | 31.62s / 1280x720@30 / High | 9.63s / 1280x720@30 / High |
| 处理耗时 | 约 7s | 约 5s |
| 该切/实际切 | 10.00s / 10.00s | 7.00s / 6.98s |
| 过切（误删有效内容） | 0.000s | 0.000s |
| 漏切 | 0.000s | 0.017s |
| IoU / 精确率 / 召回 | 1.000 / 1.000 / 1.000 | 0.998 / 1.000 / 0.998 |
| 切点最大误差 | 0.000s | 0.017s |
| 响度 | −15.9 LUFS / 峰值 −14.8 dBTP | 不适用（素材无音轨） |
| 残留黑场 | 0 | 0 |
| 音画时长差 | 0.021s | 0.026s |

## 产物清单

- 过程留痕：`History/probe/`（网络/字体/stdio 探测脚本与日志）、`History/bench/{synth,real}/`（素材 + 真值 + ffmpeg 日志）
- 运行产物：`History/runs/{bench01,real01}/`（final.mp4、edits.json、report.md、timeline.png、contact_sheet.jpg、verify.json、qa.json、runlog.jsonl、.work/ 中间文件与逐步日志）
- 验收汇总：`History/loops/loop01/acceptance.md`
- 交付包：`Prototype/`（README + reproduce.ps1 + 两个用例的成片/决策单/报告/图）

## 本轮未做（明确边界）

语音转写与自动字幕、语义选段、变速/缩放/调色、GPU 编码、批量队列、BGM 与音乐版权处理、长片压测、竖屏智能裁切。
