# Circle7 · 详细日志

> 2026-11-16 00:30 循环结束时由 `Circle.md` 全文转存：本文件保留全过程逐条记录（用户给定、规格与目录落地、连带修正、体检、待定、RAG README 改写与精简）。
> 原文逐字转存（80 行），除本说明外未改动一字。摘要版见同目录 `Circle.md`。

---

# Circle7（原文）

| 项 | 值 |
| --- | --- |
| 开始时间 | 2026-11-16 00:15 |
| 结束时间 | 进行中 |
| 目标 | 重构 `Doc/Cards` 的规格与目录结构：规格只留元信息＋两列表格，目录只留 `spec.md` ＋ `Template/` |
| 现状 | 规格与目录均已落地：`Doc/Cards` 下只剩 `spec.md` 与 `Template/`（11 份模板），32 个旧文件删除 |
| 详细日志 | 循环结束时本文件压缩为摘要，全文转存 `log.md` |

## 0 · 用户给定（不在本轮讨论内）

| # | 指令 | 出处 |
| --- | --- | --- |
| 1 | 元卡片结构信息只定义两样：**元信息（name, desc）＋列表（自变量＋因变量）** | 00:15 |
| 2 | 元信息**严格校验**；列表**只校验两列**，内容由各卡自己定义 | 00:15 |
| 3 | **其他规格全部置空** | 00:15 |
| 4 | `Doc/Cards` 最终只保留 **`spec.md`** ＋ **`Template/`**（存放各基础模板卡） | 00:15 |
| 5 | 现有 18 张实例卡：**方案 C，全部删除，只从 git 历史查** | 00:17 |

## 1 · 已落地的规格（`Doc/Cards/spec.md`，四节）

| 节 | 内容 |
| --- | --- |
| 一、元信息 | `name` 必填、与卡片标识一致（独立文件取文件名，`<name>/card.md` 取目录名）、`^[a-z0-9][a-z0-9-]*$`、3–64 字符；`description` 必填、非空、≤ 200 字符。其余键允许出现但不校验 |
| 二、表格 | 至少一张；每数据行恰好 2 列；表头与行内容不校验 |
| 三、模板豁免 | `Template/` 下全部文件豁免本规格全部校验 |
| 四、置空清单 | `type` 枚举与前缀、各类型必填键、description 两段式、表格格式细则（表头模板/行序号/`键=值；`）、零外链、角色位、审美词、量纲、九槽位引用契约与装配算法、校验脚本 |

## 2 · 已落地的目录

```
Doc/Cards/
├── spec.md
└── Template/       11 份（01-figure … 11-prompt，去掉 .template 中缀）
```

删除的 32 个文件：`00-spec/`（`card-spec.md`、`reference-graph.md`、`validate.ps1`）、`20-assets/`（含 2 张场景卡）、`30-behavior/`（含镜头卡原件）、`40-control/`、`50-composite/`、`90-cases/`（14 个）、`README.md`、`10-templates/`。

## 3 · 连带修正（不留静默坏引用）

| 位置 | 处理 |
| --- | --- |
| `Tool/smoke_test.py` | 删去 `validate_ps1` 检查与 `vdetail` 提取器，改留一行注释 |
| `Tool/README.md` | 「两个已知事实」改为一条，并说明校验脚本已删 |
| `RAG/README.md` §2 | 追加 2026-11-16 注记：`validate.ps1` 已随重构删除，停用一事无对象 |
| `RAG/README.md` §6 | 改写为「`card.md` 是唯一副本，`Doc/Cards` 不再存实例」 |
| `Template/10-composite.md` | 指向 `00-spec/reference-graph.md` 的句子改为「旧引用契约已废止」 |
| `RAG/.../cameras/.../evidence.md` | 模板路径补现址；加注原件已删、`card.md` 为唯一副本 |
| `RAG/actions/execution-shield-bash-throat-thrust-3f/evidence.md` | 末尾加 Circle7 追记，声明 `00-spec/` 已不存在，原文陈述保留为当时记录 |
| `Workspace/_verify_prompt.py` | 加失效说明（依赖已删的 90-cases 卡片） |

## 4 · 新规格体检（自写一次性检查，未落盘为脚本）

| 对象 | 结果 |
| --- | --- |
| `Template/` 11 份（豁免 name） | 全部 OK：description 非空、表格两列 |
| `RAG` 入库卡 4 份 | 3 PASS；1 FAIL：`execution-shield-bash-throat-thrust-3f` **description 判缺失** |
| `Doc/Cards/spec.md` | 无 frontmatter（本文件是规格非卡片，已在正文首行声明） |

**关于那条 FAIL**：该卡 frontmatter 的 `description: |` 与 `source:` 子项都没缩进，严格 YAML 下块标量取不到值，属畸形写法而非文案缺失。它在 Circle3 是「逐字复制、不改一字」的例外入库件，hash `E9DD877F4114` 记载于 evidence；改它就破指纹，故**不擅改**，只登记。

## 5 · 待定

| # | 事项 | 状态 |
| --- | --- | --- |
| 1 | `Template/` 下 11 份模板是否按新规格重写（现 frontmatter 仍带 `type`、`is_template`，新规格允许但不校验） | 未定 |
| 2 | 是否补一个符合新规格的校验脚本（用户此前停用过 `validate.ps1`，本轮未建） | 未定 |
| 3 | `execution-shield-bash-throat-thrust-3f` 的畸形 frontmatter 是否修（修即破 hash） | 未定 |
| 4 | 场景卡（土场、竹林）已按 C 删除，仅存于 git 历史 `c06e3bb`；是否要重新落成 RAG 实例 | 未定 |

## 6 · 后续：`RAG/README.md` 改写与精简

| 时点 | 动作 | 结果 |
| --- | --- | --- |
| 00:24 | 用户「修改 RAG 目录下的 README.md，看看有需要改的没」→ 全量改写 | 117 → 167 行。修 3 处硬错（草稿去处、`type` 与子目录对应、`validate.ps1` 停用说法已失效）；补「`spec.md` 只自检不拦截」与两处已知例外、派生／独立判据、当前入库清单（4 张卡 hash）；补字节法算 hash 的实测对照 |
| 00:29 | 用户「对 README.md 进行精简」→ 表格压回文字 | 167 → 85 行 / 5132 → 3078 字符；脚本核对 16 个关键信息点无丢失；代码块与表格列数自检通过 |
| 期间 | `Doc/Cards/Template/11-prompt.md` 从磁盘消失（非本轮操作所致） | `git checkout --` 恢复，内容与 `073a0f2` 一致，11 份模板齐全 |

**一条可复用的观察**：库内 4 份 `card.md` 中 3 份是 CRLF、1 份是 LF（`execution-shield-bash-throat-thrust-3f`）。同一张卡用 `read_bytes()` 与 `read_text()`＋encode 算 SHA256 会得到不同值——`style-dark-fantasy` 实测 `81404DCD4E58` 与 `7018DEDFAB75`。这条写进了 README §四，因为库内所有指纹都按字节记录。
