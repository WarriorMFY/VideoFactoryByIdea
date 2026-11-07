# loop38_exec_extract · 影零处决全量抽取（1080p60）

上级：[`../`](../)（Prototype 实验区）｜方法论真源：[`Skills/exec-extract/SKILL.md`](../../Skills/exec-extract/SKILL.md)
日志：`log.md` 暂无 loop38 条目（loop32–38 七轮历史欠账，见 [`Prototype.md` 待人工确认](../Prototype.md)），故本索引无 `#loop38` 回链——补录后再挂。

用途：把影之刃零中式处决源片按「处决单位边界」全量抽出为独立片段 + 关键帧，并拼成可发布的合集示片。本目录是 loop38 一次实验的全部产物，不含工具实现（工具在 `Tool/ops/exec_extract.mjs`）。

## 结论

| 项 | 值 |
|---|---|
| 单位数 | 46 条 |
| 总时长 | 156.26s |
| 类型分布 | 仪式级 4 / 标准 28 / 快杀 14 |
| 置信度 | verified 5（逐帧验证）/ cut-verified 41（边界=真实剪辑切点） |
| 规格 | 1920×1080 / 60fps / CRF18，源片 173.035s 无变速无插帧 |
| 入库 | 已入 `Material/`：185 项 / 928.9MB（46 片段 + 138 关键帧 + 源片），sha256 幂等去重 |
| 发布 | 720p60 CRF28 合集 77MB，站点 `Workspace/site_exec_showcase/`（链接已上线） |

## 子目录

| 目录 | 项数 | 体积 | 职责 |
|---|---|---|---|
| `clips1080p60/` | 140 | 410M | **正式片段库**：`u01–u46.mp4`（1080p60 CRF18）+ 同名 `.ass`（编号/场景·招式/源时间码 HUD）+ 同名 `.jpg` 关键帧 + `catalog.csv` + `index.html` 核对页 |
| `frames1080p60/` | 138 | 310M | 每单位 3 帧取证（`uNN_a/b/c.png`）：起始/命中/收招余韵 |
| `qc/` | 15 | 23M | 逐阶段抽帧质检：HUD 可读性（`hud*`）、60fps 落地验证（`h60_*`）、帧率/取景抽检（`f*`） |
| `recheck/` | 39 | 15M | 短片段复核证据：`row*`（上下文条带）、`d*`/`t*`（#23/#42/#44 逐帧时间码验证）、`tail*`（收招尾部） |
| `sheets/` | 9 | 18M | 全片扫描网格（9 张，`exec_extract sheets` 生成），用于人工定位候选 |
| `tails/` | 12 | 3.2M | 收招尾部条带（`row_b1_*`），确认「尸体落定」是否被源片掐断 |

## 关键文件

| 文件 | 说明 |
|---|---|
| `catalog_60.json` | **现行清单（唯一真源）**：46 单位，字段 id/kind/scene/move/t/dur/durOut/note/conf |
| `catalog_final.json` | 720p 阶段的定版清单，与 `catalog_60` 逐条对齐（时间码相同，母带同源） |
| `catalog_raw.json` / `catalog_refined.json` | 中间代：初版 49 条 → refine 收敛版，保留用于追溯为何删到 46 |
| `scan.json` | 全片动势曲线与切点（`exec_extract scan` 输出） |
| `showcase_master.mp4` | 46 段 concat 母版，1080p60 全画质 426MB（按 `showcase_list.txt` 拼接，`-c copy` 无损） |
| `showcase_720p60.mp4` | 发布版 720p60 CRF28 77MB，站点实际引用此文件 |
| `showcase_list.txt` | concat 清单，顺序即目录 id 顺序 |
| `build_site.mjs` | 由 `catalog_60.json` 生成发布页（合集播放器 + 46 张卡片），复制关键帧到站点 assets |

## 生成方式

```bash
node Tool/ops/exec_extract.mjs scan   <src>                        # 动势曲线 + 切点
node Tool/ops/exec_extract.mjs sheets <src> <outDir>               # 扫描网格
node Tool/ops/exec_extract.mjs strip  <src> <catalog> <t>          # 边界取证条带
node Tool/ops/exec_extract.mjs export <catalog> <outDir> 1920x1080 # 片段 + 关键帧 + HUD
node Tool/ops/exec_extract.mjs archive <catalog> <outDir>          # 入 Material 账本
node build_site.mjs                                                # 生成发布页
```

源片 `Workspace/tmp/loop38_hd60/yzl_exec_60.mp4`（B 站 1080P60 母版，需大会员，qn=116）。

## 已清理（不再保留）

| 内容 | 原因 |
|---|---|
| `clips/`（198MB） | 首轮 1280×720/30fps 导出，被 `clips1080p60/` 完全取代 |
| `clips1080p30/`、`frames1080p30/`（555MB） | 60fps 母版落地前的降级版本（B 站静默降级事故，见坑 40） |
| 5 张 QC 拼图（21MB）+ 4 张转码 QC 图（2MB） | 过程目验证据，结论已入 CircleLog 与本页 |

## 已知遗留

- `#46` 火海巨兽终局带台词字幕，疑似剧情演出，入库时按存疑处理（`conf` 未标 verified）。
- 源片为快剪合集，部分单位（如 #42/#44）收招被原片掐断，脚未落地属源片缺陷，非抽帧失误。
