# check/ — 自检工具（查仓库 / 查技能 / 查画质）

> 一句话：**判断"当前状态合不合规、有没有退化"**的工具，只读、只报，不改任何文件。
> 上级：[`../Tool.md`](../Tool.md)｜判据来源：[`../../AGENTS.md`](../../AGENTS.md) §2.5 / §3.2 / §3.3

## 与 `acceptance/` 的边界（最容易混的一处）

| | `acceptance/` | `check/`（本目录） |
|---|---|---|
| 问什么 | 这条流水线**对不对**（有真值、有通过/失败） | 当前仓库/技能/产物**有没有违规或退化** |
| 输入 | 用例 + 基准素材 | 现行文件系统、现行成片 |
| 形态 | `run_*`（跑用例）+ `verify_*`（比对真值） | 扫描全量、输出错误码或度量值 |
| 典型 | `run_subs_acceptance` `verify_edl` `qa_report` | `repo_sync_check` `check_skill` `kb_audit` |

一句话分界：**acceptance 是"跑一遍证明它对"，check 是"扫一遍看它坏没坏"**。

## 工具

| 工具 | 查什么 | 判据出处 | 用法 |
|---|---|---|---|
| `repo_sync_check.mjs` | 仓库三件套自洽：日志条目 / 索引回链 / 目录清单行，外加时间线 | `AGENTS §2.5`（日志）、`§3.3`（索引） | `node Tool/check/repo_sync_check.mjs [--json] [--strict]` |
| `check_skill.mjs` | `Skills/` 是否腐化：frontmatter 完整性（`name` / 带触发条件的 `description`）、引用的仓库路径是否还存在、有没有混入大段实现代码 | `AGENTS §3.2` | `node Tool/check/check_skill.mjs [--json]` |
| `kb_audit.sh` | 摘要片/散文片的 **Ken Burns 运动是否匀速**：中部裁切采样 → 帧间差 YAVG → 剔除转场窗口 → 算 mean / sd / CV / 顿挫次数（**CV 越小越匀速**） | 无判据，是度量；对照值见 `History/loops/loop15/plan.md`（同源 sd=0.2952 ↔ 随包 0.2978） | `bash Tool/check/kb_audit.sh <video.mp4> [标签]`，**须在仓库根执行**（脚本内是 `Workspace/…` 相对路径） |

## 读数怎么用

- `repo_sync_check`：错误码 `E1` 断链 / `E2` 缺索引 / `E3` 目录缺清单行 / `E4` 有日志无目录 / `E5` 有产出无记录 / `E6` 全仓缺同名索引 / `E7` 目录内第二份说明文件；告警 `W1` 长期进行中 / `W2` 索引缺回链 / `W3` git 晚于日志 / `W4` 深层待懒迁移。**退出码 1 = 有错误**，`--strict` 时告警也算失败，可直接进 CI。
- `check_skill`：已知 6 条误报——它把 SKILL.md 里的代码片段/表头当成路径解析（loop40 记录在案）。改造前，误报按已知问题读，别当成技能坏了。
- `kb_audit`：只在"同源对照"时可信（同一段素材、两个渲染版本比 sd）。跨片比绝对值没有意义，因为运动幅度本身不同。

## 为什么单独一层（落位由来）

这三个工具此前散在三处：`kb_audit` 在 `ops/`（跟着它的调用者 `make_digest` 走）、`repo_sync_check` 也在 `ops/`（2026-11-07 新建时无处可去，顺手放进最泛的目录）、`check_skill` 留在 `Prototype/loop16_skills/`（从未升格）。

根因不是谁放错，而是 **`Tool/` 的九个目录都按"主题域"分（字幕/剪辑/市场/环境），而"检查"是"行为类型"**——两者不在同一坐标系，跨域工具在主题域目录里永远算"顺带"，于是每次都会落进最泛的那个。`Tool.md` 的「落位三问」就是为这条缺口补的。
