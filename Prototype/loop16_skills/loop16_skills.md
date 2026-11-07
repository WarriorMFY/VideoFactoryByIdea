# loop16_skills/ — 能力打包迁移沉淀为 Skill

> 能力打包迁移沉淀为 Skill。关键结果：Skill 落地
> 回链：[AGENTS.md §3.3](../../AGENTS.md) · [循环日志 #loop16](../../History/CircleLog/log.md#loop16) · [Prototype 索引](../Prototype.md)

## 目录内容

根目录另有 1 个数据产物文件（.mjs×1），均为本轮产物，不单列。

## 说明（原 `README.md` 正文）

### 小循环 16 · 能力打包迁移做成 Skill

> 人指令（2026-11-01 15:58）：「把之前『打包迁移』做成一个 Skill 放到根目录的 `Skills` 下，
> 只写方法论流程不要把工具拷贝过去，工具按照目录路径引用即可，同时更新 AGENTS.md 中的相关引用。」

#### 做了什么

把 loop15 那次「把整条能力链路抽成独立目录包」的实战，抽象成**可复用的方法论**，落在
`Skills/capability-packaging/`。技能里不含任何工具实现，全部按仓库路径引用。

```text
Skills/
└── capability-packaging/
    ├── SKILL.md                    176 行：三条硬判据 + 流程七步 + 三个决策点 + 七条坑 + 完成判据
    └── references/
        └── checklist.md            A–G 七组共 32 条勾选项（结构/构建/校验/冒烟/文档/交付/版本）
```

#### 为什么是"只写流程"

loop15 的教训很直接：`build_package.mjs` 是**那次**的构建脚本（清单里写死了 loop14 的样例、
TalkFactory 的目录名）。把它抄进技能，下次打包别的链路就得改两份；改漏一处，技能开始说谎。

所以分工是：

| 层 | 放什么 | 位置 |
| --- | --- | --- |
| 方法论 | 顺序、判据、决策点、坑位 | `Skills/capability-packaging/SKILL.md` |
| 实现 | 构建脚本、校验脚本 | `Prototype/loop15_export/` |
| 产物 | 那次打出来的包 | `../TalkFactory/` |

技能里对这三层的引用一共 12 条路径，`check_skill.mjs` 每次都会验一遍是否还解析得通。

#### 新增的守卫：`check_skill.mjs`

技能最容易腐化的地方是**引用的路径失效**——半年后有人挪了 `Prototype/loop15_export/`，
SKILL.md 还在指向老位置，读的人照着走会卡住。所以配了一个自检脚本：

```bash
node Prototype/loop16_skills/check_skill.mjs          # 扫 Skills/ 全部技能
node Prototype/loop16_skills/check_skill.mjs --json   # 机器可读
```

查四件事：

1. frontmatter 有 `name` / `description`，且 `description` 写了**触发条件**（没写触发条件，模型不会选中它）
2. `name` 与目录名一致
3. 正文引用的仓库路径**真实存在**（单段通用占位如 `lib/`、`seed/` 只记录不判错）
4. 不含大段实现代码、总行数不超过 260 行（超了说明细节该下沉到 `references/`）

#### 验证记录

| 项 | 结果 |
| --- | --- |
| 正向跑 | `扫描 1 个技能 / 引用 12 条（解析成功 9，通用占位 3）/ ✓ 全部通过` |
| 反向跑（造一个引用失效的坏技能） | `✗ 2 个问题：description 没写触发条件 + 引用路径失效`，退出码 1 ✅ |
| 目录联接 | `.workbuddy/skills/capability-packaging` → `Skills/capability-packaging`，同 inode `844424930302438`，无复制 |
| AGENTS.md | 目录约定补 `Skills\`、原则补「方法论进 `Skills\`」、新增第 6 条分工规则、文件地图补一行 |

#### 怎么用它

下次用户说「把某条链路打包出去」时，技能会给出：先写步骤表 → 依赖盘点 → 四象限取舍 →
目录设计 → 文档四件套 → 构建脚本化 → 校验脚本化 → 包内冒烟。三个必须让人拍板的决策点会在动手前问清
（依赖随包还是 bootstrap、样例带多少、缺口补不补），避免做到一半返工。

#### 复现

```bash
node Prototype/loop16_skills/check_skill.mjs
```

改完技能内容后跑一遍；红灯说明技能在说谎。
