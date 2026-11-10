# sample_exec_ep — 冒烟样例（合成素材，3 秒链）

> 目的：证明"包内、脱离源仓库"能跑通主链，且产出能对照数字。素材为合成（PD/CC0），不代表真实观感。

## 规格表

| 项 | 值 |
|---|---|
| 链 | u01 → u02（`Material/样例题材/处决镜头/`） |
| 分辨率 / 帧率 | 1920×1080 @ 60fps |
| 单位时长 | u01 1.400s ｜ u02 1.600s |
| 拼接后 | **3.000s**（`exec_stitch --check` 要求差 ≤0.1s） |
| BGM | `demo_beat_120bpm.m4a`（120BPM 节拍轨，30s） |
| 混流后 | 3.000s（`bgm_mix`，视频流 copy） |

## 复现命令（在本包根目录）

```bash
node Tool/ops/exec_seamlib.mjs Material/样例题材/处决镜头 --out out/seam_lib
node Tool/ops/exec_stitch.mjs out/smoke.mp4 --units u01,u02 --dir Material/样例题材/处决镜头 --check
node Tool/audio/bgm_mix.mjs out/smoke.mp4 Prototype/sample_exec_ep/demo_beat_120bpm.m4a out/smoke_bgm.mp4
node Tool/check/material_layout.mjs
```

## 基准（跑完对这三条）

1. `exec_seamlib` 出 2 张单帧 ×2 + `grid_open.png` / `grid_tail.png`；
2. `exec_stitch` 打印 `差 0.000s`，退出码 0；
3. `bgm_mix` 打印 `混后 3.000s`，且 `node Tool/check/material_layout.mjs` 无 F 级错误。

## 视觉基准

`seam_lib/grid_tail.png` 与 `grid_open.png` 应与本目录的 `baseline_grid_tail.png` / `baseline_grid_open.png` 一致：格 1 = u01 暗绿、格 2 = u02 暖橙，两格一图。颜色或顺序不对，说明抽帧或排序错了。

## 明说不覆盖的

- 速度语法（`recam`）不在冒烟里：合成画面无"重量"，验观感无意义；机制由 `Skills/exec-speed-grammar` 的配方与四查保证。
- 采集 / 投稿 / 反馈三步需要真实账号，冒烟不覆盖，见 `Tool/ops/ops.md`。
