# 剪辑工厂交付报告

| 项 | 值 |
| --- | --- |
| 源文件 | `sintel-trailer.mp4` (4.2 MB, mov,mp4,m4a,3gp,3g2,mj2) |
| 源时长 | 0:52.2 (52.21s) |
| 源规格 | 854x480 h264 @ 24/1 / aac 48000Hz 2ch |
| 成片时长 | 39.10s（切除 11.57s / 22.2%） |
| 成片规格 | 1280x720 30fps H.264 High + AAC 192k(loudnorm -16 LUFS) |
| 转场 | xfade(fade,0.4s) |

## 输入信号（自动探测）

- 黑场 8 段，冻帧 14 段，静音 2 段，场景切点 6 个

## 剪辑决策（5 个保留段）

| # | 入点 | 出点 | 时长 | 信号标记 |
| --- | --- | --- | --- | --- |
| 1 | 0:00.8 (0.79s) | 0:09.3 (9.29s) | 8.50s | silence |
| 2 | 0:11.9 (11.93s) | 0:16.5 (16.50s) | 4.57s | speech(已保护),black,freeze |
| 3 | 0:18.2 (18.17s) | 0:21.5 (21.54s) | 3.38s | speech(已保护) |
| 4 | 0:22.0 (21.96s) | 0:44.0 (44.05s) | 22.09s | speech(已保护),black,freeze |
| 5 | 0:48.5 (48.46s) | 0:50.6 (50.56s) | 2.10s | freeze |

## 切除段

| # | 入点 | 出点 | 时长 | 原因 |
| --- | --- | --- | --- | --- |
| 1 | 0.00s | 0.79s | 0.79s | black（无画面） |
| 2 | 9.29s | 11.96s | 2.67s | black（无画面） |
| 3 | 16.00s | 16.50s | 0.50s | black（无画面） |
| 4 | 17.50s | 18.17s | 0.67s | black（无画面） |
| 5 | 21.54s | 21.96s | 0.42s | black（无画面） |
| 6 | 28.00s | 28.33s | 0.33s | black（无画面） |
| 7 | 42.13s | 48.46s | 6.33s | black（无画面） |
| 8 | 50.83s | 52.17s | 1.33s | black（无画面） |
| 9 | 50.56s | 50.83s | 0.27s | freeze∧silence（两路都无信息） |
| 10 | 0.00s | 52.21s | 52.21s | 语音保护：4 段语音区间已锁定，切除量 13.52s → 11.57s（恢复 1.95s） |

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

> 规则：黑场切；冻帧且静音切；仅冻帧或仅静音保留（避免误切口播与动作镜头）；切点吸附最近镜头边界；短于 1.2s 的碎片并入切除；切除超过 60% 时放弃自动切除。

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
node Tool\edit\vfactory.mjs "Workspace\assets\realspeech\sintel-trailer.mp4" --out out --title "..."
```

每步 ffmpeg 命令见 `runlog.jsonl`。