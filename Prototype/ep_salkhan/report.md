# 剪辑工厂交付报告

| 项 | 值 |
| --- | --- |
| 源文件 | `talk_720p.mp4` (253.9 MB, mov,mp4,m4a,3gp,3g2,mj2) |
| 源时长 | 20:50.9 (1250.94s) |
| 源规格 | 1280x720 h264 @ 24000/1001 / aac 48000Hz 2ch |
| 成片时长 | 1247.83s（切除 1.65s / 0.1%） |
| 成片规格 | 1280x720 30fps H.264 High + AAC 192k(loudnorm -16 LUFS) |
| 转场 | xfade(fade,0.4s) |

## 输入信号（自动探测）

- 黑场 1 段，冻帧 165 段，静音 110 段，场景切点 188 个

## 剪辑决策（5 个保留段）

| # | 入点 | 出点 | 时长 | 信号标记 |
| --- | --- | --- | --- | --- |
| 1 | 0:00.0 (0.00s) | 1:46.4 (106.42s) | 106.42s | speech(已保护),black,freeze,silence |
| 2 | 1:47.2 (107.18s) | 8:46.9 (526.86s) | 419.68s | speech(已保护),freeze,silence |
| 3 | 8:47.1 (527.15s) | 8:48.0 (528.04s) | 0.89s | speech(已保护),freeze,silence |
| 4 | 8:48.2 (528.15s) | 16:50.3 (1010.28s) | 482.13s | speech(已保护),freeze,silence |
| 5 | 16:50.8 (1010.77s) | 20:50.9 (1250.94s) | 240.17s | speech(已保护),freeze,silence |

## 切除段

| # | 入点 | 出点 | 时长 | 原因 |
| --- | --- | --- | --- | --- |
| 1 | 3.13s | 3.50s | 0.38s | black（无画面） |
| 2 | 106.19s | 106.56s | 0.38s | freeze∧silence（两路都无信息） |
| 3 | 106.77s | 107.15s | 0.38s | freeze∧silence（两路都无信息） |
| 4 | 466.20s | 466.42s | 0.23s | freeze∧silence（两路都无信息） |
| 5 | 526.86s | 527.23s | 0.37s | freeze∧silence（两路都无信息） |
| 6 | 527.78s | 528.15s | 0.38s | freeze∧silence（两路都无信息） |
| 7 | 551.07s | 551.51s | 0.44s | freeze∧silence（两路都无信息） |
| 8 | 571.65s | 571.73s | 0.08s | freeze∧silence（两路都无信息） |
| 9 | 571.86s | 572.03s | 0.17s | freeze∧silence（两路都无信息） |
| 10 | 605.90s | 606.31s | 0.41s | freeze∧silence（两路都无信息） |
| 11 | 656.49s | 657.08s | 0.59s | freeze∧silence（两路都无信息） |
| 12 | 661.18s | 661.83s | 0.65s | freeze∧silence（两路都无信息） |
| 13 | 664.44s | 664.75s | 0.31s | freeze∧silence（两路都无信息） |
| 14 | 791.42s | 791.92s | 0.50s | freeze∧silence（两路都无信息） |
| 15 | 821.86s | 821.97s | 0.10s | freeze∧silence（两路都无信息） |
| 16 | 909.16s | 909.64s | 0.48s | freeze∧silence（两路都无信息） |
| 17 | 938.15s | 938.60s | 0.46s | freeze∧silence（两路都无信息） |
| 18 | 981.52s | 981.80s | 0.27s | freeze∧silence（两路都无信息） |
| 19 | 988.60s | 988.65s | 0.05s | freeze∧silence（两路都无信息） |
| 20 | 1010.18s | 1011.02s | 0.84s | freeze∧silence（两路都无信息） |
| 21 | 1016.23s | 1016.64s | 0.41s | freeze∧silence（两路都无信息） |
| 22 | 1240.49s | 1240.57s | 0.08s | freeze∧silence（两路都无信息） |
| 23 | 0.00s | 1250.94s | 1250.94s | 语音保护：61 段语音区间已锁定，切除量 6.11s → 1.65s（恢复 4.45s） |

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
node Tool\edit\vfactory.mjs "Workspace/tmp/ted_salkhan/talk_720p.mp4" --out out --title "..."
```

每步 ffmpeg 命令见 `runlog.jsonl`。