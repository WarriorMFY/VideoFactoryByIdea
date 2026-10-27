# 剪辑工厂交付报告

| 项 | 值 |
| --- | --- |
| 源文件 | `source.mp4` (7.8 MB, mov,mp4,m4a,3gp,3g2,mj2) |
| 源时长 | 0:17.0 (17.00s) |
| 源规格 | 1920x1080 h264 @ 60/1 / aac 48000Hz 2ch |
| 成片时长 | 9.63s（切除 7.00s / 41.2%） |
| 成片规格 | 1280x720 30fps H.264 High + AAC 192k(loudnorm -16 LUFS) |
| 转场 | xfade(fade,0.4s) |

## 输入信号（自动探测）

- 黑场 3 段，冻帧 3 段，静音 1 段，场景切点 4 个

## 剪辑决策（2 个保留段）

| # | 入点 | 出点 | 时长 | 信号标记 |
| --- | --- | --- | --- | --- |
| 1 | 0:03.0 (3.00s) | 0:06.5 (6.50s) | 3.50s | silence |
| 2 | 0:08.5 (8.50s) | 0:15.0 (15.00s) | 6.50s | silence |

## 切除段

| # | 入点 | 出点 | 时长 | 原因 |
| --- | --- | --- | --- | --- |
| 1 | 0.00s | 3.00s | 3.00s | black（无画面） |
| 2 | 6.50s | 8.50s | 2.00s | black（无画面） |
| 3 | 15.00s | 16.98s | 1.98s | black（无画面） |

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
node Tool\edit\vfactory.mjs "D:\Data\DeepseekHarness\IdeaDrivenLoop\VideoFactory\History\bench\real\source.mp4" --out out --title "..."
```

每步 ffmpeg 命令见 `runlog.jsonl`。