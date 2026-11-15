# Circle7

| 项 | 值 |
| --- | --- |
| 开始 / 结束 | 2026-11-16 00:15 → 00:30 |
| 一句话 | 把 `Doc/Cards` 从「11 种卡片类型 + 九槽位装配契约 + 校验脚本」压成「元信息 + 两列表格」，目录只留 `spec.md` 与 `Template/`；连带把 `RAG` 入库规则重写并精简到 85 行 |
| 性质 | **规格轮**：全程无模型投喂、无出片，不产卡片、不产视频 |
| 详细日志 | `log.md`（87 行，原文逐字转存） |

## 1 · 做了什么

| 阶段 | 动作 | 结果 |
| --- | --- | --- |
| 规格 | 新写 `Doc/Cards/spec.md`，四节 | 元信息严格校验（`name` 一致性与字符规则、`description` 非空 ≤200）；表格只校验两列；`Template/` 全豁免；其余全部置空 |
| 目录 | 11 份模板 `git mv` 到 `Template/`，删旧目录 | 删 32 个文件：`00-spec`（含 `validate.ps1`）、`20-assets`、`30-behavior`、`40-control`、`50-composite`、`90-cases` 14 个、`README.md`、`10-templates` |
| 实例卡 | 用户裁定方案 C | 18 张全删，只留 git 历史；`Doc/Cards` 终态 12 个文件 |
| 不留坏引用 | 改 8 处路径／提法 | `smoke_test.py`、`Tool/README.md`、`Template/10-composite.md`、两份 `evidence.md`、`_verify_prompt.py` |
| `RAG/README.md` | 全量改写后精简 | 117 → 167 → **85 行**；修 3 处硬错，补「spec 只自检不拦截」、派生／独立判据、入库清单 |

## 2 · 定的规矩

| 项 | 内容 |
| --- | --- |
| 硬约束只剩两条 | 元信息（`name`、`description`）＋ 每行恰好 2 列的表格。其余 `type` 枚举、必填键、格式细则、九槽位契约、零外链全部废止 |
| `name` 判法 | 与卡片标识一致：独立文件取文件名，`<name>/card.md` 取目录名。不这么写，RAG 四张卡会全违规 |
| 模板豁免 | 按**目录**不按 `is_template` 标记：在 `Template/` 内即免检。理由：标记会忘，位置不会说谎 |
| 实例卡不入 `Doc` | `Doc/Cards` 只有规格与模板，`RAG` 的 `card.md` 是唯一持久形态 |
| 派生还是独立 | 看内容不看命名：引用了基础卡的具体帧号／接触点 → 派生，进子目录；只描述自身维度 → 独立，进顶层 |

## 3 · 落地校验

| 对象 | 结果 |
| --- | --- |
| `Template/` 11 份（豁免 name） | **11/11 OK**，`description` 非空、表格两列 |
| `RAG` 入库卡 4 份 | **3 PASS / 1 FAIL**：`execution-shield-bash-throat-thrust-3f` 的 `description` 竖线块未缩进，严格 YAML 取不到值 |
| 不豁免模板时 | **11/11 FAIL**，全部只卡 `name`（`figure-<slug>` ≠ `01-figure`）——这是豁免存在的实证 |
| `RAG/README.md` | 6 个代码块闭合、2 张表列数一致；16 个关键信息点精简后无丢失 |

那条 FAIL 不修：该卡是 Circle3「逐字复制、不改一字」的例外入库件，改则破 hash `E9DD877F4114`。

## 4 · 硬结论

1. **规格要么能被一条命令跑，要么会退化成文档装饰。** 旧规范 121 行、配 `validate.ps1` 仍报 35 项 FAIL；新规格两条，靠一次 YAML 解析就能全判。
2. **「停用」不等于「删除」。** 脚本删了、准入表仍写「停用」，就是死引用——RAG README 原本正是这样。
3. **数字型与结构型规则越少，卡越好写；但索引性质的规则不能省。** `name` 一致性看着琐碎，省掉就等于放弃「按名字找卡」。
4. **hash 必须按字节算。** 库内多数 `card.md` 是 CRLF，`read_text()` 再 encode 会得到不同指纹（`81404DCD4E58` vs `7018DEDFAB75`）。
5. **辅助卡独立不独立，判据是内容而不是名字。** Circle6 的场景卡不引用任何动作节点，属独立卡；Circle5 的镜头卡引用了 K0–K4，属派生卡。

## 5 · 待优化

| # | 事项 | 状态 |
| --- | --- | --- |
| 1 | `Skill/interactive-action-card-validation` 格式项 5 「恰好 2 键」与 spec「其余键不校验」冲突 | 未对齐 |
| 2 | `Template/` 11 份模板是否按新规格重写（现仍带 `type`、`is_template`、五元组键序） | 未定 |
| 3 | 是否补一份符合新规格的校验脚本（旧版已删，本轮只用手写一次性检查） | 未定 |
| 4 | `execution-shield-bash-throat-thrust-3f` 畸形 frontmatter 是否修（修即破 hash） | 未定 |
| 5 | 场景卡（土场、竹林）只在 git 历史 `c06e3bb`；是否重落为 RAG 实例、开 `scenes/` | 未定 |

## 6 · 产物

| 类型 | 路径 |
| --- | --- |
| 规格 | `Doc/Cards/spec.md`（4 节） |
| 模板 | `Doc/Cards/Template/01-figure.md` … `11-prompt.md`（11 份，去掉 `.template` 中缀） |
| 规则 | `RAG/README.md`（85 行，新增 §七 入库清单） |
| 脚本 | `Tool/smoke_test.py` 删 validate 检查 |
| 日志 | 本文件（摘要）、`log.md`（全文） |
| 提交 | `073a0f2`（规格与目录重构）＋ 收尾提交（RAG README 改写与精简） |
