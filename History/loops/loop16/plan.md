# 小循环 16 · 把「能力打包迁移」沉淀为 Skill

> 开轮：2026-11-01 15:58，人指令：「把之前『打包迁移』做成一个 Skill 放到根目录的 `Skills` 下，
> 只写方法论流程不要把工具拷贝过去，工具按照目录路径引用即可，同时更新 AGENTS.md 中的相关引用。」

## 目标与判据

- **要的**：一条可复用的方法——下次换任何一条链路，照着走就能打出同类能力包。
- **不要的**：把 loop15 的构建脚本抄进技能。抄即分叉，分叉立刻腐化（脚本里写死了 loop14 样例与 TalkFactory 目录名）。
- **完成判据**：① `Skills/` 有符合 WorkBuddy 格式的技能；② 技能正文零实现代码、路径引用全部可解析；③ AGENTS.md 目录约定与文件地图同步；④ 能被自动发现（不复制文件）。

## 工作包

### `[x]` WP1 · 目录与格式摸底
- AGENTS.md 原为五目录约定（Idea/Prototype/History/Tool/Workspace），无 `Skills\`。
- 参照 WorkBuddy 内置技能格式：`SKILL.md`（frontmatter 含 `name`/`description`/`license`）+ `references/` 按需展开。
- 核实 `.workbuddy/` 已被 `.gitignore` 忽略（第 38 行），可安全放链接；`Skills/` 正常入库。

### `[x]` WP2 · 写技能（方法论，非实现）
`Skills/capability-packaging/SKILL.md`（176 行）：

| 段 | 内容 |
| --- | --- |
| 三条硬判据 | 能独立跑 / 能重建 / 能被质疑 |
| 流程七步 | 界定边界 → 依赖盘点 → 文件取舍 → 目录设计 → 文档四件套 → 构建脚本化 → 校验脚本化 → 包内冒烟 |
| 三个决策点 | 依赖随包 or bootstrap / 样例带多少 / 缺口补不补（动手前必须让人拍板） |
| 七条坑 | 绝对路径藏在机器产物里、`.gitignore` 静默吃样例、在源仓库冒烟、缺视觉基准、提交身份缺失、网络抖动误判为鉴权失败、文档写成实现 |
| 参考实现 | 5 条仓库路径（构建脚本 / 校验脚本 / seed / 案例 / 产物） |
| 完成判据 | 8 条，细则指向 `references/checklist.md` |

`references/checklist.md`：A–G 七组 32 条勾选项（结构 / 构建 / 校验 / 冒烟 / 文档 / 交付 / 版本控制）。

### `[x]` WP3 · 守卫：`check_skill.mjs`
技能最大腐化风险是引用失效（有人挪了 `Prototype/loop15_export/`，技能还在指老位置，读的人照着走会卡住）。
脚本查四件事：frontmatter 完整且 `description` 带触发条件、`name` 与目录名一致、引用路径可解析、无大段代码且行数 ≤ 260。

首跑抓出 5 条，其中 3 条是技能里的通用占位（`lib/`、`seed/`、`.work/`）误报、2 条是脚本自身缺陷（`.md` 纯扩展名、`../TalkFactory/` 相对基准错）。两边都修：
- 单段引用只记录不判错（通用占位）；
- 纯扩展名跳过；
- `../` 先按仓库根解析，再按技能目录解析。

**反向验证**（自己写的判据，自己先证伪）：造一个 `Skills/_tmp_broken/SKILL.md`（引用 `Tool/ops/not_exist_xyz.mjs`）→ 脚本报 2 个问题、退出码 1；删除后恢复绿灯。

### `[x]` WP4 · 自动发现（不复制文件）
`.workbuddy/skills/capability-packaging` → `Skills/capability-packaging`（NTFS 目录联接 / junction）。
验证：两边 `SKILL.md` inode 相同（`844424930302438`），是同一份文件，不存在第二份副本。

### `[x]` WP5 · 更新 AGENTS.md
四处改动：
1. 目录约定新增 `Skills\` 一条（写明"只写流程、不复制工具实现、路径引用"）；
2. 原则补一句「**方法论进 `Skills\`**」；
3. 新增全局规则 6：`Skills\` 与 `Tool\` 的分工（能执行 vs 知道怎么做）、命名与 frontmatter 要求、自动发现前提；
4. 文件地图补 `Skills/` 一行。

## 遗留

- **只有一个技能**，尚未验证"多技能并存时是否会被正确路由"（`description` 的触发条件写得好不好，得等实际使用才知道）。
- `check_skill.mjs` 暂放 `Prototype/`，若下轮确认稳定，再考虑提升到 `Tool/ops/`（届时技能里的引用也要跟着改——正好可以拿它验证一次自检脚本）。
- 技能内容基于 loop15 一次实战抽象，样本量为 1；第二次打包时应回填新踩的坑。
