# 剪辑工厂交付报告

| 项 | 值 |
| --- | --- |
| 源文件 | `source_long.mp4` (1419.8 MB, mov,mp4,m4a,3gp,3g2,mj2) |
| 源时长 | 49:00.0 (2940.04s) |
| 源规格 | 1280x534 h264 @ 24/1 / mp3 44100Hz 2ch |
| 成片时长 | 2924.30s（切除 14.30s / 0.5%） |
| 成片规格 | 640x360 30fps H.264 High + AAC 192k(loudnorm -16 LUFS) |
| 转场 | xfade(fade,0.4s) |

## 输入信号（自动探测）

- 黑场 0 段，冻帧 46 段，静音 9 段，场景切点 620 个

## 剪辑决策（5 个保留段）

| # | 入点 | 出点 | 时长 | 信号标记 |
| --- | --- | --- | --- | --- |
| 1 | 0:01.1 (1.06s) | 12:11.9 (731.92s) | 730.86s | speech(已保护),freeze,silence |
| 2 | 12:15.2 (735.23s) | 24:26.1 (1466.08s) | 730.86s | speech(已保护),freeze,silence |
| 3 | 24:29.4 (1469.39s) | 36:40.3 (2200.25s) | 730.86s | speech(已保护),freeze,silence |
| 4 | 36:43.6 (2203.56s) | 48:54.4 (2934.42s) | 730.86s | speech(已保护),freeze,silence |
| 5 | 48:57.7 (2937.73s) | 49:00.0 (2940.04s) | 2.31s | freeze |

## 切除段

| # | 入点 | 出点 | 时长 | 原因 |
| --- | --- | --- | --- | --- |
| 1 | 0.00s | 1.06s | 1.06s | freeze∧silence（两路都无信息） |
| 2 | 731.92s | 735.23s | 3.31s | freeze∧silence（两路都无信息） |
| 3 | 1466.08s | 1469.39s | 3.31s | freeze∧silence（两路都无信息） |
| 4 | 2200.25s | 2203.56s | 3.31s | freeze∧silence（两路都无信息） |
| 5 | 2934.42s | 2937.73s | 3.31s | freeze∧silence（两路都无信息） |
| 6 | 0.00s | 2940.04s | 2940.04s | 语音保护：217 段语音区间已锁定，切除量 14.30s → 14.30s（恢复 0.00s） |

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
node Tool\edit\vfactory.mjs "D:\Data\DeepseekHarness\IdeaDrivenLoop\VideoFactory\Workspace\assets\longbench\source_long.mp4" --out out --title "..."
```

每步 ffmpeg 命令见 `runlog.jsonl`。