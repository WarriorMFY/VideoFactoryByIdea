# 探测记录：这台机器能不能直接用「现成视频剪辑软件」

时间：2026-10-27 15:35　脚本：`History/probe/software_probe.mjs`（可复跑）
目的：回答"为什么不直接用现成软件，而是自己写脚本"，用实测而不是印象。

## 1. 官方下载页可达（网页层）

| 站点 | 结果 |
| --- | --- |
| CapCut 国际版 / 剪映国内版 | 200（0.02 / 0.42 MB/s） |
| DaVinci Resolve（Blackmagic） | 200 |
| Shotcut / Kdenlive / OpenShot | 200 |
| VLC / HandBrake / OBS | 200 |
| auto-editor（PyPI 索引页） | 200 |

网页能开，说明"找得到软件"。

## 2. 真正的安装/二进制渠道（可下载层）

| 目标 | 结果 |
| --- | --- |
| VLC 直接安装包 | **HTTP 500** |
| Shotcut releases（GitHub release 资产） | **超时** |
| LosslessCut（GitHub releases） | **超时** |
| SourceForge openshot 最新版 | **404** |
| `winget search vlc` | **失败**（exit -1978335231，走不通应用商店通道） |
| auto-editor `pip install` | 早前实测 **超时**（Python 侧出网受堵） |

## 3. 安装权限（比下载更硬的约束）

| 位置 | 是否可写 |
| --- | --- |
| 工作区 `VideoFactory\` | ✅ |
| `C:\Program Files` | ❌ Access denied |
| `%LOCALAPPDATA%` / `%APPDATA%` | ❌ Access denied |
| `%TEMP%\dsh-*`（沙箱临时目录） | ✅ |

结论：**本会话跑在 `workspace-write` 文件沙箱里，只能写工作区**。任何"装到系统里的软件"（剪映/Resolve/Shotcut/VLC）在本会话中都装不上；而且我是无人值守的 CLI，没有点击 GUI 的能力。

## 4. 因此这轮的取舍

- **复用了现成引擎**：FFmpeg（含 libx264/libass/fontconfig）、Vosk（离线 ASR）、Edge TTS（造素材）、MyMemory（翻译）。编解码、滤镜、字幕渲染、语音识别都不是自己写的。
- **自己写的只有三件事**：剪辑决策规则（黑场/冻帧/静音 ∧ 判定、切点吸附）、字幕时间轴重映射、以及可复现的验收脚本。这三件恰好是 GUI 给不了"可跑、可重复、可批量"的部分。
- **代价如实说**：创意性工作（转场设计、节奏、音乐、审美取舍）脚本不如人用 NLE。

## 5. 现成方案的真实定位

| 类别 | 代表 | 能不能"内部自动完成并交付" |
| --- | --- | --- |
| GUI 剪辑软件 | 剪映、CapCut、Resolve、Shotcut、Kdenlive | ❌ 需要人操作；本会话装不上也点不了 |
| CLI 自动剪辑 | auto-editor（PyPI）、LosslessCut、MLT/melt | ⚠️ 方向对，但装不上（pip/GitHub 均不通）；且只做"静音自动切"，无字幕、无验收数据 |
| SaaS / 云端 | Descript、Opus Clip、剪映云 | ❌ 需账号/上传/付费，素材出境 |
| FFmpeg 自建流水线（本轮） | `Tool/vfactory.mjs` + 字幕链路 | ✅ 无人值守、可批量、结果可量化验收 |
