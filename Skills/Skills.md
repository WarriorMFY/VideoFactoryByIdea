# Skills/ — 方法论与作业流程

> 放"知道怎么做的顺序"（步骤、判据、坑位），**不放工具实现**——工具一律按仓库内路径引用（`Tool/ops/*.mjs`），避免两份分叉（§3.2）。
> 回链：[AGENTS.md §3.2 / §3.3](../../AGENTS.md) · [Tool 索引](../Tool/Tool.md) · [Prototype 索引](../Prototype/Prototype.md)

## 目录内容

| 技能 | 一句话 | 什么时候会被选中 | 规模 |
|---|---|---|---|
| [capability-packaging](capability-packaging/SKILL.md) | 把一条已验证的能力链打包成可独立运行的目录包（三条硬判据 + 七步流程 + 七条静默失败坑） | 「打包出去 / 迁移到新目录 / 做成独立包」 | 175 行 + checklist |
| [edit-craft-scouting](edit-craft-scouting/SKILL.md) | 感知平台内剪辑见长的作品 → 自研最小实验 → 工具化，含三判据选种与视野纪律 | 「学某个 UP/流派的剪辑技术 / 拆解剪辑手法」 | 234 行 + checklist |
| [essay-film-production](essay-film-production/SKILL.md) | 散文影像生产：语音驱动时间轴、8 类技术落点、三级音频、版式卡三约束、QC 六组 | 「做一部独立短片 / 散文影像 / 无解说氛围片」 | 151 行 + spec-schema + qc-checklist |
| [exec-extract](exec-extract/SKILL.md) | 从处决合集/实机源片全量抽取**完整处决单位**（五层解剖 + 边界判据 + 60fps 纪律 + 入库） | 「处决抽帧 / 抽处决 / 处决入库 / 处决切片」 | 137 行 |
| [versus-edit](versus-edit/SKILL.md) | 双源对比剪辑流：语义对位五维清单 + 扫描到出片的流程 + 版式选择 | 「做对比视频 / A vs B / 对位剪辑」 | 85 行 |

## 命名与发现机制

- 一个技能一个目录，说明文件固定为 `SKILL.md`（§3.2 命名约定优先于 §3.3 的同名索引规则）；
- frontmatter 至少含 `name`、`description`，`description` 必须写**触发条件**（用户说什么话时用），否则不会被选中；
- 细节点到为止，细节放 `references/`，SKILL.md 只留主干；
- **自动发现的前提**：WorkBuddy 只扫 `.workbuddy/skills/`。本目录是版本化唯一真源，`.workbuddy/skills/<名>` 是指向本目录的**目录联接**（junction），同一份文件、无副本。**新增技能必须补一条同样的链接**，否则不会被加载。

## 现有联接状态（2026-11-07 核对）

| 技能 | 联接 |
|---|---|
| capability-packaging | ✅ |
| edit-craft-scouting | ✅ |
| essay-film-production | 本轮补齐（此前缺失，技能不会被自动发现） |
| exec-extract | ✅ |
| versus-edit | ✅ |

## 校验

`Prototype/loop16_skills/check_skill.mjs`：查 frontmatter 完整性、`name` 与目录名一致、引用路径可解析、无大段实现代码、行数上限。改动任何 SKILL.md 后跑一遍。
