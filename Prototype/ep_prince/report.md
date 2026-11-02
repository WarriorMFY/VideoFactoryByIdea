# 剪辑工厂交付报告

| 项 | 值 |
| --- | --- |
| 源文件 | `talk_720p.mp4` (87.8 MB, mov,mp4,m4a,3gp,3g2,mj2) |
| 源时长 | 12:41.1 (761.11s) |
| 源规格 | 1280x720 h264 @ 24000/1001 / aac 48000Hz 2ch |
| 成片时长 | 756.40s（切除 2.94s / 0.4%） |
| 成片规格 | 1280x720 30fps H.264 High + AAC 192k(loudnorm -16 LUFS) |
| 转场 | xfade(fade,0.4s) |

## 输入信号（自动探测）

- 黑场 3 段，冻帧 194 段，静音 61 段，场景切点 46 个

## 剪辑决策（6 个保留段）

| # | 入点 | 出点 | 时长 | 信号标记 |
| --- | --- | --- | --- | --- |
| 1 | 0:00.0 (0.00s) | 0:03.1 (3.13s) | 3.13s | 正常 |
| 2 | 0:03.7 (3.65s) | 0:17.9 (17.95s) | 14.30s | speech(已保护),freeze,silence |
| 3 | 0:18.4 (18.38s) | 8:05.1 (485.07s) | 466.69s | speech(已保护),black,freeze,silence |
| 4 | 8:05.5 (485.54s) | 11:36.7 (696.66s) | 211.12s | speech(已保护),freeze,silence |
| 5 | 11:37.2 (697.24s) | 11:42.3 (702.32s) | 5.08s | speech(已保护),freeze,silence |
| 6 | 11:42.5 (702.52s) | 12:40.4 (760.38s) | 57.86s | speech(已保护),freeze,silence |

## 切除段

| # | 入点 | 出点 | 时长 | 原因 |
| --- | --- | --- | --- | --- |
| 1 | 3.13s | 3.65s | 0.53s | black（无画面） |
| 2 | 91.01s | 93.24s | 2.24s | black（无画面） |
| 3 | 760.38s | 761.01s | 0.63s | black（无画面） |
| 4 | 5.01s | 5.70s | 0.69s | freeze∧silence（两路都无信息） |
| 5 | 7.27s | 7.89s | 0.63s | freeze∧silence（两路都无信息） |
| 6 | 17.59s | 18.66s | 1.07s | freeze∧silence（两路都无信息） |
| 7 | 20.71s | 21.04s | 0.32s | freeze∧silence（两路都无信息） |
| 8 | 39.32s | 39.81s | 0.49s | freeze∧silence（两路都无信息） |
| 9 | 46.42s | 46.50s | 0.08s | freeze∧silence（两路都无信息） |
| 10 | 85.23s | 85.81s | 0.58s | freeze∧silence（两路都无信息） |
| 11 | 90.77s | 91.01s | 0.24s | freeze∧silence（两路都无信息） |
| 12 | 112.83s | 113.13s | 0.30s | freeze∧silence（两路都无信息） |
| 13 | 124.35s | 124.92s | 0.57s | freeze∧silence（两路都无信息） |
| 14 | 157.21s | 157.85s | 0.64s | freeze∧silence（两路都无信息） |
| 15 | 161.17s | 161.73s | 0.56s | freeze∧silence（两路都无信息） |
| 16 | 180.76s | 181.38s | 0.62s | freeze∧silence（两路都无信息） |
| 17 | 186.79s | 187.32s | 0.52s | freeze∧silence（两路都无信息） |
| 18 | 215.49s | 216.07s | 0.57s | freeze∧silence（两路都无信息） |
| 19 | 224.78s | 225.18s | 0.40s | freeze∧silence（两路都无信息） |
| 20 | 244.16s | 244.61s | 0.44s | freeze∧silence（两路都无信息） |
| 21 | 254.31s | 254.96s | 0.64s | freeze∧silence（两路都无信息） |
| 22 | 260.15s | 260.41s | 0.26s | freeze∧silence（两路都无信息） |
| 23 | 296.54s | 296.85s | 0.30s | freeze∧silence（两路都无信息） |
| 24 | 346.76s | 347.26s | 0.50s | freeze∧silence（两路都无信息） |
| 25 | 357.52s | 357.91s | 0.38s | freeze∧silence（两路都无信息） |
| 26 | 400.85s | 401.72s | 0.86s | freeze∧silence（两路都无信息） |
| 27 | 420.03s | 420.17s | 0.14s | freeze∧silence（两路都无信息） |
| 28 | 485.07s | 485.84s | 0.77s | freeze∧silence（两路都无信息） |
| 29 | 520.06s | 520.74s | 0.68s | freeze∧silence（两路都无信息） |
| 30 | 523.62s | 524.14s | 0.53s | freeze∧silence（两路都无信息） |
| 31 | 558.84s | 559.62s | 0.78s | freeze∧silence（两路都无信息） |
| 32 | 606.39s | 606.75s | 0.37s | freeze∧silence（两路都无信息） |
| 33 | 696.35s | 697.47s | 1.12s | freeze∧silence（两路都无信息） |
| 34 | 702.32s | 702.52s | 0.20s | freeze∧silence（两路都无信息） |
| 35 | 738.62s | 738.99s | 0.37s | freeze∧silence（两路都无信息） |
| 36 | 751.16s | 751.66s | 0.50s | freeze∧silence（两路都无信息） |
| 37 | 0.00s | 761.11s | 761.11s | 语音保护：20 段语音区间已锁定，切除量 15.31s → 2.94s（恢复 12.37s） |

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
node Tool\edit\vfactory.mjs "Workspace/tmp/ted_prince/talk_720p.mp4" --out out --title "..."
```

每步 ffmpeg 命令见 `runlog.jsonl`。