# RAG · 卡片库入库规则

> 本目录只收经过出图验证、并由用户口头确认的卡片。
> 未验收的草稿留在 `Doc/` 与 `Log/`，不进这里。

## 一、目录结构

每张卡一个目录：

```text
RAG/<type 复数>/
  └─ <卡片名>/
      ├─ card.md                  卡片本体，唯一真相，检索入口
      ├─ evidence.md              验收证据：运行时指纹 + 逐项判定
      ├─ prompt.txt               当次送验的 Prompt 原文
      ├─ 01-pass-<载体>.<png|mp4> 通过证据（图或成片），验收依据
      └─ 02-fail-<问题>.<png|mp4> 已知偏差图，可选
```

`type` 与子目录对应：`style → styles`、`figure → figures`，其余同此规则。

## 二、准入条件

> **2026-11-15 用户裁定：前两条停用，不再作为准入门槛。**
> `validate.ps1` 校验的是 `Doc/Cards` 旧规范（要求 frontmatter 含 `type`、name 以 `type-` 开头），与 `Skill/interactive-action-card-validation` 的「frontmatter 恰好 2 键」直接互斥；`check_prompt.py` 在仓库中不存在。两项均予停用，不删除、留档备查。

| 条件 | 说明 | 状态 |
| --- | --- | --- |
| 结构关 | `validate.ps1` PASS | **停用**（2026-11-15） |
| 编译自检 | `check_prompt.py` PASS，Prompt 短语与对应表双向穷举一致 | **停用**（2026-11-15） |
| 出图／出片验证 | 实跑出图或出片，逐项判定 | 有效 |
| 口头确认 | 用户明确说通过 | 有效 |

现行**两条缺一不可**：出图／出片验证、口头确认。停用的两条如需恢复，须用户单独发话。

## 三、证据必须可复现

`evidence.md` 必须包含运行时指纹，缺任意一项则证据无效：

| 项 | 说明 |
| --- | --- |
| 平台与应用 | 如 RunningHub / 全能图片G-2.0-文生图 |
| webappId | 应用标识 |
| 实例类型 | lite / default / plus |
| 出图时间 | 日期 |
| Task ID | 可回查 |
| 结果 URL | 原始地址 |
| Prompt | 文件名与段数 |
| 卡片 hash | card.md 的 SHA256 前 12 位 |

## 四、卡片版本与证据绑定

证据里的卡片 hash 是卡片的指纹。

**卡片任何一行改动，hash 即变，旧证据自动失效**，必须重跑出图并重新确认，不能沿用旧图。

这是防止「卡片 v3 配 v1 的图」的唯一手段。

计算命令：

```powershell
(Get-FileHash 'RAG/styles/<卡片名>/card.md' -Algorithm SHA256).Hash
```

## 五、图片命名

| 前缀 | 含义 | 是否可删 |
| --- | --- | --- |
| `pass-` | 验收依据 | 不可删 |
| `fail-` | 已知偏差，记录模型边界 | 可删，但等于丢掉一条边界知识 |

一张卡至少一张 `pass-`，`fail-` 只留代表性的一张。视频类证据沿用同一前缀（`01-pass-<载体>.mp4`），命名与图一致。

> **2026-11-15 起：图片与视频不入 git。** 根 `.gitignore` 已统一屏蔽图片／视频扩展名，`pass-` / `fail-` 图与成片只留在本地磁盘，随仓库克隆不会带过去。可复现的依据改为 `evidence.md` 里的运行时指纹（webappId、Task ID、卡片 hash、Prompt 快照）＋ `prompt.txt`，必要时按指纹重跑取回同一形状的证据。

## 六、单一真相源

`RAG` 里的 `card.md` 是唯一真相。`Doc/` 里那份是历史草稿，入库后必须在顶部标注「已入库」并指向本目录，避免两处各自演化。

若原件在工作日志目录（`Log/`）而非 `Doc/`，**不原地加标注**——加行会改 hash，库内 `card.md` 的指纹当场失效。改由入库日志（`Log/Circle<N>/Circle.md`）记录入库路径，并在 `evidence.md` 的「入库位置」一行留痕。

## 七、检索范围（暂缓）

索引只收 `card.md`，`evidence.md`、`prompt.txt`、图片均为附件，不参与语义检索。索引方案待建，本期不实施。