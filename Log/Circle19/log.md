# Circle19 · 详细日志

> 本文件为 Circle19 全过程的逐条记录，按时间排序。摘要见 `Circle.md`。
> 施工图：`skill-restructure-plan.md`（319 行，四桶重排的执行清单）。

## 中间过程

- 10:13 用户新建循环，主题：整理上几轮（Circle15–18）新增技能。先盘点技能清单与职责，再定整理方案。
- 10:20 盘点完成：11 个技能 + 1 份 Meta 规范，按新增时间分三组（Circle1–2 元老 4 个、Circle3–9 验证类 4 个、Circle13–16 新类 3 个 + 元技能 1 个）。识别 7 个结构问题：新旧技能并存（card-experiment-chain 与 -v2 均无版本标记）、废除技能仍占位（action-card-validation）、SKILL.md 行数超标（card-experiment-v2 / shot-repaint 远超 40 行）、命名不统一（PascalCase / kebab-case 混用）、credential.txt 双份重复、runninghub 入口双份、Log/README.md 目录纪律文件丢失。
- 10:40 用户要求四桶重排：meta / hub / chain / other。产出判定树与 12 项映射，列 5 个决策点。
- 10:50 hub 再分 generation（生成）/ editing（剪辑）两层，按 Doc/工程管线.md 的生成/剪辑分界。
- 11:00 desc-to-spec 先移 meta，随后用户改回 other。
- 11:10 关键判据纠正：我先用「模型推断 vs 算法变换」把 image-matte 归 generation；用户指出离线 ONNX 模型已确定性、抠图是更细的裁剪。改判 editing，判据换成「同一输入重跑输出是否唯一」——不唯一（采样）归 generation，唯一（确定性重组）归 editing。看采样不看模型，避免未来本地扩散模型让判据失效。
- 11:20 剪辑侧动作字母表定型：cut（切）/ compose（合）/ measure（量）/ convert（转），四类穷尽。建层规则：同父下成员 ≥2 才建子层，不建单孩子链与空桶。推荐第三版：generation 暂不细分（仅 1 成员），editing 只建 cut/。
- 11:30 施工图落盘 `skill-restructure-plan.md`（319 行）：12 条 git mv、5 份 README 草稿、引用修订清单、三步提交、风险回滚。
- 11:40 用户授权执行。踩坑一：`Remove-Item Skill/Meta` 触发交互确认挂起；查明 Windows 大小写不敏感导致 `Skill/Meta` 与 `Skill/meta` 是同一目录，改用 `Rename-Item` 两步改名修正大小写。
- 11:50 12 条 git mv 完成（RHClaw 拍平需分开搬 5 项）。
- 12:00 写 `Skill/README.md`、`Skill/hub/README.md`、`Skill/chain/README.md`、`Skill/other/README.md` 四份新 README；`Skill/meta/README.md` 追加「本桶清单」；5 个 SKILL.md 改 `name:` frontmatter，给 pixel-anchor 补 frontmatter。
- 12:10 路径修订：`Workspace/fix_roots.ps1` 批量把 13 处 `parents[3]` 换成「向上找同时含 Skill/ 与 Tool/ 的目录」一行式表达式；手改 `view_tree.py`（ROOT + 支持桶路径 + 越界防护）；改 Tool 层 5 个薄壳、Doc/RAG/Log 下全部引用。二次 grep 又清出 6 处遗漏（run_l3/run_l4 的 DEFAULT_RUNNER、skill-viewer SKILL.md、Circle3/4 三个 runner）。
- 12:20 事故与修复：`fix_roots.ps1` 为 UTF-8 无 BOM，PowerShell 5.1 按 ANSI/GBK 解码，注入的中文 SystemExit 提示写成乱码且字符串截断，`matte.py` / `matte_models.py` / `anchor.py` 三个文件语法错误。写 `Workspace/fix_exit_msg.py` 用 Python 正则重写该行为正常中文，`compileall` 通过。
- 12:30 验证：`compileall -q Skill Tool Log` 退出码 0；`Tool/anchor.py --help`、`Tool/matte.py --help`、`view_tree.py hub`、`view_tree.py hub/editing/pixel-anchor`、`new_chain.py -h`、`extract.py -h` 全部正常；`smoke_test.py` 6 项中 5 项通过，`draw_sheet` 失败因 `Log/Circle2/output/l4-v2.mp4` 不存在（媒体不入库，既有问题非重排导致）。
- 12:40 164 个改动/新增文件 UTF-8 校验全部合法、无 U+FFFD；`git status` 确认四桶最终形态（meta / hub{generation,editing{cut,pixel-anchor}} / chain{card-experiment,card-experiment-v1,shot-repaint} / other{3 项}）。git rename 检测把 v1/v2 内容相同的 `new_chain.py` 与空 `.gitkeep` 交叉配对，属显示层现象，已按 HEAD 哈希逐个核对实际路径正确。
- 未提交 git（AGENTS.md：仅结轮时自动提交）。
- 13:00 用户要求审查 Skill / Doc / Tool 三层的语义重复与分区不清，产出 22 条分级清单（A 类硬冲突 6 / B 类语义重复 7 / C 类分区不清 9），全只读、未改文件。
- 13:30 用户追加两条约束：已经证实有效的信息一条不删；Doc 下只保留「驾驭工程」与「Task」两个目录，其余全部提炼到 Skill。确认 Doc 已被用户重理为 `RunningHub/`＋`Task/`＋`驾驭工程/`（含 Cards/ 4 份与工程管线.md）。
- 13:40 迁移设计：7 份 659 行 → 7 个新文件。通道与成本进 `hub/generation/runninghub/references/{channels,cost}.md`（共用底座，全链唯一真相源）；剪辑职责进新建 `hub/editing/README.md`；写卡四篇进 `chain/card-experiment/reference/{card-format,card-language,card-family,prompt-writing}.md`。两个决策点均取「甲」：meta 规则 5 开两个口子（可引 hub 共享件、可引驾驭工程理念），chain 的 channels.md 降为本链默认值＋指向 hub。
- 13:50 建三个 hub 文件与四篇卡片文件。首次搬运偏概括，回读原文后补漏：价格调研补回 §0 证据分级、§2.1 标准 API 目录价全表、§2.2 四通道比价与「低价通道倾向镜像对称构图、贵 77% 的第二档无此倾向」、§4 权限与折扣表、I4 通道用途划分；工程管线补回「配音是唯一跨界项」「同类可挂四项」「i2v 产出 124–226 帧、21:9 黑边各 122px」与流程图；卡片四篇补回「恢复须当轮入库循环提出」、`card-language` 的「建议」定位与三处驾驭工程指针、族谱的「token 生成物」表述。
- 14:00 改引用：`chain/card-experiment/reference/channels.md` 删重复节点表（保留三条 webappId、关键位、三个坑），指向 hub；`SKILL.md` 资产行六篇→十篇；`hub/README.md` 补 editing 指针与生成↔剪辑接口表、修掉过时的 `generation/cloud/runninghub` 路径；`RAG/README.md` 五处、`Tool/README.md` 一处改指 `card-format.md`；`Tool/README.md` 补登 `anchor.py`。
- 14:10 A 类落地：A1 在 RHClaw `SKILL.md` 加本仓库覆盖块（1014、整卡直送、宿主概念映射）、Routing Table 四行标 ⛔、两个模型菜单文件各加声明；A4 把 interactive 校验 L1-5 从「恰好 2 键」放宽为「必含 2 键＋四键白名单」，与 RAG 存量卡对齐；A6 把 `02-instance-card` 与 interactive L2-1.2 的左右规则统一为「同类部位禁解剖与空间语义、画面位置不受限」。
- 14:15 meta 规则 5 修订（经用户「直接修改」授权）：自包含原则增两个例外——可引 `Skill/hub/` 共享 reference 与 scripts、可引 `Doc/驾驭工程/` 理念文章（只指方向，不引数值与判据）。
- 14:20 删 Doc 七份与三个空目录（`RunningHub/APP`、`RunningHub`、`驾驭工程/Cards`）。Doc 现剩 `驾驭工程/`（3 篇，含 1 篇 0 字节待写）＋`Task/`（1 篇）。
- 14:30 验证：`check_utf8.py` 161 个改动文件 bad=0；`view_tree.py other` 正常；`git status` 168 项。残留引用均为历史记录（Log/、RAG 存量卡与 evidence 不追改以免破 hash、Circle19 计划文档），v1 退役链只改一行指针。
- 15:40 删技能（用户「直接删掉」）：先把 `other/action-card-validation/scripts/` 4 个送验脚本（`run_l3`／`run_l4`／`verify_prompt`／`draw_sheet`）迁入 `chain/card-experiment/scripts/`（现 13 个），再删 `other/action-card-validation/` 与 `chain/card-experiment-v1/`。删前核实：v1 的 `experience/` 只有空 `.gitkeep`，`reference/` 六篇与 v2 同名且已有对应内容，删除不丢数据；`sheet.py` 是横向拼条、`draw_sheet.py` 是网格拼图，接口不兼容，两者都保留。
- 15:45 同步引用：`Tool/smoke_test.py` 的 `SKILL` 路径改指新位置、docstring 去掉「Circle2」、`Doc/Cards/spec.md` 断链改指 `card-format.md`；新增 `SAMPLE`／`VIDEO` 存在性判断，缺 `Log/Circle2` 样本时相关项 SKIP 而非 FAIL（媒体不入库，新克隆必失败）；`chain/README.md`、`other/README.md` 删清单行；interactive 的 SKILL.md 更名说明改「已删除」并修正目录路径；card-experiment 的 SKILL.md 资产行九个→十三个脚本。
- 15:50 验证：`python Tool/smoke_test.py` → SMOKE PASS 5/5，`draw_sheet` SKIP（缺 `l4-v2.mp4`）；`check_utf8.py` 162 文件 bad=0；残留 `action-card-validation`／`card-experiment-v1` 仅 Log 历史记录；`git status` 173 项。
- 16:20 分层规则落地：新建 `Log/README.md`（历史留痕定位 + 脚本不保证可运行）；`RAG/README.md` 收缩为纯归档规则（删 6 处指向 Skill 的规范引用）；`Skill/meta/README.md` 规则 5 改为四层规则、清单加 `smoke-test/`。
- 16:30 Tool 清理：新建 `Skill/meta/smoke-test/`（SKILL.md + smoke_test.py + stub_runner.py）、`account.py` 迁 `Skill/hub/generation/runninghub/scripts/`；删 `Tool/anchor.py`、`matte.py`、`matte_models.py`。Tool 现只剩 `ffmpeg.py`、`setup_deps.py`、`README.md`。
- 16:40 同步：`Tool/README.md` 重写为「公共层」；`editing/README.md:16` 删 Log 脚本引用；`image-matte`／`pixel-anchor` 删薄壳说明；`models.md` 三条命令改技能内路径；`cost.md` P1 与 `card-experiment/SKILL.md` 资产行改指新位置。
- 16:50 验证：`python Skill/meta/smoke-test/scripts/smoke_test.py` → SMOKE PASS 5/5（draw_sheet SKIP）；Tool 目录只剩 3 个文件；`check_utf8.py` 164 文件 bad=0。
- 17:10 凭据收归 hub：新建 `Skill/hub/generation/runninghub/scripts/rh_credential.py`（唯一实现）与同目录 `credential.txt`（两份链的 key 经 hash 校验一致后复制）；两份链的 `scripts/credential.py` 改为 6 行转发；删 `chain/card-experiment/credential.txt`、`chain/shot-repaint/credential.txt`；新建 `credential.example.txt`；根 `.gitignore` 与 hub 局部 `.gitignore` 均排除 `credential.txt`。`account.py` 去掉读 `AGENTS.md` 找 key 的死逻辑（新版 AGENTS.md 已无 `#参数` 段），改走 hub 凭据。
- 17:20 引用同步：`hub/references/channels.md` §六、`card-experiment/reference/channels.md` §凭证、`api-key-setup.md` 头部统一为「唯一文件在 hub，链侧只转发」；`shot-repaint/reference/channel-i2v.md` 加 hub 指针、删与 hub 重复的积分表（保留本链实测 22 积分）；`.gitignore` 注释「移入 Tool/」改「移入 Skill/<技能>/scripts/」；`hub/README.md` 的 `convert/` 行去掉「二进制转发壳」说法。
- 17:30 工具入库：`Workspace/check_utf8.py` 迁 `Skill/meta/smoke-test/scripts/check_utf8.py`，改扫 `git status --porcelain`（含未跟踪）、去掉硬编码 README 清单；`SKILL.md` 补一行跑法。
- 17:35 验证：`check_utf8.py` 119 文件 bad=0；`smoke_test.py` 5/5；链与 hub 各测 `load_key()` 均取到 32 字符 key；`git check-ignore` 确认 hub 凭据被规则覆盖、模板不被忽略。
- 17:45 Doc 零出链补齐（用户「去掉，1不动」）：`Doc/驾驭工程/动作卡不限左右限逻辑.md:44` 的 `RAG/actions/.../card.md` 路径改为卡片名「防反·拨开推掌 v2 卡」；Doc 下 `Skill/`／`Tool/`／`Log/`／`RAG/` 前缀现为 0 匹配；`check_utf8.py` 119 文件 bad=0。
- 18:05 技能断 Log（用户「技能不要指向Log」）：smoke-test 样本从 `Log/Circle2/` 搬到 `Skill/meta/smoke-test/fixtures/`（`prompt.txt` 2721B + `card-v2.md` 2832B，随技能分发）；`draw_sheet` 改要 `fixtures/draw_sheet.mp4`（缺则 SKIP）；`cost.md` 与 interactive 两个 reference 的「证据见 Log/Circle4/Circle.md §N」改为不带路径的实跑表述；`ledger.py`／`new_chain.py` 示例路径改 `Log/Circle<N>`；`smoke_test.py` 剩两处文案去 Circle2／Circle7。
- 18:10 验证：`grep "Log/Circle[0-9]+" Skill/` → 0 匹配；`smoke_test.py` 5/5 PASS（prompt_consistency 改读 fixtures 后仍 PASS，输出文案改「fixtures v2 卡」）；`check_utf8.py` 119 文件 bad=0。保留：`Log/Circle<id>`／`<N>` 通配（写产物路径，非引用）与 44 处 `CircleN §M` 轮次标签（实测出处，不带路径）。
- 18:20 AGENTS.md 同步（用户「你帮我改」）：允许表删「`Skill/` → `Log/` 证据指针」、禁止表加「`Skill/` → `Log/`」、依赖图去 `──证据指针──▶ Log/` 并补「Skill 不读 Log 历史文件（产物可写入当轮 Log）」、分层表「向原料层取证」改「自带样本与判据」、Skill 细则补一句；顺手补上依赖图代码块缺失的结束符。
- 验证：`check_utf8.py` 119 文件 bad=0；`smoke_test.py` 5/5 PASS。
- 18:40 Doc 目录改名（用户「改成英文目录名」）：`Doc/驾驭工程/` → `Doc/harness/`（`git mv`，三篇随迁）；同步 4 处活引用：`AGENTS.md` Doc 细则、`Doc/harness/动作卡不限左右限逻辑.md:70`、`card-language.md` 四处。Doc 与 Skill 下「驾驭工程」0 匹配，残留仅在 Log 历史记录。`check_utf8.py` 119 文件 bad=0。
- 19:00 回调旧版文档（用户「使用 git 把老版本文档还放到 harness 下」）：`git checkout HEAD -- Doc/提示词工程.md Doc/工程管线.md` 后 `git mv` 进 `Doc/harness/`，git 判定为纯 rename（内容零改动）。harness 现 5 篇。
- 19:10 用户追问「是不是还有卡片工程」：`Doc/Cards/` 三份（spec.md、卡片工程总结.md、卡片族谱.md）同样 `git checkout` + `git mv` 进 `Doc/harness/Cards/`，纯 rename。harness 现 5 篇 + Cards 子目录 3 份。
- 19:15 坏链盘点：恢复的 5 篇共 16 处路径失效——7 处映射明确（`Doc/驾驭工程/`→`Doc/harness/`、`Doc/Cards/`→`Doc/harness/Cards/`、`Doc/提示词工程.md`→同目录）；9 处需定夺（旧技能名 `Skill/card-experiment-chain/` 4 处、已删的 `Tool/analyze.py` 2 处、已删的 `Doc/RunningHub/APP/README.md` 1 处、`RAG/` 8 处中的跨层项）。另剩 `Doc/RunningHub/` 两份（APP/README.md 23 行、价格调研 152 行）未恢复。
- 19:20 用户结束循环，未就坏链处置与双真相源方案作出选择；16 处坏链按原样入库，记入待优化。
