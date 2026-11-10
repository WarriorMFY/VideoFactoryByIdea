# ExecFactory — 处决卡点剪辑 → B 站发布

> 从 B 站 BV 号到一条已发布的卡点处决稿件：抽单位 → 选链 → 速度语法 → 拼片 + BGM → 封面文案 → 投稿 → 反馈读数。
> 这是从 VideoFactory 仓库里跑通的链路迁出的独立包（来源见 `History/capability/capability.md`）。

## 30 秒上手

```bash
# 1. 装依赖（ffmpeg 静态二进制 + playwright，落 Workspace/deps，约 100MB，需联网）
node Tool/setup/bootstrap_ffmpeg.mjs
node Tool/setup/bootstrap_playwright.mjs

# 2. 自检：素材库模板 + 第三方模块在位
node Tool/check/material_layout.mjs

# 3. 冒烟：样例题材两个合成单位 → 拼片 → 混 BGM（约 10 秒出片）
node Tool/ops/exec_stitch.mjs out/smoke.mp4 --units u01,u02 --dir Material/样例题材/处决镜头 --check
node Tool/audio/bgm_mix.mjs out/smoke.mp4 Prototype/sample_exec_ep/demo_beat_120bpm.m4a out/smoke_bgm.mp4
```

冒烟基准（数字要落在这个范围，见 `Prototype/sample_exec_ep/sample_exec_ep.md`）：
u01 1.400s + u02 1.600s → 成片 **3.000s**，混 BGM 后仍 3.000s。

## 主链七步（最短路径）

| # | 步骤 | 命令 |
|---|---|---|
| 1 | 采源片（1080p60） | `node Tool/ops/dl_bili_hd.mjs BV1xxx Workspace/run/src.mp4 116` |
| 2 | 切处决单位入库 | `node Tool/ops/exec_extract.mjs export <catalog.json> Material/<题材>/处决镜头` |
| 3 | 选链（尾手帧库） | `node Tool/ops/exec_seamlib.mjs Material/<题材>/处决镜头 --units u03,u38` → 目验 `grid_tail.png` / `grid_open.png` |
| 4 | 速度语法 | `node Tool/ops/recam.mjs <src.mp4> <cfg.json> <out.mp4>`（配方见 `Skills/exec-speed-grammar/`） |
| 5 | 拼片 + BGM | `node Tool/ops/exec_stitch.mjs <out.mp4> --units u03,u38 --check` → `bgm_fit` 选曲 → `bgm_mix` 混流 |
| 6 | 封面 + 文案 | `node Tool/ops/make_cover.mjs --video <成片> --out cover.jpg` |
| 7 | 投稿 + 反馈 | `node Tool/ops/publish_bilibili.mjs publish ...` → `collect_feedback.mjs` / `collect_creator_stats.mjs` |

每步的判据与坑位在 `Skills/` 三个技能里；工具细节在各目录的 `.md`。

## 目录导览

| 目录 | 是什么 |
|---|---|
| `Tool/` | 唯一代码目录（ops 12 个 / audio 3 / lib 4 / check 1 / setup 2） |
| `Skills/` | 三个作业指导书：exec-extract（切单位）/ exec-seam-stitch（选链拼接）/ exec-speed-grammar（变速） |
| `Material/` | 素材库模板（注册表 + 六册规范）+ **样例题材**（2 个合成单位，PD/CC0） |
| `Prototype/sample_exec_ep/` | 冒烟样例：规格表 + 复现命令 + 基准数字 |
| `History/` | 能力来源档案 + 循环日志模板 + 运行回执（自动生成） |
| `Workspace/` | 依赖 / 缓存 / 登录态（可随时删，bootstrap 重建） |

## 边界（先说清不做什么）

- **不做内容判断**：选哪几刀、封面文案怎么定，是人决定；本包只负责把决定执行到位并给出可复核的数字。
- **不碰登录**：`publish_bilibili.mjs login` 必须账号主本人扫码；脚本不填密码、不碰验证码、不刷互动。
- **授权**：成片发布前按 `Material/docs/授权与可发布.md` 核对 `license_class`；源片是外部版权时只能研究/评论引用，不可直接商用。
- **平台**：发布链路按 B 站网页端实现（2026-11 实测），接口改版时会失效，修法见 `Tool/ops/ops.md`。
