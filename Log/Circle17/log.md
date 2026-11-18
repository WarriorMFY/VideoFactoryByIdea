# Circle17 · 详细日志

> 本文件记全文；`Circle.md` 只留摘要。结轮时按 AGENTS 纪律对 `Circle.md` 再压一次，本文件不动。

## 一、本轮范围

用户 22:01 下达：「新建循环，往后加，其他先不动，把这轮对话内容按规则记录进去」。
即：新开轮次、只记录本次会话内容，不改仓库其他任何文件。

编号说明：`Circle16` 已存在（2026-11-18 21:07 由另一会话建立，主题是装 FFmpeg 与 B 站视频抽帧），
故本轮取 **Circle17**。当前两轮均未结束：`Circle15`（20:05 起，待办 1 进行中）、`Circle16`（21:07 起）。

纠错记录：本轮建轮时先误把日志写进 `Log/Circle16/log.md`，发现 `Circle16` 属他人后，已把内容整体迁至本目录，
并删除误放的那份，`Circle16/` 只保留它自己的 `Circle.md`。

## 二、会话内容时间线（本轮对话）

### 2.1 项目目录盘点（对话开头）

- 复核仓库结构：`Skill/`（技能库，只读）、`Tool/`（工具）、`RAG/`（入库卡）、`Doc/`（公开资料）、`Log/`（循环）、`Workspace/`（草稿）。
- 统计：`Log/Circle1–15`；RAG 已入库 8 卡（actions 2、派生镜头 1、styles 1、portraits 主副 2、stylings 1）。
- Circle14 已结：实扣 165.75，余额 19002.5，7 条任务，结论为「段结构/事件链/首帧锚定易对齐，帧号/秒数/切点/道具身份不易对齐」。
- 发现四处缺口：
  1. `Log/README.md` **不存在**，但 `AGENTS.md` 第 15 行与 `Log/Circle12/log.md` 多处引用它；
  2. `ffmpeg` / `ffprobe` 未安装（当时 `Get-Command` 为空、`winget` 亦不可用）；
  3. 本机无 `git` 命令（`.git` 内最后一次提交来自 `Qoder Agent`）；
  4. `Doc/驾驭工程/驾驭的艺术-随机与确定共舞.md` 为 0 字节空文件。

### 2.2 剪辑技术的能力与边界（用户问：剪辑能干什么、边界在哪）

按「渐进式披露」分四层回答，核心结论：

| 层 | 结论 |
| --- | --- |
| 本质 | 大模型是「厨子」，剪辑是「摆盘 + 切配」：生成不可复现，剪辑不能创作 |
| 常用 6 件事 | 抽帧、切点重剪、拼接、裁边/改画幅、配音混音、字幕 |
| 进阶 | 变速、调色、降噪、稳定、蒙版、画中画、抠像、转场、插帧超分、批量脚本化 |
| 五条硬边界 | ① 剪辑是减法+重排不是加法；② 结构性错误修不掉；③ 帧精确必须重编码；④ 拼接要求编码参数一致；⑤ 画质不能凭空提升 |

实时事实核对：本机 `ffmpeg`/`ffprobe`/`magick`/`vlc` 全部缺失；Python 侧有 OpenCV 5.0.0、Pillow 13.0.0、numpy 2.5.4（在 `Tool/_deps`）。
外部版本核对：FFmpeg 当时最新稳定版为 9.0.2 "Lei"（2026-09-18 发布）。

### 2.3 抠图原理与 GrabCut 演示（用户给一张蜘蛛侠图）

先纠概念三分：**裁剪（crop）≠ 抠图（matting）≠ 分割（segmentation）**，链路是「分割 → 蒙版 → 合成」。

用 OpenCV 在本机真跑了五版 GrabCut，每版的失败都成了教学点：

| 版本 | 做法 | 结果 | 失败原因 |
| --- | --- | --- | --- |
| v1 | 矩形 + 8 次迭代 + 最大连通块 + 羽化 5px | 主体干净 | 矩形没盖到底边，腿被截掉约 90px |
| v2 | 加二次精修（结果当蒙版种子重跑） | 腿补回来了，但飞机/建筑被并入 | 二次 pass 把矩形内背景算成 probable FG |
| v3 | 扩画布（`BORDER_REPLICATE`）+ 颜色线索（S>45 或 V<70）过滤 | 建筑被削，但白飞机半透明残留 | 白/灰背景低饱和但亮度高，颜色线索不成立 |
| v4 | 异色底板扩边（品红） | 背景残片与主体连成一块，框被撑大 | 扩边方式与矩形范围互相打架 |
| v5（最终） | **分区抠**：上半身一个矩形、腿部单独一个矩形，再并集 + 最大连通块 + 羽化 7px | 990×695，腿完整、边缘干净，右下角仍带进一小块白飞机 | 传统方法的天花板 |

同区域（手指）放大 3× 对比：GrabCut 在指缝留下整块白色残留，边缘是硬边；这正是"传统方法可解释但脆弱"的证据。

边界五条（已落文 `Skill/image-matte/reference/limits.md`）：半透明不可解、毛发需软蒙版、同色无边、
贴边必截、多主体只给显著主体；另加四条易忽略失真：背景色渗透、阴影默认丢失、细道具缺块、小主体分辨率糊。

### 2.4 Skill + Tool 落地（用户指令：Skill 下新建技能、Tool 下装工业级工具、ffmpeg 先不装）

**环境事实（实测）**

- PyPI：`pypi.org` 首次 15s 超时，重试 200；清华镜像与阿里镜像稳定 200 → 统一用 `https://pypi.tuna.tsinghua.edu.cn/simple`。
- **GitHub releases 直连不通**：rembg 内置下载卡在 0MB 超过 3 分钟，无任何进度输出。
- **hf-mirror 通**：`https://hf-mirror.com/tomjackson2023/rembg/resolve/main/<name>.onnx`，实测 1.83–3.93MB/s。

**安装**

```bash
python -m pip install --target Tool/_deps_matte --upgrade -i <清华镜像> rembg onnxruntime
# 落到 rembg 2.0.87 / onnxruntime 1.32.0 / numpy 2.5.5 / pillow 13.0.0 / pymatting 1.1.16 / scikit-image 0.26.0 等
```

模型（`Tool/matte_models.py` 走 hf-mirror）：

| 模型 | 体积 | 状态 |
| --- | --- | --- |
| `u2net.onnx` | 167.8MB | 已下 |
| `isnet-general-use.onnx` | 170.3MB | 已下 |

**实测（同一张 1564×758，CPU）**

| 方法 | 载入 | 单张推理 | 前景占比 | 评价 |
| --- | --- | --- | --- | --- |
| GrabCut v5 | — | 10–20s | 31.2% | 指缝白残留、硬边、带进白飞机 |
| `u2net` | 1.3s | 1.13s | 27.5% | 干净，边略软 |
| `isnet-general-use` | 1.0s | 1.9s | 27.5% | 最干净，指尖轮廓最贴原图 |

批量验证：2 张（1557×229、880×1184）合计 7.0s，单张 2.0–2.5s；竖构图人像前景 83.4%，耳与发际线完整。

**产物**

| 路径 | 内容 |
| --- | --- |
| `Skill/image-matte/SKILL.md` | 36 行（Meta 上限 40），触发/不触发、一条命令、三条通过线、资产表 |
| `Skill/image-matte/reference/models.md` | 七类模型对照 + 实测 + 下载方式 + alpha matting 用法 |
| `Skill/image-matte/reference/limits.md` | 五类硬边界、四条易忽略失真、判断顺序 |
| `Skill/image-matte/scripts/run.py` | 启动器，定位仓库根并透传 `Tool/matte.py` |
| `Tool/matte.py` | CLI：批量、`--model`、`--alpha`、`--crop`、`--bg`、`--json`、`--suffix` |
| `Tool/matte_models.py` | 模型下载器：`list` / `fetch <name>` / `fetch all` |
| `Tool/README.md` | 补 `matte.py`、`matte_models.py` 两行 + `_deps_matte` 重建说明 |
| `.gitignore` | 增 `Tool/_deps_matte/` |

**踩坑修正**

1. `cv2 5.0.0` 无 `cv2.HSV` 常量，须写 `cv2.COLOR_BGR2HSV`。
2. `-o` 指向不存在且无后缀的路径时，原实现按文件处理 → 改为「无后缀/已存在目录/多图」一律当目录。
3. 依赖必须放 `Tool/_deps_matte` 并用 `sys.path` 注入 + `U2NET_HOME` 指向项目内 `models/`，否则系统 Python 与用户目录都会被污染。

### 2.5 与并行会话的岔口

- 21:25 起 `Tool/` 出现 `ffmpeg.py`（FFmpeg 9.0.2 静态二进制入口）、`setup_deps.py` 增 FFmpeg、`README.md` 被改写、`_deps` 内落二进制。
  该动作**非本轮所为**；本轮按用户「ffmpeg 先不装」未做任何 ffmpeg 相关操作。
- 21:44 起 `Log/Circle15/Circle.md` 被改写（新增 21:31 分镜级重绘、21:33 段边界、21:45 节点探测推翻旧判断），并有 `plan-shot-repaint.md`、`i2v-anchor/`、`_diag-smoke-strip.png`。
- 21:07 另一会话另开 `Circle16`（FFmpeg 安装 + B 站盾牌抽帧）。
- 抠图这一支线当时先写进 `Log/Circle15/log-image-matte.md`（因 Circle15 当时仍开着），该文件**归属上一轮、本轮不移动不改写**，与本文件内容重叠。

## 三、规则偏离（需用户裁定）

`Skill/Meta/README.md` 规则 5 要求「技能内部文件只能引用当前技能树下的文件」。
但工具按用户指令装在 `Tool/`，故 `SKILL.md` 与 `reference/models.md` 内含指向 `Tool/matte.py`、
`Tool/matte_models.py` 的路径。两条出路：接受例外，或把实现搬进 `Skill/image-matte/scripts/`、`Tool/` 只留启动器。

## 四、本轮未做的事

- 未安装 ffmpeg（用户明确「先不装」；它在 21:25 已被另一会话装上）。
- 未改 `Circle15`、`Circle16` 任何文件（除建轮时误放后已撤除的那份日志）。
- 未改 `Log/README.md`（仍缺失）、未改 `AGENTS.md`、未动 `Doc/`。
- 未提交 git（本轮未结轮；且本机仍无 `git` 命令）。
- 未跑「抠图 → 换背景 → 合成」样例，未拉 `isnet-anime` / `u2net_human_seg`，未实测 `--alpha` 软边。

## 五、追加：像素锚点四件套（22:10–22:35）

用户补充了任务背景：抠图是为了给"大模型生视频"采集**像素锚点**，即项目所说的"像素提示词"，用于压缩模型脑补空间；
并明确"没有尾帧位这个结论不用信，后面肯定有"，随后授权"按你计划执行"。

按优先级 ①锚点合成 → ②多主体掩码 → ③对齐度量 → ④时序锚 逐项落地：

| 步 | 做法 | 结果 |
| --- | --- | --- |
| ① 锚点合成 | 文生图生成夜雨空街背景板（2047×1152），把机甲 RGBA 贴入；做接触阴影、湿地倒影、亮度/色偏对齐、边光、雾气、颗粒 | `mask_iou` 0.966；`halo_ratio` 首版 1.445（可见白边）→ alpha 内缩 2px + 边光降到 0.08 后 **1.074**，通过 |
| ② 多主体掩码 | 按 0–1 比例框选，一图一次抠出多个 RGBA + 联络表 | 机甲 55.1% 干净；防暴警 10.0% 有人影残影；**街灯 0.3% 失败**（细杆结构无显著度） |
| ③ 对齐度量 | `mask_iou` / `edge_iou` / `ssim` / `orb_match_rate` / `halo_ratio` 五项 | 空白板对照：`mask_iou` 0.0；量具能区分"有锚点/无锚点" |
| ④ 时序锚 | ffmpeg 从首帧渲染 4s 推镜（120 帧），切镜头 + 首尾帧配对 + Farneback 光流 | 单镜头；光流均值 5.88px、p95 25.35px、主方向 147° |

**关键教训**

1. **尺子必须和合成用同一套坐标。** 首版 `score.py` 没复刻合成的横向裁剪，整体错位约 40px，`edge_iou` 从 0.26 掉到 0.04、`halo_ratio` 从 1.445 误报成 1.024。**度量错位比没有度量更危险。**
2. **`halo_ratio` 是有效的"说不清哪里怪"检测器。** 1.445 → 1.074 的差别肉眼确实看得出来，量表先于眼睛发现。
3. **`edge_iou` 单指标不能定生死**：alpha 内缩换来干净边缘，轮廓会小 1–2px，边缘比对天然吃亏。
4. **框选式多主体在剪影图上有显著度偏见**：大而方的机械稳，人形勉强，细杆直接丢。
5. ffmpeg `zoompan` 必须对单帧输入用 `d=帧数`，配 `-loop 1` + `d=1` 会导致每帧重新起算、画面完全不动（表现为光流 0）。

**产物**

- `Tool/anchor.py`（compose / masks / score / pair 四个子命令，参数全部 0–1 比例）
- `Skill/pixel-anchor/`（`SKILL.md` + `reference/anchors.md` + `reference/measured.md`）
- 演示与交付：`Workspace/matte_demo/mecha/交付/`（锚点首帧、首尾帧对、多主体锚点、推镜样例、机甲透明底三件）

**未做**：色彩锚（主色板/材质提取）、SAM 点选式分割、CLIP/DINO 语义距离（当前用 ORB 近似）、尾帧位接入（通道未开）。

## 六、用锚点生成 5 秒成片（22:36–22:46）

用户："用这些像素锚点，你自由发挥，生成一个 5s 分镜我看看"。

按 `doubao-creative-video` 合同执行，先读：`SKILL.md`、`references/interaction-ask-video-clarification-ref.md`、
`references/general-creative-video.md`（归入"单图/物体动态片"）、`references/asset-generation.md`（五段式 Prompt 合同）。

**输入准备**：把 `交付\锚点首帧.png`、`交付\重型机甲-透明底.png` 上传得两个真实句柄
（`https://aka.doubaocdn.com/s/JlrLsRhvwJ`、`https://aka.doubaocdn.com/s/X3CDI6ftJf`），
职责写明：前者作 0 秒首帧锁构图/机位/光色，后者作主体参考锁轮廓与部件结构。

**确认**：按合同展示「视频生成参数确认」→ 模型 seedance 2.0 fast、5 秒、16:9、1 条，随后调用 `interaction.ask`。
用户以聊天「好」「执行」答复而非点选按钮；第一次回复后按合同要求再确认一次，收到「执行」后开始生成。
**如实记录：本轮生成授权来自用户明确的文字指令，不是按钮回执。**

**Prompt（五段式，完整原文已随执行记录留档）**：

1. 输入资产定位与 0 秒基准：`<图片1>` 首帧全量采用；`<图片2>` 只采用轮廓/结构/固有色，剥离透明背景、原背景、防暴警与水印。
2. 主体绑定与生成目标：同一机甲、同一街道的静止轻动态，不位移不换装不新增元素，冷青灰雾调、低机位广角微仰。
3. 逐时段：0–1.2s 雨斜落、雾横流、积水涟漪；1.2–2.6s 炮塔左转 3 度、炮管下沉 2 度停住 + 红灯首次明灭；2.6–4.0s 极缓推近约 3% 画幅、贴地雾升起遮住脚部；4.0–5.0s 红灯常亮、雾右移、雨势略缓。声音：雨声 + 城市底噪 + 液压泄压/金属就位 + 低频风鸣，无人声无字幕。
4. 尾态收束：单镜到底不切，停在炮管到位、灯常亮、雾仍流动。
5. 一致性与禁区：不改轮廓与部件数、炮管不大幅摆动不发射、不新增人物车辆火光、无文字水印字幕、雾雨连续、不出画幅。

**结果**：`seedance_2.0_fast` 一次成功，5 秒 / 1280×720 / mp4 → `https://aka.doubaocdn.com/s/Bj4VH4hUUK`，已用 RichMediaCard 即时交付。
无失败、无重试。用户未提出修改。

**可复用的判断**：这类"首帧 + 主体透明底"的双参考组合，是当前通道里性价比最高的锚点形态——
首帧负责构图与光色，透明底负责身份，二者用 `score` 的 `mask_iou` 与 `halo_ratio` 即可验收。

## 七、收尾（22:48）

- `Circle.md` 已压成摘要（一句话 + 易/难对齐清单 + 待优化 + 产物 + 遗留），细节全部留在本文件。
- git 可用性：本轮开头记录"本机无 git"已不成立——收尾时 `git --version` 返回 2.33.0（PATH 已变）。
- 提交策略：只提交本循环路径（`Log/Circle17/`、`Skill/image-matte/`、`Skill/pixel-anchor/`、`Tool/matte.py`、`Tool/matte_models.py`、`Tool/anchor.py`、`.gitignore` 中 `Tool/_deps_matte/` 那一行）。
  其他会话的在途改动（`AGENTS.md`、`Skill/card-experiment-chain-v2/reference/channels.md`、`Tool/README.md`、`Tool/setup_deps.py`、`Skill/FetchVideoFrame/`、`Log/Circle16/`、`Log/Circle15/`）**一律未纳入**，避免把别人的半成品一起提交。
- 结束时间：2026-11-18 22:48。
