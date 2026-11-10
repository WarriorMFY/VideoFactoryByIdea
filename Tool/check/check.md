# Tool/check/ — 只读检查

| 脚本 | 检查什么 | 用法 |
|---|---|---|
| `material_layout.mjs` | 素材库模板合规：F1–F9 错误 + W1–W3 告警（注册表 `Material/kinds.json` 驱动） | `[--quiet] [--json]` |

## 判据速查

| 码 | 含义 |
|---|---|
| F1 | 账本条目指向的实体不存在 |
| F2 | 题材目录缺同名索引 `<题材>.md` |
| F3 | 单位编号不连续 / 三件套缺件 |
| F4 | 根目录清单件缺 / `catalog.csv` 行数 ≠ 单位数 |
| F5 | 缺 `index.html` 核对页 |
| F6 | 题材层缺 `源片/` 或命名不合规 |
| F7 | 有实体无账 / 账本 path 与 topic·kind 不一致 |
| F8 | 账本字段不合字典（缺 topic/kind、tier 越界、license_class 非法） |
| F9 | 素材类目录未在 `kinds.json` 注册 |

**退出码非零 = 有 F 级错误**；W 级只告警。加新素材类只改 `kinds.json`，不改代码。
