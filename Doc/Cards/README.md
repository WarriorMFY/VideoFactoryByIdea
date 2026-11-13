# 卡片体系 · 索引

视频生成场景的卡片化知识库，供 RAG 检索与 Prompt 拼装使用。
**11 种卡片 · 4 大类 · 铁律：基础卡零外链。**

## 一、目录结构

| 目录 | 职责 |
| --- | --- |
| `00-spec/` | 元格式规范与引用契约，唯一权威定义 |
| `10-templates/` | 11 种卡片的元格式模板，`is_template: true`，禁止直接出图 |
| `20-assets/` | 基础资产实例：figures / faces / styles |
| `30-behavior/` | 行为表现实例：actions / cameras / voiceovers |
| `40-control/` | 系统控制实例：ui / time-scales / anti |
| `50-composite/` | 组合与生图：composites / prompt-lexicons |
| `90-cases/` | 贯穿多卡的综合实战用例 |

## 二、11 种卡片

| # | 卡片 | type | name 前缀 | 模板 |
| --- | --- | --- | --- | --- |
| 1 | 形象卡 | `figure` | `figure-` | `01-figure.template.md` |
| 2 | 脸部卡 | `face` | `face-` | `02-face.template.md` |
| 3 | 画风/意境卡 | `style` | `style-` | `03-style.template.md` |
| 4 | 动作卡 | `action` | `action-` | `04-action.template.md` |
| 5 | 镜头卡 | `camera` | `camera-` | `05-camera.template.md` |
| 6 | 旁白卡 | `voiceover` | `voiceover-` | `06-voiceover.template.md` |
| 7 | UI 提示卡 | `ui` | `ui-` | `07-ui.template.md` |
| 8 | 时间缩放卡 | `time-scale` | `time-scale-` | `08-time-scale.template.md` |
| 9 | 反向卡 | `anti` | `anti-` | `09-anti.template.md` |
| 10 | 联合卡 | `composite` | `composite-` | `10-composite.template.md` |
| 11 | 生图语义卡 | `prompt` | `prompt-` | `11-prompt.template.md` |

## 三、三条硬约束

1. **基础卡零外链**：1–9 号卡内不得出现任何其他卡名，实体一律写作角色位 `主体A` / `主体B`。
2. **type 等于 name 前缀**：`name` 必须以 `type + "-"` 开头，不符即视为无效卡。
3. **主表严格两列**：自变量轴 ↔ 因变量轴；补充信息只允许在其后追加至多两张两列表。

## 四、装配流程

1. 读取一张 `composite` 卡，解析其 `references` 九槽位。
2. 逐槽位校验：name 存在、type 与槽位匹配。
3. 按顺序合并：静态资产 → 表演层 → 时序层 → 质检层。
4. 产出 `prompt-final`，可直接投喂出图模型。

详见 `00-spec/reference-graph.md`。

## 五、新增一张卡

1. 从 `10-templates/` 选模板，复制到对应类目录。
2. 删除 `is_template` 行，`name` 改为 `<type>-<语义 slug>`。
3. 填满主表：无空位、无「略」、数值带量纲。
4. 跑该卡「校验」清单。
5. 若要参与场景，去 `50-composite/composites/` 建联合卡并登记 `references`。

## 六、自动化校验

| 命令 | 说明 |
| --- | --- |
| `powershell -NoProfile -File .\Doc\Cards\00-spec\validate.ps1` | 全量校验，失败时退出码 1 |

| 检查项 | 级别 |
| --- | --- |
| `type` 取值合法且等于 `name` 前缀 | FAIL |
| 实例卡 `name` 与文件名一致 | FAIL |
| 九类基础卡零外链 | FAIL |
| 表格严格两列 | FAIL |
| 实例卡无 `<>` 残留 | FAIL |
| `composite.references` 九槽位齐全、类型匹配 | FAIL |
| 表格行内出现审美判断词 | WARN |

模板卡（`is_template: true`）豁免：`name` 与文件名一致、必填槽位非空、`<>` 残留三项。