# 剪辑工厂交付报告

| 项 | 值 |
| --- | --- |
| 源文件 | `talk_720p.mp4` (867.8 MB, mov,mp4,m4a,3gp,3g2,mj2) |
| 源时长 | 47:29.7 (2849.71s) |
| 源规格 | 1280x720 h264 @ 24000/1001 / aac 48000Hz 2ch |
| 成片时长 | 2835.37s（切除 7.90s / 0.3%） |
| 成片规格 | 1280x720 30fps H.264 High + AAC 192k(loudnorm -16 LUFS) |
| 转场 | xfade(fade,0.4s) |

## 输入信号（自动探测）

- 黑场 1 段，冻帧 226 段，静音 382 段，场景切点 208 个

## 剪辑决策（18 个保留段）

| # | 入点 | 出点 | 时长 | 信号标记 |
| --- | --- | --- | --- | --- |
| 1 | 0:00.0 (0.00s) | 0:03.1 (3.13s) | 3.13s | 正常 |
| 2 | 0:03.6 (3.59s) | 0:30.3 (30.31s) | 26.72s | speech(已保护),freeze,silence |
| 3 | 0:30.8 (30.83s) | 1:03.2 (63.19s) | 32.36s | speech(已保护),freeze,silence |
| 4 | 1:03.2 (63.25s) | 1:05.4 (65.44s) | 2.19s | speech(已保护),silence |
| 5 | 1:06.2 (66.23s) | 2:17.3 (137.26s) | 71.03s | speech(已保护),freeze,silence |
| 6 | 2:18.2 (138.17s) | 2:23.0 (142.99s) | 4.82s | speech(已保护),freeze,silence |
| 7 | 2:23.3 (143.30s) | 2:24.4 (144.40s) | 1.10s | speech(已保护),freeze,silence |
| 8 | 2:25.1 (145.08s) | 8:23.2 (503.23s) | 358.15s | speech(已保护),freeze,silence |
| 9 | 8:23.5 (503.45s) | 13:29.3 (809.29s) | 305.84s | speech(已保护),freeze,silence |
| 10 | 13:29.8 (809.76s) | 22:15.3 (1335.31s) | 525.55s | speech(已保护),freeze,silence |
| 11 | 22:15.7 (1335.65s) | 28:01.8 (1681.75s) | 346.10s | speech(已保护),freeze,silence |
| 12 | 28:02.0 (1681.96s) | 33:05.1 (1985.10s) | 303.14s | speech(已保护),freeze,silence |
| 13 | 33:05.6 (1985.57s) | 33:58.2 (2038.17s) | 52.60s | speech(已保护),freeze,silence |
| 14 | 33:58.4 (2038.42s) | 36:51.1 (2211.09s) | 172.67s | speech(已保护),freeze,silence |
| 15 | 36:51.8 (2211.82s) | 41:48.6 (2508.61s) | 296.79s | speech(已保护),freeze,silence |
| 16 | 41:48.8 (2508.84s) | 41:55.8 (2515.78s) | 6.94s | speech(已保护),freeze,silence |
| 17 | 41:56.2 (2516.24s) | 45:04.8 (2704.79s) | 188.55s | speech(已保护),freeze,silence |
| 18 | 45:05.6 (2705.59s) | 47:29.7 (2849.71s) | 144.12s | speech(已保护),freeze,silence |

## 切除段

| # | 入点 | 出点 | 时长 | 原因 |
| --- | --- | --- | --- | --- |
| 1 | 3.13s | 3.59s | 0.46s | black（无画面） |
| 2 | 30.01s | 31.12s | 1.11s | freeze∧silence（两路都无信息） |
| 3 | 42.92s | 43.26s | 0.34s | freeze∧silence（两路都无信息） |
| 4 | 62.87s | 63.25s | 0.38s | freeze∧silence（两路都无信息） |
| 5 | 65.68s | 66.52s | 0.84s | freeze∧silence（两路都无信息） |
| 6 | 67.17s | 67.78s | 0.61s | freeze∧silence（两路都无信息） |
| 7 | 68.61s | 69.44s | 0.83s | freeze∧silence（两路都无信息） |
| 8 | 136.96s | 137.82s | 0.86s | freeze∧silence（两路都无信息） |
| 9 | 137.99s | 138.47s | 0.48s | freeze∧silence（两路都无信息） |
| 10 | 139.32s | 139.82s | 0.50s | freeze∧silence（两路都无信息） |
| 11 | 140.82s | 141.50s | 0.69s | freeze∧silence（两路都无信息） |
| 12 | 142.65s | 143.59s | 0.93s | freeze∧silence（两路都无信息） |
| 13 | 144.11s | 145.08s | 0.97s | freeze∧silence（两路都无信息） |
| 14 | 146.86s | 147.10s | 0.24s | freeze∧silence（两路都无信息） |
| 15 | 502.92s | 503.45s | 0.54s | freeze∧silence（两路都无信息） |
| 16 | 809.29s | 809.76s | 0.47s | freeze∧silence（两路都无信息） |
| 17 | 1324.47s | 1324.83s | 0.36s | freeze∧silence（两路都无信息） |
| 18 | 1335.04s | 1335.92s | 0.88s | freeze∧silence（两路都无信息） |
| 19 | 1677.76s | 1677.83s | 0.07s | freeze∧silence（两路都无信息） |
| 20 | 1681.60s | 1681.96s | 0.36s | freeze∧silence（两路都无信息） |
| 21 | 1793.48s | 1793.99s | 0.51s | freeze∧silence（两路都无信息） |
| 22 | 1984.04s | 1984.56s | 0.52s | freeze∧silence（两路都无信息） |
| 23 | 1984.77s | 1985.47s | 0.70s | freeze∧silence（两路都无信息） |
| 24 | 2025.17s | 2025.32s | 0.15s | freeze∧silence（两路都无信息） |
| 25 | 2037.99s | 2038.42s | 0.43s | freeze∧silence（两路都无信息） |
| 26 | 2210.71s | 2212.06s | 1.35s | freeze∧silence（两路都无信息） |
| 27 | 2212.36s | 2213.11s | 0.75s | freeze∧silence（两路都无信息） |
| 28 | 2228.11s | 2228.63s | 0.52s | freeze∧silence（两路都无信息） |
| 29 | 2483.30s | 2483.66s | 0.36s | freeze∧silence（两路都无信息） |
| 30 | 2508.62s | 2508.84s | 0.22s | freeze∧silence（两路都无信息） |
| 31 | 2512.63s | 2512.82s | 0.19s | freeze∧silence（两路都无信息） |
| 32 | 2514.56s | 2515.06s | 0.50s | freeze∧silence（两路都无信息） |
| 33 | 2515.49s | 2515.80s | 0.31s | freeze∧silence（两路都无信息） |
| 34 | 2516.16s | 2516.51s | 0.35s | freeze∧silence（两路都无信息） |
| 35 | 2519.73s | 2519.87s | 0.14s | freeze∧silence（两路都无信息） |
| 36 | 2629.13s | 2629.38s | 0.25s | freeze∧silence（两路都无信息） |
| 37 | 2704.79s | 2705.59s | 0.80s | freeze∧silence（两路都无信息） |
| 38 | 0.00s | 2849.71s | 2849.71s | 语音保护：250 段语音区间已锁定，切除量 25.86s → 7.90s（恢复 17.96s） |

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
node Tool\edit\vfactory.mjs "Workspace/tmp/ted_batch/altman/talk_720p.mp4" --out out --title "..."
```

每步 ffmpeg 命令见 `runlog.jsonl`。