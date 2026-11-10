# Tool/audio/ — 音频通道

| 脚本 | 做什么 | 用法 |
|---|---|---|
| `bgm_scan.mjs` | 批量初筛：曲库 × 命中点表，出误差 CSV | `--dir <音乐目录> --hits a,b,c --dur N [--out x.csv]` |
| `bgm_fit.mjs` | 单片精算：相位搜索求最优 offset，逐 hit 报误差；可一步混流 | `--music x.mp3 --hits 1.8,5.5 --dur 52.5 [--search 2] [--mix <v> <out>]` |
| `bgm_mix.mjs` | 按 offset 混流（视频流 copy，不重编码） | `<video> <audio> <out> [--offset S] [--fade-out S] [--gain dB]` |

## 口径

- **判定以 `bgm_fit` 直跑为准**。`bgm_scan` 批量模式对无瞬态曲会误判"无差异"（实测把 Volatile Reaction 判成无瞬态），两工具冲突时信直跑。
- 卡点是"尽力而为"：命中点间距非公共拍时，±50ms 全 PASS 原理性不可达。报告里写清 PASS 数（如 5/13），不要包装成"全对齐"。
- offset 正 = 音频后移（`adelay`）；负 = 音频提前（`-ss` 起播）。
- 版权：CC BY 曲必须署名；`bgm_scan` 出来的曲目先在 `Material/docs/授权与可发布.md` 口径下核对 `license_class`。
