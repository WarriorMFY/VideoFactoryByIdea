# 剪辑工厂交付报告

| 项 | 值 |
| --- | --- |
| 源文件 | `talk_720p.mp4` (840.1 MB, mov,mp4,m4a,3gp,3g2,mj2) |
| 源时长 | 53:05.4 (3185.41s) |
| 源规格 | 1280x720 h264 @ 24000/1001 / aac 48000Hz 2ch |
| 成片时长 | 3157.23s（切除 18.12s / 0.6%） |
| 成片规格 | 1280x720 30fps H.264 High + AAC 192k(loudnorm -16 LUFS) |
| 转场 | xfade(fade,0.4s) |

## 输入信号（自动探测）

- 黑场 2 段，冻帧 331 段，静音 420 段，场景切点 258 个

## 剪辑决策（29 个保留段）

| # | 入点 | 出点 | 时长 | 信号标记 |
| --- | --- | --- | --- | --- |
| 1 | 0:00.0 (0.00s) | 0:03.1 (3.13s) | 3.13s | 正常 |
| 2 | 0:04.6 (4.58s) | 9:53.1 (593.08s) | 588.50s | speech(已保护),black,freeze,silence |
| 3 | 9:54.1 (594.09s) | 12:38.5 (758.47s) | 164.37s | speech(已保护),freeze,silence |
| 4 | 12:38.9 (758.92s) | 21:39.2 (1299.20s) | 540.27s | speech(已保护),freeze,silence |
| 5 | 21:41.2 (1301.15s) | 23:18.5 (1398.50s) | 97.35s | speech(已保护),freeze,silence |
| 6 | 23:18.9 (1398.90s) | 23:49.4 (1429.40s) | 30.50s | speech(已保护),freeze,silence |
| 7 | 23:49.7 (1429.72s) | 24:13.3 (1453.30s) | 23.58s | speech(已保护),freeze,silence |
| 8 | 24:14.8 (1454.76s) | 24:16.2 (1456.16s) | 1.40s | speech(已保护),freeze,silence |
| 9 | 24:17.3 (1457.31s) | 26:13.9 (1573.88s) | 116.57s | speech(已保护),freeze,silence |
| 10 | 26:14.8 (1574.82s) | 27:38.8 (1658.78s) | 83.96s | speech(已保护),freeze,silence |
| 11 | 27:40.5 (1660.53s) | 28:34.3 (1714.34s) | 53.81s | speech(已保护),freeze,silence |
| 12 | 28:35.0 (1715.01s) | 28:35.8 (1715.75s) | 0.74s | speech(已保护),freeze,silence |
| 13 | 28:36.1 (1716.12s) | 30:26.5 (1826.53s) | 110.41s | speech(已保护),freeze,silence |
| 14 | 30:27.0 (1826.95s) | 33:08.5 (1988.49s) | 161.54s | speech(已保护),freeze,silence |
| 15 | 33:08.8 (1988.78s) | 34:19.8 (2059.85s) | 71.07s | speech(已保护),freeze,silence |
| 16 | 34:19.9 (2059.93s) | 34:40.1 (2080.08s) | 20.15s | speech(已保护),freeze,silence |
| 17 | 34:40.2 (2080.15s) | 34:41.8 (2081.82s) | 1.67s | speech(已保护),freeze,silence |
| 18 | 34:43.3 (2083.33s) | 34:45.5 (2085.54s) | 2.21s | speech(已保护),freeze,silence |
| 19 | 34:46.2 (2086.18s) | 34:58.5 (2098.53s) | 12.35s | speech(已保护),freeze,silence |
| 20 | 34:58.6 (2098.60s) | 36:07.7 (2167.67s) | 69.07s | speech(已保护),freeze,silence |
| 21 | 36:07.9 (2167.93s) | 36:12.8 (2172.75s) | 4.82s | speech(已保护),freeze,silence |
| 22 | 36:12.8 (2172.85s) | 43:16.3 (2596.26s) | 423.41s | speech(已保护),freeze,silence |
| 23 | 43:17.1 (2597.09s) | 47:24.3 (2844.34s) | 247.25s | speech(已保护),freeze,silence |
| 24 | 47:24.4 (2844.40s) | 48:27.3 (2907.34s) | 62.94s | speech(已保护),freeze,silence |
| 25 | 48:27.7 (2907.71s) | 50:40.1 (3040.11s) | 132.40s | speech(已保护),freeze,silence |
| 26 | 50:40.8 (3040.77s) | 51:02.9 (3062.87s) | 22.10s | speech(已保护),freeze,silence |
| 27 | 51:02.9 (3062.93s) | 52:26.9 (3146.92s) | 83.99s | speech(已保护),freeze,silence |
| 28 | 52:27.0 (3147.02s) | 52:38.9 (3158.86s) | 11.84s | speech(已保护),silence |
| 29 | 52:39.5 (3159.53s) | 53:05.4 (3185.41s) | 25.88s | speech(已保护),freeze |

## 切除段

| # | 入点 | 出点 | 时长 | 原因 |
| --- | --- | --- | --- | --- |
| 1 | 3.13s | 3.63s | 0.50s | black（无画面） |
| 2 | 593.01s | 594.09s | 1.08s | black（无画面） |
| 3 | 4.34s | 4.87s | 0.53s | freeze∧silence（两路都无信息） |
| 4 | 624.99s | 625.29s | 0.30s | freeze∧silence（两路都无信息） |
| 5 | 666.79s | 666.88s | 0.09s | freeze∧silence（两路都无信息） |
| 6 | 758.47s | 758.92s | 0.46s | freeze∧silence（两路都无信息） |
| 7 | 798.51s | 798.84s | 0.33s | freeze∧silence（两路都无信息） |
| 8 | 1209.62s | 1210.16s | 0.54s | freeze∧silence（两路都无信息） |
| 9 | 1299.21s | 1299.76s | 0.55s | freeze∧silence（两路都无信息） |
| 10 | 1300.54s | 1301.15s | 0.61s | freeze∧silence（两路都无信息） |
| 11 | 1348.35s | 1348.68s | 0.33s | freeze∧silence（两路都无信息） |
| 12 | 1398.15s | 1398.67s | 0.52s | freeze∧silence（两路都无信息） |
| 13 | 1429.34s | 1429.72s | 0.38s | freeze∧silence（两路都无信息） |
| 14 | 1453.30s | 1455.04s | 1.74s | freeze∧silence（两路都无信息） |
| 15 | 1455.90s | 1457.31s | 1.41s | freeze∧silence（两路都无信息） |
| 16 | 1573.78s | 1574.82s | 1.04s | freeze∧silence（两路都无信息） |
| 17 | 1658.41s | 1658.95s | 0.54s | freeze∧silence（两路都无信息） |
| 18 | 1659.16s | 1660.16s | 1.00s | freeze∧silence（两路都无信息） |
| 19 | 1714.80s | 1715.17s | 0.37s | freeze∧silence（两路都无信息） |
| 20 | 1715.55s | 1716.38s | 0.83s | freeze∧silence（两路都无信息） |
| 21 | 1826.53s | 1826.95s | 0.42s | freeze∧silence（两路都无信息） |
| 22 | 1852.06s | 1852.59s | 0.53s | freeze∧silence（两路都无信息） |
| 23 | 1854.56s | 1855.11s | 0.55s | freeze∧silence（两路都无信息） |
| 24 | 1860.60s | 1860.86s | 0.26s | freeze∧silence（两路都无信息） |
| 25 | 1897.77s | 1898.15s | 0.38s | freeze∧silence（两路都无信息） |
| 26 | 1988.28s | 1988.78s | 0.50s | freeze∧silence（两路都无信息） |
| 27 | 2059.85s | 2060.22s | 0.37s | freeze∧silence（两路都无信息） |
| 28 | 2080.08s | 2080.15s | 0.07s | freeze∧silence（两路都无信息） |
| 29 | 2081.76s | 2082.75s | 0.99s | freeze∧silence（两路都无信息） |
| 30 | 2082.96s | 2083.18s | 0.22s | freeze∧silence（两路都无信息） |
| 31 | 2083.27s | 2083.33s | 0.06s | freeze∧silence（两路都无信息） |
| 32 | 2085.54s | 2086.44s | 0.90s | freeze∧silence（两路都无信息） |
| 33 | 2090.45s | 2091.02s | 0.57s | freeze∧silence（两路都无信息） |
| 34 | 2092.81s | 2093.26s | 0.45s | freeze∧silence（两路都无信息） |
| 35 | 2098.19s | 2098.60s | 0.41s | freeze∧silence（两路都无信息） |
| 36 | 2160.62s | 2161.03s | 0.41s | freeze∧silence（两路都无信息） |
| 37 | 2167.67s | 2167.93s | 0.26s | freeze∧silence（两路都无信息） |
| 38 | 2172.75s | 2173.12s | 0.37s | freeze∧silence（两路都无信息） |
| 39 | 2197.70s | 2198.14s | 0.44s | freeze∧silence（两路都无信息） |
| 40 | 2538.12s | 2538.34s | 0.22s | freeze∧silence（两路都无信息） |
| 41 | 2544.96s | 2545.08s | 0.12s | freeze∧silence（两路都无信息） |
| 42 | 2596.26s | 2597.09s | 0.83s | freeze∧silence（两路都无信息） |
| 43 | 2706.51s | 2707.09s | 0.58s | freeze∧silence（两路都无信息） |
| 44 | 2718.91s | 2719.30s | 0.39s | freeze∧silence（两路都无信息） |
| 45 | 2844.34s | 2844.40s | 0.06s | freeze∧silence（两路都无信息） |
| 46 | 2851.72s | 2852.14s | 0.42s | freeze∧silence（两路都无信息） |
| 47 | 2907.34s | 2907.84s | 0.50s | freeze∧silence（两路都无信息） |
| 48 | 3022.89s | 3022.98s | 0.09s | freeze∧silence（两路都无信息） |
| 49 | 3040.11s | 3041.08s | 0.97s | freeze∧silence（两路都无信息） |
| 50 | 3062.62s | 3062.93s | 0.31s | freeze∧silence（两路都无信息） |
| 51 | 3146.92s | 3147.02s | 0.10s | freeze∧silence（两路都无信息） |
| 52 | 3158.86s | 3158.99s | 0.13s | freeze∧silence（两路都无信息） |
| 53 | 0.00s | 3185.41s | 3185.41s | 语音保护：382 段语音区间已锁定，切除量 29.99s → 18.12s（恢复 11.87s） |

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
node Tool\edit\vfactory.mjs "Workspace/tmp/ted_batch/musk/talk_720p.mp4" --out out --title "..."
```

每步 ffmpeg 命令见 `runlog.jsonl`。