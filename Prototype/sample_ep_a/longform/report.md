# 剪辑工厂交付报告

| 项 | 值 |
| --- | --- |
| 源文件 | `talk_720p.mp4` (247.9 MB, mov,mp4,m4a,3gp,3g2,mj2) |
| 源时长 | 15:11.7 (911.72s) |
| 源规格 | 1280x720 h264 @ 24000/1001 / aac 48000Hz 2ch |
| 成片时长 | 901.80s（切除 6.00s / 0.7%） |
| 成片规格 | 1280x720 30fps H.264 High + AAC 192k(loudnorm -16 LUFS) |
| 转场 | xfade(fade,0.4s) |

## 输入信号（自动探测）

- 黑场 2 段，冻帧 251 段，静音 126 段，场景切点 90 个

## 剪辑决策（12 个保留段）

| # | 入点 | 出点 | 时长 | 信号标记 |
| --- | --- | --- | --- | --- |
| 1 | 0:00.0 (0.00s) | 0:03.1 (3.13s) | 3.13s | 正常 |
| 2 | 0:03.7 (3.67s) | 1:07.9 (67.87s) | 64.20s | speech(已保护),freeze,silence |
| 3 | 1:09.1 (69.11s) | 1:31.8 (91.80s) | 22.69s | speech(已保护),freeze,silence |
| 4 | 1:32.2 (92.15s) | 2:25.2 (145.18s) | 53.03s | speech(已保护),freeze,silence |
| 5 | 2:25.6 (145.58s) | 3:08.7 (188.74s) | 43.16s | speech(已保护),freeze,silence |
| 6 | 3:09.2 (189.20s) | 3:27.2 (207.19s) | 17.99s | speech(已保护),freeze,silence |
| 7 | 3:27.6 (207.62s) | 8:46.7 (526.69s) | 319.07s | speech(已保护),freeze,silence |
| 8 | 8:47.2 (527.21s) | 12:35.0 (754.97s) | 227.76s | speech(已保护),freeze,silence |
| 9 | 12:35.4 (755.40s) | 13:37.0 (816.98s) | 61.58s | speech(已保护),freeze,silence |
| 10 | 13:37.4 (817.44s) | 14:10.9 (850.93s) | 33.49s | speech(已保护),freeze,silence |
| 11 | 14:11.4 (851.37s) | 14:44.8 (884.84s) | 33.47s | speech(已保护),freeze,silence |
| 12 | 14:45.1 (885.09s) | 15:11.2 (911.24s) | 26.15s | speech(已保护),freeze,silence |

## 切除段

| # | 入点 | 出点 | 时长 | 原因 |
| --- | --- | --- | --- | --- |
| 1 | 3.13s | 3.67s | 0.54s | black（无画面） |
| 2 | 911.24s | 911.62s | 0.38s | black（无画面） |
| 3 | 9.88s | 10.53s | 0.64s | freeze∧silence（两路都无信息） |
| 4 | 14.89s | 15.37s | 0.48s | freeze∧silence（两路都无信息） |
| 5 | 17.73s | 18.14s | 0.41s | freeze∧silence（两路都无信息） |
| 6 | 47.17s | 47.79s | 0.62s | freeze∧silence（两路都无信息） |
| 7 | 50.35s | 50.89s | 0.54s | freeze∧silence（两路都无信息） |
| 8 | 51.90s | 52.74s | 0.84s | freeze∧silence（两路都无信息） |
| 9 | 54.26s | 54.77s | 0.51s | freeze∧silence（两路都无信息） |
| 10 | 68.07s | 69.40s | 1.33s | freeze∧silence（两路都无信息） |
| 11 | 77.91s | 78.54s | 0.63s | freeze∧silence（两路都无信息） |
| 12 | 92.38s | 92.44s | 0.06s | freeze∧silence（两路都无信息） |
| 13 | 103.02s | 103.35s | 0.34s | freeze∧silence（两路都无信息） |
| 14 | 144.85s | 145.85s | 0.99s | freeze∧silence（两路都无信息） |
| 15 | 154.59s | 155.45s | 0.86s | freeze∧silence（两路都无信息） |
| 16 | 159.26s | 159.58s | 0.31s | freeze∧silence（两路都无信息） |
| 17 | 162.96s | 163.57s | 0.61s | freeze∧silence（两路都无信息） |
| 18 | 169.09s | 169.67s | 0.58s | freeze∧silence（两路都无信息） |
| 19 | 170.72s | 171.05s | 0.33s | freeze∧silence（两路都无信息） |
| 20 | 189.27s | 189.50s | 0.23s | freeze∧silence（两路都无信息） |
| 21 | 194.10s | 194.32s | 0.21s | freeze∧silence（两路都无信息） |
| 22 | 194.53s | 194.97s | 0.44s | freeze∧silence（两路都无信息） |
| 23 | 206.84s | 207.62s | 0.78s | freeze∧silence（两路都无信息） |
| 24 | 232.52s | 232.87s | 0.35s | freeze∧silence（两路都无信息） |
| 25 | 245.19s | 245.58s | 0.39s | freeze∧silence（两路都无信息） |
| 26 | 248.44s | 248.71s | 0.27s | freeze∧silence（两路都无信息） |
| 27 | 306.50s | 306.64s | 0.14s | freeze∧silence（两路都无信息） |
| 28 | 329.57s | 330.16s | 0.59s | freeze∧silence（两路都无信息） |
| 29 | 336.12s | 336.50s | 0.38s | freeze∧silence（两路都无信息） |
| 30 | 341.21s | 341.59s | 0.38s | freeze∧silence（两路都无信息） |
| 31 | 345.27s | 345.35s | 0.08s | freeze∧silence（两路都无信息） |
| 32 | 353.64s | 353.90s | 0.25s | freeze∧silence（两路都无信息） |
| 33 | 390.43s | 390.75s | 0.32s | freeze∧silence（两路都无信息） |
| 34 | 398.86s | 399.15s | 0.29s | freeze∧silence（两路都无信息） |
| 35 | 526.90s | 527.49s | 0.59s | freeze∧silence（两路都无信息） |
| 36 | 530.90s | 531.45s | 0.55s | freeze∧silence（两路都无信息） |
| 37 | 536.43s | 537.03s | 0.60s | freeze∧silence（两路都无信息） |
| 38 | 639.16s | 639.30s | 0.14s | freeze∧silence（两路都无信息） |
| 39 | 654.67s | 654.95s | 0.27s | freeze∧silence（两路都无信息） |
| 40 | 678.39s | 678.82s | 0.44s | freeze∧silence（两路都无信息） |
| 41 | 681.00s | 681.22s | 0.23s | freeze∧silence（两路都无信息） |
| 42 | 747.66s | 747.73s | 0.07s | freeze∧silence（两路都无信息） |
| 43 | 754.80s | 755.46s | 0.67s | freeze∧silence（两路都无信息） |
| 44 | 811.39s | 811.66s | 0.27s | freeze∧silence（两路都无信息） |
| 45 | 816.69s | 817.15s | 0.46s | freeze∧silence（两路都无信息） |
| 46 | 817.44s | 817.82s | 0.38s | freeze∧silence（两路都无信息） |
| 47 | 851.14s | 851.60s | 0.46s | freeze∧silence（两路都无信息） |
| 48 | 884.53s | 885.09s | 0.56s | freeze∧silence（两路都无信息） |
| 49 | 0.00s | 911.72s | 911.72s | 语音保护：45 段语音区间已锁定，切除量 22.28s → 6.00s（恢复 16.28s） |

## 剪辑规则（决策可调的默认参数）

```json
{
  "blackPixTh": 0.04,
  "blackPicTh": 0.98,
  "blackMinDur": 0.3,
  "freezeNoise": 0.003,
  "freezeMinDur": 0.35,
  "silenceDb": -35,
  "silenceMinDur": 0.5,
  "sceneTh": 8,
  "snapWindow": 0.6,
  "minGap": 0.4,
  "minKeep": 1.2,
  "headroom": 0
}
```

> 规则：黑场切；冻帧且静音切；仅冻帧或仅静音保留（避免误切口播与动作镜头）；切点吸附最近镜头边界；短于 1.2s 的碎片并入切除；切除超过 100% 时放弃自动切除。

## 交付清单

- `final.mp4` — 成片（可直接交付）
- `edits.json` — EDL 剪辑决策单（机器可读，含规则参数）
- `signals.json` — 探测到的黑场/冻帧/静音/场景切点原始信号
- `probe.json` — 源文件技术信息
- `report.md` — 人类可读交付报告
- `contact_sheet.jpg` — 成片抽帧拼图（快速目检）
- `runlog.jsonl` — 每一步 ffmpeg 命令与耗时（可审计/可复现）

## 复现

```powershell
node Tool\edit\vfactory.mjs "Workspace/tmp/ted_feifei/talk_720p.mp4" --out out --title "..."
```

每步 ffmpeg 命令见 `runlog.jsonl`。