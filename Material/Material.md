# Material/ — 本地素材库

> 素材**实体**只存本机磁盘（`.gitignore` 排除）；**入库的只有账本、注册表与索引**。
> 本文件是入口，只回答"**该读哪一册**"，不写细则。
> 回链：[AGENTS.md §3.1](../AGENTS.md) · [Prototype 索引](../Prototype.md) · [工具 Tool/ops](../Tool/ops/ops.md)

```
Material/
├─ Material.md        # 入口（本文件）
├─ manifest.jsonl     # 总账：一行一条素材（唯一机器真源）
├─ kinds.json         # 素材类注册表：每类该长什么样（唯一机器真源）
├─ docs/              # 六册细则，按问题分
└─ <题材>/             # 例：影之刃零
   ├─ <题材>.md        # 题材索引（人读）
   ├─ 源片/            # 母带，<来源标识>_<短名>_<规格>
   └─ <素材类>/        # 例：处决镜头
```

## 我要干什么 → 读哪里

| 我要… | 读 | 或者直接跑 |
|---|---|---|
| 采/下载素材 | [`docs/入库操作.md`](docs/入库操作.md)「前置」 | `node Tool/ops/dl_bili_hd.mjs <BVID> out.mp4` |
| 把源片抽成素材 | [`docs/入库操作.md`](docs/入库操作.md)（五步） | `node Tool/ops/exec_extract.mjs export …` |
| 找某条素材 | [`<题材>/<题材>.md`](影之刃零/影之刃零.md) | `collect_material.mjs list --tag …` |
| 判断能不能发 | [`docs/授权与可发布.md`](docs/授权与可发布.md) | 该册「发布前怎么查」 |
| 新增一类素材 | [`docs/模板规范.md`](docs/模板规范.md) | 改 `kinds.json`，不改校验器 |
| 校验/看报错 | [`docs/校验口径.md`](docs/校验口径.md) | `node Tool/check/material_layout.mjs` |

## 铁律（只有 3 条）

1. **进目录必入账**——账本是唯一机器真源，`F7` 专抓"手放进去不登记"。
2. **授权必须落到 `license_class`**——自由文本判断不了能不能发，这条是发布门槛。
3. **实体搬动即改账本**——`archive --in-place` 重登记，否则 `F1` 悬空。

## 现状（2026-11-08）

- 1 个题材：`影之刃零`（处决镜头 46 单位 + 源片 1，批次 `loop44b_exec_rearchive`，620MB）
- 3 类注册：`源片` active / `处决镜头` active / `关键帧` declared（未迁入）
- 自检：`node Tool/check/material_layout.mjs` → `✓ 全部合规`
