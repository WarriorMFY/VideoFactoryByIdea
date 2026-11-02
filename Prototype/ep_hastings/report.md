# 剪辑工厂交付报告

| 项 | 值 |
| --- | --- |
| 源文件 | `talk_720p.mp4` (372.2 MB, mov,mp4,m4a,3gp,3g2,mj2) |
| 源时长 | 16:24.2 (984.25s) |
| 源规格 | 1280x720 h264 @ 24000/1001 / aac 48000Hz 2ch |
| 成片时长 | 981.83s（切除 1.75s / 0.2%） |
| 成片规格 | 1280x720 30fps H.264 High + AAC 192k(loudnorm -16 LUFS) |
| 转场 | xfade(fade,0.4s) |

## 输入信号（自动探测）

- 黑场 2 段，冻帧 109 段，静音 10 段，场景切点 4 个

## 剪辑决策（3 个保留段）

| # | 入点 | 出点 | 时长 | 信号标记 |
| --- | --- | --- | --- | --- |
| 1 | 0:00.0 (0.00s) | 0:03.1 (3.13s) | 3.13s | 正常 |
| 2 | 0:03.6 (3.64s) | 0:14.6 (14.58s) | 10.94s | speech(已保护),freeze,silence |
| 3 | 0:15.0 (14.95s) | 16:23.4 (983.38s) | 968.43s | speech(已保护),freeze,silence |

## 切除段

| # | 入点 | 出点 | 时长 | 原因 |
| --- | --- | --- | --- | --- |
| 1 | 3.13s | 3.64s | 0.51s | black（无画面） |
| 2 | 983.38s | 984.22s | 0.84s | black（无画面） |
| 3 | 14.58s | 14.95s | 0.37s | freeze∧silence（两路都无信息） |
| 4 | 37.23s | 37.94s | 0.71s | freeze∧silence（两路都无信息） |
| 5 | 647.13s | 647.78s | 0.64s | freeze∧silence（两路都无信息） |
| 6 | 0.00s | 984.25s | 984.25s | 语音保护：27 段语音区间已锁定，切除量 3.11s → 1.75s（恢复 1.36s） |

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
node Tool\edit\vfactory.mjs "Workspace/tmp/ted_hastings/talk_720p.mp4" --out out --title "..."
```

每步 ffmpeg 命令见 `runlog.jsonl`。