---
name: exec-extract
description: 从游戏实机/处决合集视频中全量抽取处决单位（触发→命中→收招→余韵完整边界），产出可入库的片段+缩略图+清单。触发词：处决抽帧、抽处决、处决入库、处决切片、extract executions。
---

# 处决抽帧（Exec Extract）技能

## 何时用

- 给定一部「处决合集 / 实机录制」源片，要把**所有**处决镜头抽出来入库（素材库/对比剪辑原料）。
- 对比剪辑（versus-edit）前的素材盘点：先知道一部片里有哪些处决、各自多长、什么类型。

## 核心依据：处决单位边界规则（loop37 调研定版）

**处决五层解剖**：触发（R3/E 提示）→ 前摇（抓取/踉跄）→ 命中（顿帧/慢放/血雾）→ 收招（跟随/喘息）→ 余韵（尸体落定/环境染色/站定）。

- **开始帧 = min(抓取/锁定发生, 处决提示出现)**，不是出手帧
- **结束帧 = min(角色回待机, 尸体物理落定, 镜头切走)**，再多留 0-0.5s 余韵；宁多勿悬（悬空尸块帧=完整性差）
- **处决内部切机位 ≠ 单位边界**（切点必须包含在段内）
- 单位长度参考：快杀 2.5-3s / 标准 4.5-5.5s / 仪式级 8-11s
- **结束帧三选一规则**在快剪集锦里退化为「以下一个切点为准」——集锦的剪辑师通常在尸体落定后才切

## 工具：Tool/ops/exec_extract.mjs

```
node Tool/ops/exec_extract.mjs scan   <src> [outDir]        # 全片动势曲线+切点 → scan.json（只做候选）
node Tool/ops/exec_extract.mjs sheets <src> [outDir] [--step 1] --grid 5x4   # 带时间码缩略图网格（人工枚举）
node Tool/ops/exec_extract.mjs strip  <src> <t0> <t1> <n> [--out x.png]      # 边界取证条带
node Tool/ops/exec_extract.mjs refine <catalog_raw.json>               # 粗估→局部动势包络收敛（仅适合稀疏处决片）
node Tool/ops/exec_extract.mjs export <catalog_final.json> [dir] [1920x1080]  # 目录可给绝对路径（loop44）
```

## 流程（按源片形态二选一）

### A. 快剪集锦（切点密集，如影零处决合集 173s/50+ 杀）——默认走此路

1. **scan**：动势曲线 + 低阈值切点（scene 0.12）→ 确认结构（动势簇极碎，只做交叉验证）
2. **sheets**（step=1）人工目验全片网格 → 枚举每个击杀瞬间的秒数/场景/敌人类型
3. **切点分段**：切点去重（0.25s 内合并）→ 相邻切点成段（≥0.9s）→ 每段 = 一个候选单位
   - 快剪集锦的剪辑师已在尸体落定后才切 → **段边界天然符合边界规则**
   - 段内再含多杀（>5s 且明显两景）才需要拆
4. **人工目验映射标签**：把网格枚举结果逐段填 scene/move/kind
5. **export** 批量出片 + catalog.csv + index.html
6. **缩略图拼板抽检**：全部 thumb 拼网格，肉眼扫一遍有无明显错段（切进尸体特写/空镜）

### B. 长镜头实机（处决稀疏、无切点辅助）

1. **sheets**（step=2~3）枚举处决大概位置 → **refine** 粗估窗口收敛边界
2. **strip** 对每个单位首尾各出一条 6 帧条带目验（开始=抓取/提示，结束=站定/落定/切镜）
3. **export**

⚠️ **坑**：refine 的动势包络在「密集击杀」场景会把相邻处决合并（窗口越扩越大）——
凡是击杀间隔 <2s 的源片一律走 A 路线。

⚠️ **坑39（loop38 实踩）**：export 裁窗纵向 y 写死 0（顶部对齐）会**切掉人物下半身**——
处决画面主体几乎总在画面中下部，顶部对齐裁窗=上面留一片天空、人物贴下边缘被切。
抽帧存档默认**整幅 16:9 直接缩放（不裁纵向）**；确需追焦才用 `crop:true` +
`cropX/cropY`（cropY 支持 'bottom'、0-1 比例、像素）。竖裁习惯只属于对比剪辑流，
不要带进片段导出。

## 碎片合并规则（loop38 复核定版）

切点分段后**必须复核 <2.5s 的短段**，用「上下文条带」（本段 ±1s，0.5s 步进 8 帧）目验：
- **成立**：有起手→击杀→敌倒完整链的快杀（快剪合集里 1.6-2.3s 是真实节奏，保留）
- **纯余韵碎片**：段内只有尸体落定/血溅散去/走位，无新击杀 → 并入前一条（延其 dur）
- **混合碎片**：前半是上一杀的尾、后半是新敌对峙 → 与语义最近的一条合并；
  同场景连续两次击杀（间隔<1s）合并为「双杀」条目并在 move 标注
- 复核后重排 id、重算 kind，全量重导出

## 置信度分级（catalog.conf 字段）

| 值 | 含义 | 入库前动作 |
|---|---|---|
| verified | 逐帧验证过首尾帧 | 直接入库 |
| cut-verified | 边界=真实剪辑切点（快剪集锦） | 抽检即可 |
| manual | 人工估界 | 建议条带复核 |
| auto | 动势包络自动边界 | **必须**人工复核 |

## 产出物（export）

**目录结构是技能的交付契约**（loop44 立规）：导出目录必须由 `uNN.mp4` + `uNN.jpg` + `uNN.ass`（每单位三件套）
加根目录 `catalog.csv` + `index.html` 组成，`N = 单位数`，合计 `3N+2` 个文件。export 末尾自带**结构自检**：
缺任何一项直接 throw（不许静默交付残缺目录），多余文件只告警。目标目录可用**绝对路径**（如
`Material/<题材>/<素材类>`），相对路径按 catalog 所在目录解析。

> 落地形态（目录形状、素材类注册表、入账方式）**只认** [`Material/docs/模板规范.md`](../../Material/docs/模板规范.md)；
> 本文只管抽帧产出物的形状，两边冲突以它为准。合规自查：`node Tool/check/material_layout.mjs`。

- `clips/uNN.mp4`：1280×720 / CRF18（export 第三参可指定分辨率与目录：`export <catalog> clips1080 1920x1080`，HUD 字号/边距随宽度等比缩放，1080p 时源片零缩放画质最佳） / **整幅原始构图**（默认不裁）/ 左上角编号+场景、右上角源时间码、底部节拍标注（ASS HUD）；`unit.crop:true` 时按 cropX/cropY 裁窗
- `clips/uNN.jpg`：中位帧缩略图
- `clips/catalog.csv`：id/kind/scene/move/t/dur/beat/note/res/fps/file（可直接导入资料库）
- `clips/index.html`：带内嵌视频的核对/入库页

## 归档进素材库（archive）

```bash
node Tool/ops/exec_extract.mjs archive <catalog.json> [--clips clips1080p60] [--frames frames1080p60]
        [--src 源片] [--source-url 出处] [--attribution 署名] [--license 授权] [--bvid BV号] [--run 批次名]
```

- 把 **原始源片 + 处决镜头片段** 登记进 `Material/manifest.jsonl`，实体落 `Material/<题材>/`（源片在题材层 `源片/`）；**不再落 `Material/library/`**（v1 起弃用扁平库），形状见 `Material/docs/模板规范.md`
- 与 `collect_material.mjs register` 同一账本格式（id=sha256 前 10 位、tier=L0、ai_generated=false），
  `--source-url/--attribution/--license` 必须如实填，衍生素材的授权默认「版权归原作者 · 研究/评论引用」
- **按 sha256 去重**，可重复执行（幂等）；回执写 `History/runs/materials/<run>.json`（新增/跳过/字节/错误明细）
- 条目自带 tags：`处决镜头|处决帧|处决素材` + 分级（仪式级/标准/快杀）+ 场景 + `uNN` + 分辨率，
  note 记 move 与源时间码区间 —— 之后 `collect_material.mjs list --tag 仪式级` 就能直接捞


## 排除项

- 「殒命/死亡画面」、纯剧情演出（带台词字幕）默认排除或打存疑标记，入库前人工判定
- 普通连段击杀（无触发层、无专属镜头）不算处决单位——但集锦源片里剪辑师已经替你筛过了

## 已知资产

- 影之刃零处决合集全量清单：`Prototype/loop38_exec_extract/`（46 单位：仪式级 4/标准 28/快杀 14；5 个 verified + 41 个 cut-verified；目录索引见该目录下 `loop38_exec_extract.md`）
- 已归档资产（loop38，历史）：`library/` 平铺落位（源片 1 + 处决镜头 46 + 关键帧 138）；该批实体在 2026-11-08 素材库清理中丢失，
  账本已重建为题材目录版（见下），关键帧尚未重建
- **按题材归档（loop44 起）**：`Material/影之刃零/`（`源片/` 1 + `处决镜头/` 46 单位 140 文件，结构 = 本文「产出物」契约；
  索引 `Material/影之刃零/影之刃零.md`）。新题材照此开目录，实体不入库、索引入库
- 边界规则完整论证：`Prototype/loop37_exec_bound/loop37_exec_bound.md`

### 60fps 源（帧级取证首选）

- B 站 60 帧流 qn=116 需**大会员**；无权限时 playurl 静默降级 id=80（30fps）不报错（坑40），
  必须先 probe 落地文件 r_frame_rate，不能信页面标注
- 30fps 与 60fps 版时长逐秒一致（同一母带转码），边界时间码直接沿用，无需重算；
  60fps 上 `-ss` 精度 1/60s，边界对位更细
- 导出跟随源帧率（不固定 -r），catalog.csv 会带 res/fps 字段；30→60 插帧（minterpolate）
  造假帧，取证禁用

## 归档记录（原 `ARCHIVE.md` 正文）

> 原 `ARCHIVE.md` 按 AGENTS §3.3（一个目录只留一个说明文件）并入本节，正文原样保留；仅「运行态位置」一句按现状更正（当时是目录副本的说法，现为 junction 同一份文件）。

### 处决抽帧技能 · 归档

**归档时间**：2026-11-07
**版本**：v1.2（loop37 方法论 → loop38 工具化 → loop38 收尾补 60fps / 归档能力）
**运行态位置**：`.workbuddy/skills/exec-extract/SKILL.md`（本目录为存档快照，改动请先改运行态再同步）

#### 这套技能解决什么问题

给定一部「处决合集 / 实机录制」源片，把它拆成**逐个完整的处决单位**（每个单位包含触发→前摇→命中→收招→余韵），
并批量产出可入库的 1080p 片段、关键帧与清单。核心难点不是剪，而是**边界**：
截短了会丢前摇和收招（loop36「完整性差」的根因），截长了会带进下一场战斗。

#### 沉淀了什么

| 内容 | 位置 |
|---|---|
| 处决单位边界规则（五层解剖 + 起止帧判据 + 单位长度参考） | `SKILL.md` §二 |
| 两条流程：快剪集锦（切点分段）/ 长镜头实机（动势收敛） | `SKILL.md` §四 |
| 碎片合并规则（<2.5s 必须上下文条带复核） | `SKILL.md` §五 |
| 置信度分级（verified / cut-verified / auto / 存疑） | `SKILL.md` §六 |
| 60fps 源与帧率纪律（大会员流、静默降级、禁插帧） | `SKILL.md` §九 |
| 工具执行体（scan / sheets / strip / refine / export / archive） | `tool/exec_extract.mjs` |

> **原文两处已过时，此处只加注、不改原文**：①「运行态位置」当时说本目录是副本——实际是 junction，两边同一份文件（loop39 已核实）；② 表中的 `§二/§四/§五/§六/§九` 是当时的章节序号，本文件现为具名小节（核心依据 / 流程 / 碎片合并规则 / 置信度分级 / 60fps 源）；③ `tool/exec_extract.mjs` 已按 §3.2 收敛到唯一真源 `Tool/ops/exec_extract.mjs`。

#### 工具能力一览

```bash
node Tool/ops/exec_extract.mjs scan    <src> [outDir]            # 动势曲线 + 场景切点
node Tool/ops/exec_extract.mjs sheets  <src> [outDir] --step 1   # 带时间码的秒级网格（人工枚举）
node Tool/ops/exec_extract.mjs strip   <src> <t0> <t1> <n>       # 边界取证条带
node Tool/ops/exec_extract.mjs refine  <catalog.json>            # 动势包络收敛（仅长镜头片）
node Tool/ops/exec_extract.mjs export  <catalog.json> [dir] [1920x1080]
node Tool/ops/exec_extract.mjs archive <catalog.json> [--clips --frames --src --source-url]
```

`export` 跟随源帧率、HUD 随分辨率等比缩放；`archive` 直接写 `Material/manifest.jsonl` 账本（按 sha256 去重，可重复执行）。

#### 首个验证案例（loop38）

- 源片：《👹 处决！处决！处决！》BV1ydx26rEWv（UP 余掌事），1080P60 / 173.035s / 10381 帧
- 产出：46 个处决单位（仪式级 4 / 标准 28 / 快杀 14），46 条 1080p60 片段 + 138 张关键帧（起手/命中/收招）
- 边界置信度：5 条逐帧 verified，41 条 cut-verified（边界=真实剪辑切点），1 条存疑（火海巨兽终局疑剧情演出）
- 已知局限：该合集为快剪结构，源片在击杀后 0.1–0.2s 即切镜，**收招落地帧在源片里不存在**，无法补回；
  需要完整收招的素材应换长镜头实机源

#### 依赖

- ffmpeg / ffprobe：`Workspace/deps/ffmpeg/`
- 素材账本：`Material/manifest.jsonl`（与 `Tool/ops/collect_material.mjs` 同一格式）
- 下游技能：`versus-edit`（对比剪辑流，处决单位边界规则为其对位前提）


