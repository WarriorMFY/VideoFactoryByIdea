# Tool/ — 机器（能执行的代码）

> 一条链 12 个入口、4 个库。先看"最短路径"，需要细节再钻各目录的同名 `.md`。

## 最短路径五条（复制即用）

```bash
# 装依赖
node Tool/setup/bootstrap_ffmpeg.mjs && node Tool/setup/bootstrap_playwright.mjs

# 采片（1080p60；采集号要设 BILI_PROFILE）
BILI_PROFILE=Workspace/run/bili_profile_<采集号> node Tool/ops/dl_bili_hd.mjs BV1xxx Workspace/run/src.mp4 116

# 切片入库 + 合规自检
node Tool/ops/exec_extract.mjs export <catalog.json> "Material/<题材>/处决镜头"
node Tool/check/material_layout.mjs

# 选链 → 变速 → 拼片
node Tool/ops/exec_seamlib.mjs "Material/<题材>/处决镜头" --units u03,u38
node Tool/ops/recam.mjs src.mp4 cfg/u03.json out_u03.mp4
node Tool/ops/exec_stitch.mjs out/ep.mp4 --units u03,u38 --check

# BGM → 混流
node Tool/audio/bgm_fit.mjs --music x.mp3 --hits 1.8,5.5 --dur 52.5 --mix out/ep.mp4 out/ep_bgm.mp4
```

## 目录

| 目录 | 职责 | 入口 |
|---|---|---|
| `ops/` | 采集 / 抽取 / 变速渲染 / 拼片 / 封面 / 投稿 / 反馈 | 12 个脚本，见 [ops.md](ops/ops.md) |
| `audio/` | BGM 选型与混流 | `bgm_fit` / `bgm_scan` / `bgm_mix` |
| `lib/` | 共用层：子进程封装、登录态、CSV、授权判定 | 见 [lib.md](lib/lib.md) |
| `check/` | 素材库模板校验 | `material_layout` |
| `setup/` | 依赖 bootstrap | 见 [setup.md](setup/setup.md) |

## 落位规则

新脚本先问三句：只服务一个域 → 进那个域目录；服务多个域 → 按行为归档（只读检查进 `check/`，公共代码进 `lib/`）；两句都归不进去 → 先建目录（连同名 `.md`）再放，不许塞进最泛的那个。
