# Circle15 · 抠图单元（image-matte）详细日志

> 本文只记本轮「抠图技能 + 工业级自动抠图工具」这一支线。Circle15 主线的分镜重绘见 `Circle.md` / `plan-shot-repaint.md`。
> 未合并进 `Circle.md` 的原因：21:44 起 `Circle.md` 由另一会话持续改写，避免并发覆盖。

## 一、用户指令

1. 在 `Skill/` 下新建技能「抠图」。
2. 在 `Tool/` 下装工业级自动抠图工具。
3. **ffmpeg 先不装**。

## 二、实际落点

| 位置 | 内容 |
| --- | --- |
| `Skill/image-matte/` | `SKILL.md`（触发/不触发、一条命令、三条通过线）＋ `reference/models.md`、`reference/limits.md` ＋ `scripts/run.py`（启动器透传 `Tool/matte.py`） |
| `Tool/matte.py` | 抠图 CLI：单图/目录批量、`--model`、`--alpha`、`--crop`、`--bg`、`--json` |
| `Tool/matte_models.py` | 模型权重下载（hf-mirror，GitHub 直连不通） |
| `Tool/_deps_matte/` | rembg 2.0.87 + onnxruntime 1.32（pip `--target`，不污染系统 Python）＋ 模型 2 个 |
| `.gitignore` | 增 `Tool/_deps_matte/`（依赖与模型不入库） |
| `Tool/README.md` | 增两行工具索引 + `_deps_matte` 重建说明 |

## 三、环境事实（22:00 前后实测）

- PyPI 直连时通时断，**统一走清华镜像** `https://pypi.tuna.tsinghua.edu.cn/simple`。
- **GitHub releases 直连不通**：rembg 内置下载卡在 0MB 达 3 分钟以上，无输出。
- **hf-mirror 通**：`https://hf-mirror.com/tomjackson2023/rembg/resolve/main/<name>.onnx`，实测 1.8–3.9MB/s。
- 已落地模型：`u2net.onnx` 167.8MB、`isnet-general-use.onnx` 170.3MB（合计约 340MB）。

## 四、实测（同一张蜘蛛侠图 1564×758，CPU）

| 方法 | 载入 | 推理 | 前景占比 | 结论 |
| --- | --- | --- | --- | --- |
| GrabCut（手工先验 + 二次精修 + 分区） | — | 10–20s | 31.2% | 手指缝留整块白残留、硬边、把右下白飞机带进来 |
| `u2net` | 1.3s | 1.13s | 27.5% | 干净、指缝无残白、边略软 |
| `isnet-general-use` | 1.0s | 1.9s | 27.5% | 最干净，指尖轮廓最贴原图 |

- 批量：2 张（1557×229 / 880×1184）合计 7.0s，单张 2.0–2.5s。
- 竖构图人像（880×1184）抠出后耳、发际线完整，前景 83.4%。

## 五、过程中的方法教训

1. **主体贴画边必被截**：第一版 GrabCut 把腿切掉 90px，因为「画面最外圈一定是背景」。
2. **扩边选错方式会把背景连成一块**：用 `BORDER_REPLICATE` 扩底边，腿、建筑、飞机被连成同一连通域，最大连通块筛选反而帮倒忙；换异色底板 / 分区抠才干净。
3. **传统方法是可解释但脆弱**：每一个失败都要人再想一条规则补救；换一张图规则就失效。这正是"用模型档"的理由。
4. **模型档的坑在下载不在推理**：推理 1–2s，堵点全在 GitHub。

## 六、与主线的接口

- 抠出的透明底 PNG 是**剪辑端的重组素材**，不产生新内容（同 `Doc/工程管线.md` 的边界）。
- 视频逐帧抠会闪，本技能只保单帧；要进 30s 成片，需接时序模型或「静帧抠＋镜头动」。
- 主线已装 ffmpeg（21:25，非本次操作），透明素材 → 换背景 → 合成的链路已具备一半。

## 七、后续可做（未执行）

1. 补 `isnet-anime` / `u2net_human_seg` 做二次对比（各约 170MB）。
2. 加 `--alpha` 实测毛发软边（pymatting 已随 rembg 装入）。
3. 与 ffmpeg 合成一条「抠图 → 换背景 → 出片」的最小样例。
