# 剪辑工厂交付报告

| 项 | 值 |
| --- | --- |
| 源文件 | `talk_720p.mp4` (253.6 MB, mov,mp4,m4a,3gp,3g2,mj2) |
| 源时长 | 14:40.4 (880.36s) |
| 源规格 | 1280x720 h264 @ 24000/1001 / aac 48000Hz 2ch |
| 成片时长 | 872.03s（切除 4.66s / 0.5%） |
| 成片规格 | 1280x720 30fps H.264 High + AAC 192k(loudnorm -16 LUFS) |
| 转场 | xfade(fade,0.4s) |

## 输入信号（自动探测）

- 黑场 1 段，冻帧 272 段，静音 77 段，场景切点 77 个

## 剪辑决策（11 个保留段）

| # | 入点 | 出点 | 时长 | 信号标记 |
| --- | --- | --- | --- | --- |
| 1 | 0:00.0 (0.00s) | 0:03.1 (3.13s) | 3.13s | 正常 |
| 2 | 0:03.6 (3.63s) | 0:54.0 (54.01s) | 50.38s | speech(已保护),freeze,silence |
| 3 | 0:54.5 (54.47s) | 3:27.3 (207.29s) | 152.82s | speech(已保护),freeze,silence |
| 4 | 3:27.6 (207.59s) | 4:29.9 (269.89s) | 62.30s | speech(已保护),freeze,silence |
| 5 | 4:30.6 (270.62s) | 5:47.7 (347.74s) | 77.12s | speech(已保护),freeze,silence |
| 6 | 5:48.1 (348.05s) | 7:17.2 (437.23s) | 89.18s | speech(已保护),freeze,silence |
| 7 | 7:17.3 (437.30s) | 9:14.3 (554.26s) | 116.96s | speech(已保护),freeze,silence |
| 8 | 9:14.7 (554.66s) | 9:21.9 (561.91s) | 7.25s | speech(已保护),freeze,silence |
| 9 | 9:22.8 (562.76s) | 11:51.4 (711.42s) | 148.66s | speech(已保护),freeze,silence |
| 10 | 11:52.1 (712.09s) | 14:18.3 (858.27s) | 146.18s | speech(已保护),freeze,silence |
| 11 | 14:18.6 (858.65s) | 14:40.4 (880.36s) | 21.71s | speech(已保护),silence |

## 切除段

| # | 入点 | 出点 | 时长 | 原因 |
| --- | --- | --- | --- | --- |
| 1 | 3.13s | 3.63s | 0.50s | black（无画面） |
| 2 | 54.22s | 54.81s | 0.59s | freeze∧silence（两路都无信息） |
| 3 | 128.22s | 128.98s | 0.76s | freeze∧silence（两路都无信息） |
| 4 | 164.00s | 164.12s | 0.12s | freeze∧silence（两路都无信息） |
| 5 | 172.71s | 173.33s | 0.62s | freeze∧silence（两路都无信息） |
| 6 | 207.29s | 207.71s | 0.42s | freeze∧silence（两路都无信息） |
| 7 | 208.98s | 209.50s | 0.52s | freeze∧silence（两路都无信息） |
| 8 | 212.38s | 212.97s | 0.59s | freeze∧silence（两路都无信息） |
| 9 | 269.77s | 270.88s | 1.11s | freeze∧silence（两路都无信息） |
| 10 | 323.20s | 323.50s | 0.31s | freeze∧silence（两路都无信息） |
| 11 | 340.53s | 341.04s | 0.51s | freeze∧silence（两路都无信息） |
| 12 | 347.42s | 348.14s | 0.72s | freeze∧silence（两路都无信息） |
| 13 | 354.98s | 355.42s | 0.44s | freeze∧silence（两路都无信息） |
| 14 | 385.34s | 385.92s | 0.58s | freeze∧silence（两路都无信息） |
| 15 | 437.23s | 437.58s | 0.35s | freeze∧silence（两路都无信息） |
| 16 | 451.99s | 452.49s | 0.50s | freeze∧silence（两路都无信息） |
| 17 | 457.26s | 457.42s | 0.15s | freeze∧silence（两路都无信息） |
| 18 | 501.27s | 501.95s | 0.68s | freeze∧silence（两路都无信息） |
| 19 | 550.26s | 550.49s | 0.23s | freeze∧silence（两路都无信息） |
| 20 | 553.97s | 554.92s | 0.95s | freeze∧silence（两路都无信息） |
| 21 | 562.27s | 562.54s | 0.27s | freeze∧silence（两路都无信息） |
| 22 | 562.55s | 563.08s | 0.54s | freeze∧silence（两路都无信息） |
| 23 | 571.32s | 572.05s | 0.73s | freeze∧silence（两路都无信息） |
| 24 | 711.13s | 712.09s | 0.95s | freeze∧silence（两路都无信息） |
| 25 | 721.73s | 722.46s | 0.73s | freeze∧silence（两路都无信息） |
| 26 | 743.03s | 743.56s | 0.54s | freeze∧silence（两路都无信息） |
| 27 | 751.77s | 752.38s | 0.61s | freeze∧silence（两路都无信息） |
| 28 | 772.97s | 773.55s | 0.57s | freeze∧silence（两路都无信息） |
| 29 | 788.45s | 788.92s | 0.47s | freeze∧silence（两路都无信息） |
| 30 | 857.98s | 858.11s | 0.13s | freeze∧silence（两路都无信息） |
| 31 | 0.00s | 880.36s | 880.36s | 语音保护：53 段语音区间已锁定，切除量 15.41s → 4.67s（恢复 10.75s） |

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
node Tool\edit\vfactory.mjs "Workspace/tmp/ted_epb/talk_720p.mp4" --out out --title "..."
```

每步 ffmpeg 命令见 `runlog.jsonl`。