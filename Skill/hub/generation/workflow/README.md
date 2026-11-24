# workflow · 模型接口目录

> 来源：RunningHub Model API 目录 45 类 / 234 端点（原始数据 `catalog.json`，取自本轮调研 `Log/Circle21/catalog_by_task.json`）+ 市场 93,151 条工作流采样 + Circle27 实测。
> 数据源关系：`catalog.json` = 市场任务目录（45 类/234 端点，2026-11 调研快照）；上游标准 API 全量 420 端点见 `../runninghub/data/capabilities.json`（2026-08-18 快照，本账号不可直调）——两者口径不同，不互相替代。
> 本目录只放「菜单与判据」，不放可执行代码。通道出口见同级 `runninghub/`；实验台技能在各功能子目录内（见下表）。
> ⚠️ 前提：Model API 直调本账号不可用（apiType=NORMAL → 1014）；可走通道 = 市场 AI App（webappId）/ Workflow（workflowId），标 🎯。

## 子目录

| 功能 | 目录 | 接口数 | 覆盖 |
| --- | --- | --- | --- |
| 文生图 | `text-to-image/` | 42 | t2i，含 MJ 系（悠船）；通道：`2046794551444119554`（G-2.0，~11/张，在役）；技能：`t2i-probe/` |
| 图生图 | `image-to-image/` | 35 | 编辑/重绘，最多 14 图输入（Gemini 系）；技能：`i2i-probe/`（在役）、`flux3-edit/`（同通道旧台，待退役） |
| 文生视频 | `text-to-video/` | 60 | t2v；通道：`2085304953094107137`（H3 加速版，在役）；技能：`t2v-probe/` |
| 图生视频 | `image-to-video/` | 100 | 首帧 72 / 首尾专项 / 多图参考 25；技能：`i2v-probe/`（首帧）、`wf-firstlast/`（首尾） |
| 视频生视频 | `video-to-video/` | 39 | 指令编辑 / 续写 / 动作迁移 / 转场特效 / 修复 / 多模态 / 对口型；市场 8720 条工作流；**调研态：无技能、无实测** |

## 决定性变量：架构 × 权重归属

> 架构决定能力形状，权重归属决定价格基准；两者相乘即价格。

| 象限 | 架构 | 权重 | 价格机制 | 能力形状 | 代表 |
| --- | --- | --- | --- | --- | --- |
| A | 纯扩散 DiT | 开源 | GPU 秒：图 10–50 / 视频 100–300 | 保画风强、mask/pose 强、seed 可控；语义指令弱（"中景"scale 1.00 实证） | FLUX、Qwen-Image、Wan/VACE、H3、LTX-2、SkyReels |
| B | 纯扩散 DiT | 闭源 API | 厂商定价+加价：图 50–80 / 视频 150–600 | 画风/运镜强，语义中等（多带 LLM 提示词增强） | Seedream、即梦、可灵、Seedance、海螺、Vidu、PixVerse、Sora、Runway、Veo |
| C | 原生多模态 LLM | 闭源 | token/图：图 50–75+ | 语义编辑强（景别 1.31 推近实证）、多图参考强（至 14 路）；seed 不暴露、无 mask | Gemini 3.1 Flash、Nano Banana Pro、Gemini g-2/g-3/g-4 |

价格公式：

```text
图价   ≈ 归属(开源≈10–50 | 闭源DiT≈50–80 | 闭源LLM≈50–75，旗舰更高)
视频价 ≈ 归属 × 体量 × 时长/分辨率（4K / 32B TE 最贵）
```

## 本账号可用通道（实测锚点）

> 快照 2026-11-23；活配置与完整节点表以各功能子目录 README 为准，平台级纪律见 `../runninghub/references/channels.md`。

| 功能 | 通道 | ID | 模型 | 价 |
| --- | --- | --- | --- | --- |
| 图生图 | AI App | 2114585366186516481 | FLUX（A 象限） | 20.06/次出 2 张 |
| 图生图 | Workflow | 2027204046305628162 | Gemini 3.1 Flash（C） | 1k 50.26 / 2k 75.5 |
| 图生图 | Workflow | 2103270694288183297 | Qwen-Image 2.1（A） | 推断 20–50 |
| 图生视频·首帧 | Workflow | 1922977171818598402 | Wan2.1-VACE-14B（A） | 推断 100–300 |
| 图生视频·首帧 | Workflow | 2037041277312704514 | Seedance 2.0 Fast（B） | 推断 150–400 |
| 图生视频·首尾 | Workflow | 1967630045374287873 | 首尾帧模板（Circle21 已跑通） | 未测 |
| 图生视频·多参考 | Workflow | 2092878871120142337 | MiniMax H3（A 但 32B TE 重） | 推断 200–500 |

## 命名规律

- `-official`：平台官方稳定渠道，首选；无后缀：社区/试验渠道
- `pro / ultra / 4k`：旗舰档；`fast / lite / mini / turbo`：快速档
- `rhart-*`：平台代售渠道；厂商前缀直连：`alibaba/`、`bytedance/`、`kling-*`、`vidu/`、`minimax/`、`pixverse-*`、`luma/`、`topazlabs/` 等
- 可灵多图参考官方拼写是 `refrence-to-video`（少个 e，别当拼写错误）
- 渠道解码：`rhart-image-n-*`=Nano Banana/Gemini 图；`rhart-image-g-*`=Gemini 图；`rhart-video-g-*`=Gemini/Veo；`rhart-video-s-*`=Sora；`rhart-video-r-*`=Runway；`rhart-video/sparkvideo-*`=Seedance；`rhart-image/f-dev`=FLUX dev

## 判据速查

- 选便宜 → 象限 A（FLUX / Qwen-Image / Wan）
- 选听话（镜头语言、语义编辑）→ 象限 C（Gemini 系）
- 选厂商特定运镜/生态 → 象限 B（可灵 / Seedance / Sora）
- 三者不可兼得：这是模型本体的固有边界，不是通道差异
