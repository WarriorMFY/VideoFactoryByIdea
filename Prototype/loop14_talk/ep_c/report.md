# 剪辑工厂交付报告

| 项 | 值 |
| --- | --- |
| 源文件 | `talk_720p.mp4` (379.7 MB, mov,mp4,m4a,3gp,3g2,mj2) |
| 源时长 | 22:01.6 (1321.56s) |
| 源规格 | 1280x720 h264 @ 24000/1001 / aac 48000Hz 2ch |
| 成片时长 | 1294.30s（切除 16.10s / 1.2%） |
| 成片规格 | 1280x720 30fps H.264 High + AAC 192k(loudnorm -16 LUFS) |
| 转场 | xfade(fade,0.4s) |

## 输入信号（自动探测）

- 黑场 6 段，冻帧 336 段，静音 286 段，场景切点 41 个

## 剪辑决策（32 个保留段）

| # | 入点 | 出点 | 时长 | 信号标记 |
| --- | --- | --- | --- | --- |
| 1 | 0:00.0 (0.00s) | 0:03.1 (3.13s) | 3.13s | 正常 |
| 2 | 0:03.6 (3.63s) | 0:12.4 (12.39s) | 8.76s | speech(已保护),silence |
| 3 | 0:12.5 (12.50s) | 0:34.0 (33.97s) | 21.47s | speech(已保护),freeze,silence |
| 4 | 0:34.3 (34.34s) | 1:32.3 (92.26s) | 57.92s | speech(已保护),freeze,silence |
| 5 | 1:32.7 (92.72s) | 2:53.1 (173.09s) | 80.37s | speech(已保护),freeze,silence |
| 6 | 2:54.1 (174.08s) | 2:55.5 (175.51s) | 1.43s | speech(已保护),freeze,silence |
| 7 | 2:56.6 (176.63s) | 3:27.6 (207.62s) | 30.99s | speech(已保护),freeze,silence |
| 8 | 3:28.0 (208.04s) | 3:36.1 (216.10s) | 8.06s | speech(已保护),freeze,silence |
| 9 | 3:37.4 (217.43s) | 3:55.1 (235.12s) | 17.69s | speech(已保护),freeze,silence |
| 10 | 3:55.4 (235.40s) | 4:00.1 (240.07s) | 4.67s | speech(已保护),freeze,silence |
| 11 | 4:00.5 (240.53s) | 4:05.4 (245.41s) | 4.88s | speech(已保护),freeze,silence |
| 12 | 4:06.3 (246.29s) | 4:18.5 (258.52s) | 12.23s | speech(已保护),freeze,silence |
| 13 | 4:19.3 (259.26s) | 4:43.8 (283.78s) | 24.52s | speech(已保护),silence |
| 14 | 4:44.1 (284.06s) | 5:29.2 (329.20s) | 45.14s | speech(已保护),freeze,silence |
| 15 | 5:29.3 (329.29s) | 6:29.4 (389.39s) | 60.10s | speech(已保护),black,freeze,silence |
| 16 | 6:29.4 (389.45s) | 7:21.2 (441.19s) | 51.74s | speech(已保护),freeze,silence |
| 17 | 7:21.5 (441.53s) | 8:15.5 (495.46s) | 53.93s | speech(已保护),freeze,silence |
| 18 | 8:15.9 (495.91s) | 10:57.0 (656.98s) | 161.07s | speech(已保护),black,freeze,silence |
| 19 | 10:57.6 (657.59s) | 11:22.3 (682.27s) | 24.68s | speech(已保护),black,freeze,silence |
| 20 | 11:22.8 (682.76s) | 12:01.4 (721.39s) | 38.63s | speech(已保护),silence |
| 21 | 12:01.6 (721.64s) | 12:09.9 (729.94s) | 8.30s | speech(已保护),freeze,silence |
| 22 | 12:10.9 (730.88s) | 12:27.5 (747.55s) | 16.67s | speech(已保护),freeze,silence |
| 23 | 12:28.0 (747.95s) | 13:06.5 (786.54s) | 38.59s | speech(已保护),freeze,silence |
| 24 | 13:06.8 (786.83s) | 13:36.8 (816.82s) | 29.99s | speech(已保护),freeze,silence |
| 25 | 13:37.7 (817.73s) | 14:18.2 (858.23s) | 40.50s | speech(已保护),freeze,silence |
| 26 | 14:18.4 (858.44s) | 14:23.9 (863.92s) | 5.48s | speech(已保护),freeze,silence |
| 27 | 14:24.2 (864.24s) | 15:12.3 (912.28s) | 48.04s | speech(已保护),freeze,silence |
| 28 | 15:13.5 (913.52s) | 15:48.6 (948.64s) | 35.12s | speech(已保护),freeze,silence |
| 29 | 15:48.8 (948.82s) | 16:34.0 (994.00s) | 45.18s | speech(已保护),freeze,silence |
| 30 | 16:34.5 (994.49s) | 17:26.7 (1046.74s) | 52.25s | speech(已保护),black,freeze,silence |
| 31 | 17:27.2 (1047.23s) | 17:30.7 (1050.67s) | 3.44s | speech(已保护),freeze,silence |
| 32 | 17:31.1 (1051.07s) | 22:01.6 (1321.56s) | 270.49s | speech(已保护),freeze,silence |

## 切除段

| # | 入点 | 出点 | 时长 | 原因 |
| --- | --- | --- | --- | --- |
| 1 | 3.13s | 3.63s | 0.50s | black（无画面） |
| 2 | 338.75s | 349.72s | 10.97s | black（无画面） |
| 3 | 525.07s | 527.32s | 2.25s | black（无画面） |
| 4 | 668.54s | 669.25s | 0.71s | black（无画面） |
| 5 | 676.84s | 677.18s | 0.33s | black（无画面） |
| 6 | 1044.71s | 1046.55s | 1.84s | black（无画面） |
| 7 | 12.39s | 12.76s | 0.38s | freeze∧silence（两路都无信息） |
| 8 | 17.68s | 17.90s | 0.21s | freeze∧silence（两路都无信息） |
| 9 | 21.15s | 21.31s | 0.16s | freeze∧silence（两路都无信息） |
| 10 | 21.73s | 21.99s | 0.26s | freeze∧silence（两路都无信息） |
| 11 | 33.62s | 34.59s | 0.97s | freeze∧silence（两路都无信息） |
| 12 | 85.38s | 85.84s | 0.47s | freeze∧silence（两路都无信息） |
| 13 | 91.96s | 92.80s | 0.84s | freeze∧silence（两路都无信息） |
| 14 | 96.22s | 96.56s | 0.33s | freeze∧silence（两路都无信息） |
| 15 | 125.04s | 125.46s | 0.42s | freeze∧silence（两路都无信息） |
| 16 | 173.30s | 174.35s | 1.06s | freeze∧silence（两路都无信息） |
| 17 | 175.26s | 176.72s | 1.46s | freeze∧silence（两路都无信息） |
| 18 | 188.98s | 189.29s | 0.31s | freeze∧silence（两路都无信息） |
| 19 | 194.40s | 194.63s | 0.23s | freeze∧silence（两路都无信息） |
| 20 | 201.34s | 201.49s | 0.15s | freeze∧silence（两路都无信息） |
| 21 | 207.62s | 208.04s | 0.42s | freeze∧silence（两路都无信息） |
| 22 | 212.42s | 213.23s | 0.81s | freeze∧silence（两路都无信息） |
| 23 | 215.92s | 217.43s | 1.50s | freeze∧silence（两路都无信息） |
| 24 | 219.01s | 219.30s | 0.29s | freeze∧silence（两路都无信息） |
| 25 | 234.87s | 235.40s | 0.54s | freeze∧silence（两路都无信息） |
| 26 | 240.07s | 240.82s | 0.75s | freeze∧silence（两路都无信息） |
| 27 | 245.12s | 246.60s | 1.48s | freeze∧silence（两路都无信息） |
| 28 | 247.92s | 248.54s | 0.62s | freeze∧silence（两路都无信息） |
| 29 | 258.38s | 259.26s | 0.88s | freeze∧silence（两路都无信息） |
| 30 | 283.78s | 284.37s | 0.58s | freeze∧silence（两路都无信息） |
| 31 | 287.97s | 288.67s | 0.70s | freeze∧silence（两路都无信息） |
| 32 | 292.00s | 292.66s | 0.66s | freeze∧silence（两路都无信息） |
| 33 | 294.58s | 295.29s | 0.71s | freeze∧silence（两路都无信息） |
| 34 | 299.21s | 299.76s | 0.55s | freeze∧silence（两路都无信息） |
| 35 | 322.20s | 322.72s | 0.52s | freeze∧silence（两路都无信息） |
| 36 | 326.54s | 326.71s | 0.18s | freeze∧silence（两路都无信息） |
| 37 | 328.87s | 329.29s | 0.42s | freeze∧silence（两路都无信息） |
| 38 | 361.37s | 361.95s | 0.59s | freeze∧silence（两路都无信息） |
| 39 | 372.06s | 372.37s | 0.31s | freeze∧silence（两路都无信息） |
| 40 | 389.39s | 389.70s | 0.31s | freeze∧silence（两路都无信息） |
| 41 | 436.44s | 436.61s | 0.17s | freeze∧silence（两路都无信息） |
| 42 | 440.87s | 441.61s | 0.73s | freeze∧silence（两路都无信息） |
| 43 | 444.82s | 445.24s | 0.42s | freeze∧silence（两路都无信息） |
| 44 | 482.76s | 482.90s | 0.13s | freeze∧silence（两路都无信息） |
| 45 | 490.66s | 491.05s | 0.39s | freeze∧silence（两路都无信息） |
| 46 | 493.57s | 494.24s | 0.67s | freeze∧silence（两路都无信息） |
| 47 | 495.19s | 495.91s | 0.73s | freeze∧silence（两路都无信息） |
| 48 | 500.17s | 500.51s | 0.34s | freeze∧silence（两路都无信息） |
| 49 | 505.40s | 506.21s | 0.81s | freeze∧silence（两路都无信息） |
| 50 | 509.32s | 510.01s | 0.69s | freeze∧silence（两路都无信息） |
| 51 | 511.21s | 511.80s | 0.59s | freeze∧silence（两路都无信息） |
| 52 | 514.27s | 514.60s | 0.33s | freeze∧silence（两路都无信息） |
| 53 | 521.40s | 521.77s | 0.38s | freeze∧silence（两路都无信息） |
| 54 | 534.90s | 535.03s | 0.13s | freeze∧silence（两路都无信息） |
| 55 | 535.24s | 535.47s | 0.23s | freeze∧silence（两路都无信息） |
| 56 | 548.55s | 549.13s | 0.58s | freeze∧silence（两路都无信息） |
| 57 | 652.15s | 652.41s | 0.25s | freeze∧silence（两路都无信息） |
| 58 | 653.04s | 653.58s | 0.54s | freeze∧silence（两路都无信息） |
| 59 | 656.66s | 656.82s | 0.17s | freeze∧silence（两路都无信息） |
| 60 | 657.49s | 657.59s | 0.10s | freeze∧silence（两路都无信息） |
| 61 | 660.24s | 660.70s | 0.46s | freeze∧silence（两路都无信息） |
| 62 | 682.18s | 682.76s | 0.58s | freeze∧silence（两路都无信息） |
| 63 | 721.39s | 721.95s | 0.57s | freeze∧silence（两路都无信息） |
| 64 | 725.52s | 726.23s | 0.70s | freeze∧silence（两路都无信息） |
| 65 | 729.73s | 731.18s | 1.45s | freeze∧silence（两路都无信息） |
| 66 | 745.08s | 745.67s | 0.59s | freeze∧silence（两路都无信息） |
| 67 | 747.25s | 747.99s | 0.75s | freeze∧silence（两路都无信息） |
| 68 | 750.46s | 751.28s | 0.82s | freeze∧silence（两路都无信息） |
| 69 | 772.14s | 772.64s | 0.51s | freeze∧silence（两路都无信息） |
| 70 | 786.54s | 787.00s | 0.46s | freeze∧silence（两路都无信息） |
| 71 | 795.54s | 795.92s | 0.38s | freeze∧silence（两路都无信息） |
| 72 | 812.10s | 812.22s | 0.11s | freeze∧silence（两路都无信息） |
| 73 | 816.52s | 818.02s | 1.50s | freeze∧silence（两路都无信息） |
| 74 | 821.32s | 821.65s | 0.33s | freeze∧silence（两路都无信息） |
| 75 | 858.23s | 858.73s | 0.50s | freeze∧silence（两路都无信息） |
| 76 | 860.78s | 861.55s | 0.77s | freeze∧silence（两路都无信息） |
| 77 | 863.60s | 864.74s | 1.14s | freeze∧silence（两路都无信息） |
| 78 | 907.25s | 908.02s | 0.76s | freeze∧silence（两路都无信息） |
| 79 | 911.97s | 913.84s | 1.86s | freeze∧silence（两路都无信息） |
| 80 | 915.14s | 915.54s | 0.40s | freeze∧silence（两路都无信息） |
| 81 | 920.76s | 921.17s | 0.41s | freeze∧silence（两路都无信息） |
| 82 | 948.45s | 948.82s | 0.38s | freeze∧silence（两路都无信息） |
| 83 | 993.69s | 994.49s | 0.80s | freeze∧silence（两路都无信息） |
| 84 | 1046.55s | 1047.51s | 0.96s | freeze∧silence（两路都无信息） |
| 85 | 1048.31s | 1048.82s | 0.51s | freeze∧silence（两路都无信息） |
| 86 | 1050.38s | 1051.36s | 0.98s | freeze∧silence（两路都无信息） |
| 87 | 1052.74s | 1052.93s | 0.19s | freeze∧silence（两路都无信息） |
| 88 | 1192.43s | 1192.65s | 0.22s | freeze∧silence（两路都无信息） |
| 89 | 1192.77s | 1192.94s | 0.17s | freeze∧silence（两路都无信息） |
| 90 | 1282.32s | 1282.59s | 0.27s | freeze∧silence（两路都无信息） |
| 91 | 0.00s | 1321.56s | 1321.56s | 语音保护：147 段语音区间已锁定，切除量 64.61s → 16.10s（恢复 48.51s） |

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
node Tool\edit\vfactory.mjs "Workspace/tmp/ted_batch/suleyman/talk_720p.mp4" --out out --title "..."
```

每步 ffmpeg 命令见 `runlog.jsonl`。